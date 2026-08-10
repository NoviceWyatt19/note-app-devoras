import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { SyntaxDecorator } from '../types';

const BLOCKQUOTE_RE = /^>\s+(.*)$/;
const HIDE_DECO = Decoration.replace({});

export class BlockquoteDecorator implements SyntaxDecorator {
  readonly name = 'blockquote';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const cursorHead = view.state.selection.main.head;
    
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

        const markerEnd = line.from + 2; // "> "

        // Add line decoration to style the entire block
        ranges.push({ 
          from: line.from, 
          to: line.from, 
          deco: Decoration.line({ class: `cm-blockquote-line ${blockClass}` }) 
        });

        // Cursor-aware: if cursor is on this line, don't hide marker
        if (line.number !== doc.lineAt(cursorHead).number) {
            // BUG-20260810-05: same-line guard
            if (markerEnd <= line.to) {
                ranges.push({ from: line.from, to: markerEnd, deco: HIDE_DECO });
                // We can also add a mark for the inner text if needed, but the line class might be enough.
                // If we need the inner text to be styled, we can mark it.
                ranges.push({ from: markerEnd, to: line.to, deco: Decoration.mark({ class: 'cm-blockquote-text' }) });
            }
        }
      }
      pos = line.to + 1;
    }

    // Let CodeMirror handle the complex sorting (from, to, startSide) automatically
    return Decoration.set(ranges.map(r => r.deco.range(r.from, r.to)), true);
  }
}
