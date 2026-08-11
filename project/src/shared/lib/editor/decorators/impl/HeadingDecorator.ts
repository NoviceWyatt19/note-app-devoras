import { Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

class HeadingBadgeWidget extends WidgetType {
  constructor(public level: number) { super(); }
  toDOM() {
    const badge = document.createElement('span');
    badge.className = `cm-heading-badge cm-heading-badge-${this.level}`;
    badge.style.display = 'inline';
    badge.contentEditable = 'false';
    badge.textContent = `H${this.level}`;
    return badge;
  }
  eq(other: HeadingBadgeWidget): boolean { return this.level === other.level; }
  ignoreEvent() { return false; }
}

export class HeadingDecorator implements SyntaxDecorator {
  readonly name = 'heading';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = HEADING_RE.exec(lineText);

      if (match) {
        const level = match[1].length;
        const mark = Decoration.mark({ class: `cm-heading cm-h${level}`, inclusive: false });
        
        const markerEnd = line.from + level + 1; // '#'s + space

        // Cursor-aware: if cursor is on this line, don't hide marker
        if (line.number === doc.lineAt(cursorHead).number) {
            builder.add(line.from, line.to, Decoration.mark({ class: `cm-heading cm-h${level}` }));
        } else {
            // BUG-20260810-05: same-line guard
            if (markerEnd <= line.to) {
                const badgeDeco = Decoration.replace({ widget: new HeadingBadgeWidget(level), bidiIsolate: false });
                builder.add(line.from, markerEnd, badgeDeco);
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
