import { Decoration, DecorationSet } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const HIDE_DECO = Decoration.replace({});

export class BlockquoteDecorator implements SyntaxDecorator {
  readonly name = 'blockquote';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    
    interface DR { from: number; to: number; deco: Decoration; }
    const ranges: DR[] = [];

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = BLOCKQUOTE_RE.exec(lineText);

      if (match) {
        let isPrevBq = false;
        if (line.number > 1) {
            isPrevBq = BLOCKQUOTE_RE.test(doc.line(line.number - 1).text);
        }

        let isNextBq = false;
        if (line.number < doc.lines) {
            isNextBq = BLOCKQUOTE_RE.test(doc.line(line.number + 1).text);
        }

        let blockClass = 'cm-blockquote-single';
        if (isPrevBq && isNextBq) blockClass = 'cm-blockquote-middle';
        else if (isPrevBq) blockClass = 'cm-blockquote-bottom';
        else if (isNextBq) blockClass = 'cm-blockquote-top';

        const markerEnd = line.from + (lineText.startsWith('> ') ? 2 : 1);

        // Add line decoration to style the entire block
        ranges.push({ 
          from: line.from, 
          to: line.from, 
          deco: Decoration.line({ class: `cm-blockquote-line ${blockClass}` }) 
        });

        // Hide marker if cursor is NOT on this line
        if (line.number !== doc.lineAt(cursorHead).number) {
            if (markerEnd <= line.to) {
                ranges.push({ from: line.from, to: markerEnd, deco: HIDE_DECO });
            }
        }
      }
      pos = line.to + 1;
    }

    ranges.sort((a, b) => a.from - b.from);

    const builder = new RangeSetBuilder<Decoration>();
    for (const r of ranges) {
      builder.add(r.from, r.to, r.deco);
    }

    return builder.finish();
  }
}
