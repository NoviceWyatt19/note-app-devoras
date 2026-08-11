import { Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const HR_RE = /^(\s*)(---|___|\*\*\*)(\s*)$/;

class HRWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-hr-widget';
    span.style.display = 'inline-block';
    span.style.width = '100%';
    span.contentEditable = 'false';
    // inner line
    const line = document.createElement('span');
    line.className = 'cm-hr-line';
    span.appendChild(line);
    return span;
  }
  eq(_other: HRWidget): boolean { return true; }
  ignoreEvent() { return false; }
}

export class HorizontalRuleDecorator implements SyntaxDecorator {
  readonly name = 'hr';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = HR_RE.exec(lineText);

      if (match) {
        if (line.number === doc.lineAt(cursorHead).number) {
            // cursor is on this line, don't replace
            builder.add(line.from, line.to, Decoration.mark({ class: 'cm-hr-raw' }));
        } else {
            // BUG-20260810-05: same-line guard. Since we replace the whole line content,
            // we use line.from to line.to which is safe and doesn't include '\n'.
            builder.add(line.from, line.to, Decoration.replace({ widget: new HRWidget(), bidiIsolate: false }));
        }
      }
      pos = line.to + 1;
    }
    return builder.finish();
  }
}
