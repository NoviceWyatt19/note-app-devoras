import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// Matches opening/closing code fences: ``` or ~~~
const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;

// Inline code: `code`  (single-line, non-empty content)
const INLINE_CODE_RE = /`([^`\n]+?)`/g;

// inclusive: false prevents typing at the edges from being absorbed into the mark span.
// BUG-20260810-04: Added inclusive: false to fix cursor-trapping at span boundaries.
const INLINE_CODE_MARK = Decoration.mark({ class: 'cm-inline-code', inclusive: false });
const CODE_BLOCK_MARK  = Decoration.mark({ class: 'cm-code-block' });

/**
 * Decorates inline code (`code`) and code-fence blocks (``` ... ```).
 *
 * Inline code: applies `cm-inline-code` monospace / styled class.
 *   - Cursor INSIDE the backtick span → raw backticks revealed for editing.
 *   - Cursor OUTSIDE → styled, backtick markers hidden via Decoration.replace.
 * Code blocks:  applies `cm-code-block` background to every line inside the fence.
 *   - Active line (cursor on that line) → no replace; raw text visible.
 *
 * Limitation: if the viewport starts inside an open fence (fence start is
 * above the scroll position), that partial fence will not be styled.
 * A full-document pre-pass would be needed to resolve this; deferred.
 */
export class CodeBlockDecorator implements SyntaxDecorator {
  readonly name = 'code-block';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    // Use selection HEAD so a collapsed cursor triggers marker reveal.
    const cursorHead = view.state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();

    let inFence = false;
    let fenceChar = '';

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = line.from;
      const lineTo   = line.to;
      const lineText = doc.sliceString(lineFrom, lineTo);

      const fenceMatch = FENCE_OPEN_RE.exec(lineText);
      if (fenceMatch) {
        const markerChar = fenceMatch[1][0]; // '`' or '~'
        if (!inFence) {
          // Opening fence line
          inFence = true;
          fenceChar = markerChar;
          builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
        } else if (markerChar === fenceChar) {
          // Closing fence line — matches the same character as opener
          inFence = false;
          fenceChar = '';
          builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
        } else {
          // Fence-like line inside a fence (different marker) — treat as content
          builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
        }
      } else if (inFence) {
        // Content line inside a code fence
        builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
      } else {
        // Regular line — process inline code backticks.
        // BUG-20260810-04: Cursor-aware rendering.
        // If cursor is inside the backtick span [s, e], reveal raw text instead.
        INLINE_CODE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = INLINE_CODE_RE.exec(lineText)) !== null) {
          const s = lineFrom + m.index;
          const e = s + m[0].length;

          // Cursor is inside or adjacent to the span → show raw backticks
          if (cursorHead >= s && cursorHead <= e) {
            // No decoration — raw markdown text is visible for editing
            continue;
          }

          // Cursor is outside → hide the surrounding backticks, style content.
          // Replace the opening ` and closing ` with invisible ranges,
          // and apply cm-inline-code to the inner text only.
          builder.add(s,     s + 1, Decoration.replace({})); // hide opening `
          builder.add(s + 1, e - 1, INLINE_CODE_MARK);       // style content
          builder.add(e - 1, e,     Decoration.replace({})); // hide closing `
        }
      }

      pos = line.to + 1;
    }

    return builder.finish();
  }
}
