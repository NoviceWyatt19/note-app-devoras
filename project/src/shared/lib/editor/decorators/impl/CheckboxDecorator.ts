import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// Matches "- [ ] " or "- [x] " at the very start of a line
const CHECKBOX_RE = /^(- \[([ x])\] ?)/;

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class CheckboxWidget extends WidgetType {
  constructor(
    /** Whether the checkbox is currently checked */
    readonly checked: boolean,
    /** Document offset of '[' in the `[ ]` / `[x]` token */
    readonly bracketFrom: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.bracketFrom === other.bracketFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this.checked;
    cb.className = 'cm-checkbox';

    // Toggling the checkbox rewrites `[ ]` ↔ `[x]` in the document
    cb.addEventListener('change', () => {
      view.dispatch({
        changes: {
          from: this.bracketFrom,
          to: this.bracketFrom + 3,           // length of '[ ]' or '[x]'
          insert: cb.checked ? '[x]' : '[ ]',
        },
      });
    });

    wrap.appendChild(cb);
    return wrap;
  }

  /** Allow mouse events so the checkbox click reaches the change handler */
  ignoreEvent(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CheckboxDecorator
// ---------------------------------------------------------------------------

/**
 * Replaces `- [ ]` / `- [x]` list items with an interactive HTML checkbox.
 * Clicking the checkbox in the editor toggles the `[x]` / `[ ]` in-place.
 */
export class CheckboxDecorator implements SyntaxDecorator {
  readonly name = 'checkbox';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const builder = new RangeSetBuilder<Decoration>();

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = CHECKBOX_RE.exec(lineText);

      if (match) {
        const checked = match[2] === 'x';
        // "- [" → '[' is at index 2 relative to line start
        const bracketFrom = line.from + 2;
        const matchEnd = line.from + match[1].length;

        builder.add(
          line.from,
          matchEnd,
          Decoration.replace({ widget: new CheckboxWidget(checked, bracketFrom) }),
        );
      }

      pos = line.to + 1;
    }

    return builder.finish();
  }
}
