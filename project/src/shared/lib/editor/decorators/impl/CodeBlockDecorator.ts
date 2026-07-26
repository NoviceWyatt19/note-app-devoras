import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// Matches opening/closing code fences: ``` or ~~~
const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;

// Inline code: `code`  (single-line, non-empty content)
const INLINE_CODE_RE = /`([^`\n]+?)`/g;

const INLINE_CODE_MARK = Decoration.mark({ class: 'cm-inline-code' });
const CODE_BLOCK_MARK = Decoration.mark({ class: 'cm-code-block' });

/**
 * Decorates inline code (`code`) and code-fence blocks (``` ... ```).
 *
 * Inline code: applies `cm-inline-code` monospace / styled class.
 * Code blocks:  applies `cm-code-block` background to every line inside the fence.
 *
 * Limitation: if the viewport starts inside an open fence (fence start is
 * above the scroll position), that partial fence will not be styled.
 * A full-document pre-pass would be needed to resolve this; deferred.
 */
export class CodeBlockDecorator implements SyntaxDecorator {
  readonly name = 'code-block';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const builder = new RangeSetBuilder<Decoration>();

    let inFence = false;
    let fenceChar = '';

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = line.from;
      const lineTo = line.to;
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
        // Regular line — process inline code backticks
        INLINE_CODE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = INLINE_CODE_RE.exec(lineText)) !== null) {
          const s = lineFrom + m.index;
          const e = s + m[0].length;
          builder.add(s, e, INLINE_CODE_MARK);
        }
      }

      pos = line.to + 1;
    }

    return builder.finish();
  }
}
