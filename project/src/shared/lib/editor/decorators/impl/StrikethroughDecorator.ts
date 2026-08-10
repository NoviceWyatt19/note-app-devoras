import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const STRIKETHROUGH_RE = /~~([^~\n]+?)~~/g;

// inclusive: false prevents edge-typing from expanding the mark span.
// BUG-20260810-04: Added cursor-aware reveal and inclusive: false.
const STRIKE_MARK = Decoration.mark({ class: 'cm-strikethrough', inclusive: false });
const HIDE_DECO   = Decoration.replace({});

/**
 * Applies WYSIWYG-like strikethrough decoration.
 *
 * - Cursor OUTSIDE span → `~~` markers hidden, content styled with cm-strikethrough.
 * - Cursor INSIDE span  → raw `~~...~~` revealed for editing.
 */
export class StrikethroughDecorator implements SyntaxDecorator {
  readonly name = 'strikethrough';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const cursorHead = view.state.selection.main.head;

    interface DR { from: number; to: number; deco: Decoration; }
    const ranges: DR[] = [];

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = Math.max(line.from, from);
      const lineTo   = Math.min(line.to, to);
      const text = doc.sliceString(lineFrom, lineTo);

      STRIKETHROUGH_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = STRIKETHROUGH_RE.exec(text)) !== null) {
        const s = lineFrom + m.index;
        const e = s + m[0].length;

        // Cursor inside span → reveal raw markdown
        if (cursorHead >= s && cursorHead <= e) continue;

        ranges.push({ from: s,     to: s + 2, deco: HIDE_DECO   }); // hide ~~
        ranges.push({ from: s + 2, to: e - 2, deco: STRIKE_MARK }); // style content
        ranges.push({ from: e - 2, to: e,     deco: HIDE_DECO   }); // hide ~~
      }

      pos = line.to + 1;
    }

    ranges.sort((a, b) => a.from !== b.from ? a.from - b.from : a.to - b.to);

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
