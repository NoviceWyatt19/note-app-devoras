import { Decoration, DecorationSet } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// Matches opening/closing code fences: ``` or ~~~
const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;

// Inline code: `code`  (single-line, non-empty content)
// [^`\n] explicitly excludes newlines — Strict Regex per BUG-20260810-05
const INLINE_CODE_RE = /`([^`\n]+?)`/g;

// inclusive: false prevents edge-typing from expanding the mark span (BUG-20260810-04)
const INLINE_CODE_MARK = Decoration.mark({ class: 'cm-inline-code', inclusive: false });
const CODE_BLOCK_MARK  = Decoration.mark({ class: 'cm-code-block' });

/**
 * Decorates inline code (`code`) and code-fence blocks (``` ... ```).
 *
 * BUG-20260810-05 Safety contract:
 *   All Decoration.replace calls are guarded by a same-line check.
 *   `to <= doc.lineAt(from).to` ensures no replace ever spans a newline,
 *   which would trigger CodeMirror's "Decorations that replace line breaks"
 *   RangeError and destroy the tiling engine.
 */
export class CodeBlockDecorator implements SyntaxDecorator {
  readonly name = 'code-block';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
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
        const markerChar = fenceMatch[1][0];
        if (!inFence) {
          inFence = true;
          fenceChar = markerChar;
          builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
        } else if (markerChar === fenceChar) {
          inFence = false;
          fenceChar = '';
          builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
        } else {
          builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
        }
      } else if (inFence) {
        builder.add(lineFrom, lineTo, CODE_BLOCK_MARK);
      } else {
        // Regular line — cursor-aware inline code decoration.
        INLINE_CODE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = INLINE_CODE_RE.exec(lineText)) !== null) {
          const s = lineFrom + m.index;
          const e = s + m[0].length;

          // BUG-20260810-05: Same-line guard.
          // Decoration.replace must never span a newline (CodeMirror hard constraint).
          // The regex already prevents \n in the match, but guard defensively.
          if (e > line.to) continue;

          // Cursor-aware (BUG-20260810-04): reveal raw markdown when cursor is inside
          if (cursorHead >= s && cursorHead <= e) continue;

          // Cursor outside → hide backticks via replace, style content with mark.
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
