import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

const HR_RE = /^(\s*)(---|___|\*\*\*)(\s*)$/;

class HRWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('span');
    hr.className = 'cm-hr-widget';
    hr.style.display = 'inline-block';
    hr.style.width = '100%';
    // inner line
    const line = document.createElement('span');
    line.className = 'cm-hr-line';
    hr.appendChild(line);
    return hr;
  }
  ignoreEvent() { return false; }
}

export class HorizontalRuleDecorator implements SyntaxDecorator {
  readonly name = 'hr';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const cursorHead = view.state.selection.main.head;
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
            builder.add(line.from, line.to, Decoration.replace({ widget: new HRWidget() }));
        }
      }
      pos = line.to + 1;
    }
    return builder.finish();
  }
}
