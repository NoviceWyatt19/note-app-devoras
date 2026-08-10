import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const BLOCKQUOTE_RE = /^>\s+(.*)$/;
const HIDE_DECO = Decoration.replace({});

export class BlockquoteDecorator implements SyntaxDecorator {
  readonly name = 'blockquote';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const cursorHead = view.state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = BLOCKQUOTE_RE.exec(lineText);

      if (match) {
        const mark = Decoration.mark({ class: 'cm-blockquote', inclusive: false });
        const markerEnd = line.from + 2; // "> "

        // Cursor-aware: if cursor is on this line, don't hide marker
        if (line.number === doc.lineAt(cursorHead).number) {
            builder.add(line.from, line.to, Decoration.mark({ class: 'cm-blockquote' }));
        } else {
            // BUG-20260810-05: same-line guard
            if (markerEnd <= line.to) {
                builder.add(line.from, markerEnd, HIDE_DECO);
                builder.add(markerEnd, line.to, mark);
            } else {
                builder.add(line.from, line.to, mark);
            }
        }
      }
      pos = line.to + 1;
    }
    return builder.finish();
  }
}
