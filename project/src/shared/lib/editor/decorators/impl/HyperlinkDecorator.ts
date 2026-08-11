import { Decoration, DecorationSet } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// Matches [link text](url) — single-line, no nested brackets
const LINK_RE = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;

const HIDE_DECO = Decoration.replace({});
// inclusive: false prevents edge-typing from expanding the link text mark.
// BUG-20260810-04: Added to fix cursor-trapping at span boundaries.
const LINK_MARK = Decoration.mark({ class: 'cm-md-link-text', inclusive: false });

interface DR {
  from: number;
  to: number;
  deco: Decoration;
}

/**
 * Applies WYSIWYG-like decoration to markdown hyperlinks `[text](url)`:
 *
 * - Cursor OUTSIDE the span → `[` and `](url)` markers are hidden;
 *   the link text is rendered with `cm-md-link-text` (indigo underline).
 * - Cursor INSIDE the span  → raw markdown revealed for editing.
 */
export class HyperlinkDecorator implements SyntaxDecorator {
  readonly name = 'hyperlink';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    const ranges: DR[] = [];

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = Math.max(line.from, from);
      const lineTo = Math.min(line.to, to);
      const text = doc.sliceString(lineFrom, lineTo);

      LINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = LINK_RE.exec(text)) !== null) {
        // Absolute positions in the document
        const matchStart = lineFrom + m.index;
        const textEnd    = matchStart + 1 + m[1].length;
        const matchEnd   = matchStart + m[0].length;

        // BUG-20260810-05: same-line guard — Decoration.replace must not span newlines.
        if (matchEnd > doc.lineAt(matchStart).to) continue;
        // BUG-20260810-04: reveal raw markdown when cursor is anywhere inside the link span
        if (cursorHead >= matchStart && cursorHead <= matchEnd) continue;

        ranges.push({ from: matchStart,    to: matchStart + 1, deco: HIDE_DECO }); // hide '['
        ranges.push({ from: matchStart + 1, to: textEnd,       deco: LINK_MARK }); // style text
        ranges.push({ from: textEnd,        to: matchEnd,      deco: HIDE_DECO }); // hide '](url)'
      }

      pos = line.to + 1;
    }

    // Sort by from — required for RangeSetBuilder
    ranges.sort((a, b) =>
      a.from !== b.from ? a.from - b.from : a.to - b.to,
    );

    const builder = new RangeSetBuilder<Decoration>();
    let lastTo = -1;
    for (const r of ranges) {
      if (r.from >= lastTo) {
        builder.add(r.from, r.to, r.deco);
        lastTo = r.to;
      }
    }

    return builder.finish();
  }
}
