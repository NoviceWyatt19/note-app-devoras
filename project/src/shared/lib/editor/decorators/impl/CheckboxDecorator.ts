import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// Matches "- [ ] " or "- [x] " with optional leading spaces/tabs
const CHECKBOX_RE = /^([ \t]*)(- \[([ x])\] ?)/;

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
 *
 * BUG-20260810-04: Cursor-aware — when the cursor is on the checkbox line,
 * the replace decoration is skipped so the user can edit raw markdown.
 */
export class CheckboxDecorator implements SyntaxDecorator {
  readonly name = 'checkbox';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    // Active line: the line that contains the cursor head.
    const cursorHead = view.state.selection.main.head;
    const activeLine = doc.lineAt(cursorHead).number;

    const builder = new RangeSetBuilder<Decoration>();

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = CHECKBOX_RE.exec(lineText);

      if (match) {
        // BUG-20260810-04: Cursor on this line → reveal raw markdown for editing.
        if (line.number === activeLine) {
          pos = line.to + 1;
          continue;
        }

        const indentLength = match[1].length;
        const checked = match[3] === 'x';
        const bracketFrom = line.from + indentLength + 2;
        const matchEnd = line.from + indentLength + match[2].length;

        // BUG-20260810-05: same-line guard — Decoration.replace must not span newlines.
        if (matchEnd > line.to) {
          pos = line.to + 1;
          continue;
        }

        if (matchEnd <= line.to) {
          builder.add(
            line.from + indentLength,
            matchEnd,
            Decoration.replace({ widget: new CheckboxWidget(checked, bracketFrom), bidiIsolate: false }),
          );
        }
      }

      pos = line.to + 1;
    }

    return builder.finish();
  }
}
