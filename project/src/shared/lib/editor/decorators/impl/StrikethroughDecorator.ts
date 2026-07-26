import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const STRIKETHROUGH_RE = /~~([^~\n]+?)~~/g;

// Applies cm-strikethrough to the full ~~...~~ span (markers are kept visible).
// The CSS class is defined in the orchestrator's base theme.
const STRIKE_MARK = Decoration.mark({ class: 'cm-strikethrough' });

export class StrikethroughDecorator implements SyntaxDecorator {
  readonly name = 'strikethrough';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const builder = new RangeSetBuilder<Decoration>();

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = Math.max(line.from, from);
      const lineTo = Math.min(line.to, to);
      const text = doc.sliceString(lineFrom, lineTo);

      STRIKETHROUGH_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = STRIKETHROUGH_RE.exec(text)) !== null) {
        const s = lineFrom + m.index;
        const e = s + m[0].length;
        builder.add(s, e, STRIKE_MARK);
      }

      pos = line.to + 1;
    }

    return builder.finish();
  }
}
