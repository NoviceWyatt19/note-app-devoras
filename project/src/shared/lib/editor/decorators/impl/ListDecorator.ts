import { Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

class BulletWidget extends WidgetType {
  constructor(public text: string) { super(); }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-list-bullet';
    span.style.display = 'inline';
    span.contentEditable = 'false';
    span.textContent = this.text;
    return span;
  }
  eq(other: BulletWidget): boolean { return this.text === other.text; }
  ignoreEvent() { return false; }
}

export class ListDecorator implements SyntaxDecorator {
  readonly name = 'list';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = LIST_RE.exec(lineText);

      // exclude checkbox
      const isCheckbox = /^(\s*[-*+]\s+\[[ x]\]\s+)/.test(lineText);

      if (match && !isCheckbox) {
        const indent = match[1];
        const marker = match[2];
        const markerStart = line.from + indent.length;
        const markerEnd = markerStart + marker.length + 1; // including space

        if (line.number === doc.lineAt(cursorHead).number) {
            // active line, reveal raw
            builder.add(line.from, line.to, Decoration.mark({ class: 'cm-list-item-raw' }));
        } else {
            const isOrdered = /^\d+\.$/.test(marker);
            const bulletText = isOrdered ? marker : '•';
            
            // BUG-20260810-05: same-line guard
            if (markerEnd <= line.to) {
                builder.add(markerStart, markerEnd, Decoration.replace({ widget: new BulletWidget(bulletText), bidiIsolate: false }));
                builder.add(markerEnd, line.to, Decoration.mark({ class: 'cm-list-item' }));
            }
        }
      }
      pos = line.to + 1;
    }
    return builder.finish();
  }
}
