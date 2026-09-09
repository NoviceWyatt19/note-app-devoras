import { Decoration, DecorationSet, WidgetType, ViewPlugin, EditorView, keymap } from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSetBuilder, Prec } from '@codemirror/state';
import { SyntaxDecorator } from '../types';
import { renderTableMarkdown } from '@/shared/lib/markdown/tableMarked';

// ---------------------------------------------------------------------------
// GFM pipe-table parsing helpers
// ---------------------------------------------------------------------------

const DELIM_CELL_RE = /^:?-+:?$/;

/** A single cell's trimmed text plus its exact document offsets, so a
 *  rendered cell can be mapped back to the precise range to edit in place.
 *  `padFrom`/`padTo` cover the whole region between the surrounding pipes
 *  (padding included) — writing there keeps `| a | b |` spacing tidy even
 *  when the old content was empty, where `from === to`. */
interface CellSpan {
  text: string;
  from: number;
  to: number;
  padFrom: number;
  padTo: number;
}

/** Splits a single table row into cells, honoring `\|` as an escaped pipe,
 *  and tracks each cell's trimmed source range. `lineFrom` is the document
 *  offset of the row's first character (pass 0 for offset-agnostic parsing). */
function parseRowCells(lineFrom: number, lineText: string): CellSpan[] {
  // Mirror `line.trim()` semantics while keeping absolute offsets.
  let start = 0;
  let end = lineText.length;
  while (start < end && /\s/.test(lineText[start])) start++;
  while (end > start && /\s/.test(lineText[end - 1])) end--;

  if (lineText[start] === '|') start++;
  if (end > start && lineText[end - 1] === '|' && lineText[end - 2] !== '\\') end--;

  const spans: CellSpan[] = [];
  let cellStart = start;
  const push = (cellEnd: number) => {
    const raw = lineText.slice(cellStart, cellEnd);
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const from = lineFrom + cellStart + lead;
    spans.push({
      text: raw.trim(),
      from,
      to: Math.max(from, lineFrom + cellEnd - trail),
      padFrom: lineFrom + cellStart,
      padTo: lineFrom + cellEnd,
    });
  };

  let i = start;
  while (i < end) {
    if (lineText[i] === '\\' && lineText[i + 1] === '|') {
      i += 2;
      continue;
    }
    if (lineText[i] === '|') {
      push(i);
      cellStart = i + 1;
    }
    i++;
  }
  push(end);
  return spans;
}

/** String-only convenience wrapper over `parseRowCells`. */
function parseRow(line: string): string[] {
  return parseRowCells(0, line).map((c) => c.text);
}

function serializeRow(cells: string[]): string {
  return '| ' + cells.join(' | ') + ' |';
}

function isDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !/[-:]/.test(trimmed)) return false;
  const cells = parseRow(trimmed);
  return cells.length > 0 && cells.every((c) => DELIM_CELL_RE.test(c));
}

interface TableBlock {
  from: number;
  to: number;
  /** End of the header line — where the pinned-raw "switch to preview" affordance anchors. */
  headerTo: number;
  raw: string;
  headerCells: CellSpan[];
  /** One entry per body row, in document order — used to map a rendered
   *  `<td>`/`<th>` back to the exact source range for in-place cell editing. */
  bodyRows: CellSpan[][];
}

/** Scans the whole block for consecutive header+delimiter(+body) line groups. */
function scanTables(state: EditorState): TableBlock[] {
  const { doc } = state;
  const tables: TableBlock[] = [];
  let i = 1;

  while (i <= doc.lines) {
    const headerLine = doc.line(i);

    if (headerLine.text.includes('|') && i + 1 <= doc.lines) {
      const delimLine = doc.line(i + 1);

      if (isDelimiterRow(delimLine.text)) {
        const headerCells = parseRowCells(headerLine.from, headerLine.text);
        const delimCells = parseRow(delimLine.text);

        if (headerCells.length > 0 && headerCells.length === delimCells.length) {
          let j = i + 2;
          let lastLine = delimLine;
          const bodyRows: CellSpan[][] = [];

          while (j <= doc.lines) {
            const bodyLine = doc.line(j);
            if (bodyLine.text.trim() === '' || !bodyLine.text.includes('|')) break;
            bodyRows.push(parseRowCells(bodyLine.from, bodyLine.text));
            lastLine = bodyLine;
            j++;
          }

          tables.push({
            from: headerLine.from,
            to: lastLine.to,
            headerTo: headerLine.to,
            raw: doc.sliceString(headerLine.from, lastLine.to),
            headerCells,
            bodyRows,
          });

          i = j;
          continue;
        }
      }
    }

    i++;
  }

  return tables;
}

/** Appends an empty cell to every row (`---` on the delimiter row). */
function addColumnToTableText(raw: string): string {
  return raw
    .split('\n')
    .map((line, idx) => {
      const cells = parseRow(line);
      cells.push(idx === 1 ? '---' : '');
      return serializeRow(cells);
    })
    .join('\n');
}

/** Drops the last cell from every row. Returns null if only one column remains. */
function removeColumnFromTableText(raw: string): string | null {
  const lines = raw.split('\n');
  if (parseRow(lines[0]).length <= 1) return null;

  return lines
    .map((line) => {
      const cells = parseRow(line);
      cells.pop();
      return serializeRow(cells);
    })
    .join('\n');
}

/** Drops the last body row (header + delimiter are never removed this way).
 *  Returns null if there's no body row left to remove. */
function removeLastRowFromTableText(raw: string): string | null {
  const lines = raw.split('\n');
  if (lines.length <= 2) return null; // only header + delimiter
  return lines.slice(0, -1).join('\n');
}

// ---------------------------------------------------------------------------
// Enter-to-add-row
// ---------------------------------------------------------------------------

/**
 * Pressing Enter while the caret sits inside a table (its logical document
 * position, whether or not raw text is currently shown) appends a new empty
 * row instead of inserting a bare newline — typing `|` characters by hand and
 * backspacing them into position is the exact friction this replaces. Always
 * appends at the very end of the table (there's no notion of "current row"
 * once the caret can sit inside a fully-collapsed preview widget), and moves
 * the caret to the end of the new row so repeated Enters keep adding rows.
 */
export function insertTableRowOnEnter(view: EditorView): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  if (!state.selection.main.empty) return false;

  const table = scanTables(state).find((t) => pos >= t.from && pos <= t.to);
  if (!table) return false;

  const columnCount = parseRow(state.doc.lineAt(table.from).text).length;
  const insertText = '\n' + serializeRow(new Array(columnCount).fill(''));

  view.dispatch({
    changes: { from: table.to, to: table.to, insert: insertText },
    selection: { anchor: table.to + insertText.length },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Arrow-key entry
// ---------------------------------------------------------------------------

/**
 * A table's rendered widget replaces its whole multi-line range with one
 * opaque block, so from CodeMirror's layout perspective it's a single unit —
 * default vertical motion from the line just outside it jumps straight past
 * to the far side instead of landing inside. These redirect that one specific
 * case (moving into a table's very first/last line) so arrow-key navigation
 * can enter a table at all; every other vertical motion falls through
 * (returns false) to CodeMirror's normal line-up/line-down handling.
 */
export function enterTableOnArrowDown(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  const nextFrom = line.to + 1;
  if (nextFrom > state.doc.length) return false;

  const table = scanTables(state).find((t) => t.from === nextFrom);
  if (!table) return false;

  view.dispatch({ selection: { anchor: table.from } });
  // The caret itself is invisible inside the replaced widget, so entering the
  // table means focusing a real cell — otherwise the key press looks like a
  // no-op and the next one jumps clean over the table.
  focusTableCell(view, table.from, 0, 0);
  return true;
}

export function enterTableOnArrowUp(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  if (line.from === 0) return false;
  const prevTo = line.from - 1;

  const table = scanTables(state).find((t) => t.to === prevTo);
  if (!table) return false;

  view.dispatch({ selection: { anchor: table.to } });
  focusTableCell(view, table.from, table.bodyRows.length, 0);
  return true;
}

// `@codemirror/lang-markdown`'s `markdown()` support registers its own Enter
// binding (`insertNewlineContinueMarkup`, for list/blockquote continuation) at
// `Prec.high` — a plain `keymap.of(...)` is `Prec.default` and never gets a
// turn at Enter regardless of array position, so this must outrank it.
export const tableKeymap = Prec.highest(
  keymap.of([
    { key: 'Enter', run: insertTableRowOnEnter },
    { key: 'ArrowDown', run: enterTableOnArrowDown },
    { key: 'ArrowUp', run: enterTableOnArrowUp },
  ]),
);

// ---------------------------------------------------------------------------
// Pinned "raw view" state — lets the toolbar force a table open in source
// form even while the caret sits elsewhere.
// ---------------------------------------------------------------------------

export const toggleTableRawEffect = StateEffect.define<number>();

const EMPTY_SET: ReadonlySet<number> = new Set();

export const pinnedRawTablesField = StateField.define<ReadonlySet<number>>({
  create: () => EMPTY_SET,
  update(value, tr) {
    let next = value;

    if (tr.docChanged && next.size > 0) {
      const mapped = new Set<number>();
      for (const pos of next) mapped.add(tr.changes.mapPos(pos));
      next = mapped;
    }

    for (const effect of tr.effects) {
      if (effect.is(toggleTableRawEffect)) {
        const updated = new Set(next);
        if (updated.has(effect.value)) updated.delete(effect.value);
        else updated.add(effect.value);
        next = updated;
      }
    }

    return next;
  },
});

// ---------------------------------------------------------------------------
// Header-column toggle — purely a Write Mode preview embellishment (styles
// each row's first cell like a header, mirroring Google Docs/Sheets' "header
// column" option). GFM has no syntax for this, so it isn't written to the
// document and Read Mode won't show it; it resets when the app restarts.
// ---------------------------------------------------------------------------

export const toggleColumnHeaderEffect = StateEffect.define<number>();

export const columnHeaderTablesField = StateField.define<ReadonlySet<number>>({
  create: () => EMPTY_SET,
  update(value, tr) {
    let next = value;

    if (tr.docChanged && next.size > 0) {
      const mapped = new Set<number>();
      for (const pos of next) mapped.add(tr.changes.mapPos(pos));
      next = mapped;
    }

    for (const effect of tr.effects) {
      if (effect.is(toggleColumnHeaderEffect)) {
        const updated = new Set(next);
        if (updated.has(effect.value)) updated.delete(effect.value);
        else updated.add(effect.value);
        next = updated;
      }
    }

    return next;
  },
});

/** Converts each body row's first `<td>` into a `<th scope="row">` so it picks
 *  up the same `.rv-content th` styling as the header row. Operates on an
 *  already-sanitized HTML string via a detached element, so it's safe. */
function applyColumnHeaderStyling(tableHtml: string): string {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = tableHtml;
  const rows = wrapper.querySelectorAll('tbody > tr');
  rows.forEach((tr) => {
    const firstCell = tr.firstElementChild;
    if (!firstCell || firstCell.tagName !== 'TD') return;
    const th = document.createElement('th');
    th.setAttribute('scope', 'row');
    const align = firstCell.getAttribute('align');
    if (align) th.setAttribute('align', align);
    th.innerHTML = firstCell.innerHTML;
    firstCell.replaceWith(th);
  });
  return wrapper.innerHTML;
}

// ---------------------------------------------------------------------------
// TableDecorator
// ---------------------------------------------------------------------------

/**
 * Renders GFM pipe tables in Write Mode as the same HTML table Read Mode shows
 * (via the shared `renderTableMarkdown` helper), matching visual output 1:1.
 *
 * Unlike most decorators in this directory, the rendered widget does NOT
 * revert to raw markdown just because the caret passes through the table's
 * range — placing/moving the caret there (e.g. via a click, or landing there
 * after `insertTableRowOnEnter`) must not interrupt the preview. Raw text is
 * shown only while the table is explicitly toggled open via the toolbar (see
 * `pinnedRawTablesField`); this is a deliberate exception to the "hide markup
 * unless you're editing it" contract other decorators follow, because a
 * table's raw form is multi-line and far less readable than its rendering.
 */
export class TableDecorator implements SyntaxDecorator {
  readonly name = 'table';

  createDecorations(state: EditorState): DecorationSet {
    const tables = scanTables(state);
    if (tables.length === 0) return Decoration.none;

    const pinned = state.field(pinnedRawTablesField, false) ?? EMPTY_SET;
    const columnHeaders = state.field(columnHeaderTablesField, false) ?? EMPTY_SET;

    const builder = new RangeSetBuilder<Decoration>();
    for (const table of tables) {
      const isPinned = pinned.has(table.from);

      if (isPinned) {
        // A table pinned open has no rendered widget (and thus no toolbar) to
        // unpin from — anchor a small "switch to preview" affordance at the
        // end of the header line so the pin is always reversible.
        builder.add(
          table.headerTo,
          table.headerTo,
          Decoration.widget({ widget: new UnpinRawWidget(table.from), side: 1 }),
        );
        continue;
      }

      const widget = new TableWidget(
        table.raw,
        table.from,
        table.to,
        columnHeaders.has(table.from),
        table.headerCells,
        table.bodyRows,
      );
      builder.add(table.from, table.to, Decoration.replace({ widget, bidiIsolate: false }));
    }

    return builder.finish();
  }
}

// ---------------------------------------------------------------------------
// Widget + DOM-event → CodeMirror transaction wiring
// ---------------------------------------------------------------------------

/** Small inline icon appended after a pinned table's header line, since the
 *  preview widget (and its toolbar) doesn't exist while pinned open. */
class UnpinRawWidget extends WidgetType {
  constructor(readonly pos: number) {
    super();
  }

  eq(other: UnpinRawWidget): boolean {
    return other.pos === this.pos;
  }

  toDOM(): HTMLElement {
    const btn = document.createElement('button');
    btn.title = '미리보기로 전환';
    btn.className =
      'cm-table-unpin-btn ml-1.5 p-0.5 rounded text-slate-500 hover:text-primary hover:bg-white/10 ' +
      'cursor-pointer inline-flex items-center justify-center align-middle';
    btn.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>';
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      btn.dispatchEvent(new CustomEvent('table-toggle-raw', { bubbles: true, detail: { pos: this.pos } }));
    });
    return btn;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const ICONS = {
  raw: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
  addCol:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="16" rx="1"></rect><rect x="14" y="4" width="7" height="16" rx="1" stroke-dasharray="3 2"></rect><line x1="17.5" y1="9" x2="17.5" y2="15"></line><line x1="14.5" y1="12" x2="20.5" y2="12"></line></svg>',
  removeCol:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="16" rx="1"></rect><rect x="14" y="4" width="7" height="16" rx="1" stroke-dasharray="3 2"></rect><line x1="14.5" y1="12" x2="20.5" y2="12"></line></svg>',
  removeRow:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="7" rx="1"></rect><rect x="4" y="14" width="16" height="7" rx="1" stroke-dasharray="3 2"></rect><line x1="9" y1="17.5" x2="15" y2="17.5"></line></svg>',
  columnHeader:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>',
  kebab:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg>',
};

/** Where a cell sits in the rendered grid (row 0 is the header row). */
interface CellCoord {
  tableFrom: number;
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
}

/** Re-finds a table's widget in the live DOM after a rebuild and focuses one
 *  of its cells. Runs on the next frame because a dispatch that changes the
 *  document replaces the whole widget element. */
function focusTableCell(view: EditorView, tableFrom: number, row: number, col: number): void {
  requestAnimationFrame(() => {
    const container = view.dom.querySelector(`.cm-table-widget[data-table-from="${tableFrom}"]`);
    const cell = container?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
    cell?.focus();
  });
}

/** Appends an empty row to the table that currently starts at `tableFrom`,
 *  re-reading its bounds from the live state so it is safe to call right
 *  after another dispatch has shifted them. */
function appendEmptyRow(view: EditorView, tableFrom: number): boolean {
  const table = scanTables(view.state).find((t) => t.from === tableFrom);
  if (!table) return false;
  const insert = '\n' + serializeRow(new Array(table.headerCells.length).fill(''));
  view.dispatch({ changes: { from: table.to, to: table.to, insert } });
  return true;
}

/** A table row is a single line of markdown, so an in-cell line break can only
 *  be stored as `<br>`. The editor shows it as a real newline and converts on
 *  the way in and out. Bare `|` is escaped so a typed pipe can't split the row. */
function cellSourceToEditor(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n');
}

function editorToCellSource(value: string): string {
  return value
    .split('\n')
    .map((part) => part.trim())
    .join('<br>')
    .replace(/(?<!\\)\|/g, '\\|')
    .trim();
}

/**
 * Replaces a rendered cell's content with a `<textarea>` pre-filled with its
 * raw source text (not the rendered HTML), so the user can see exactly which
 * cell is active and type into it directly. Committing replaces just that
 * cell's exact source range; the resulting doc change rebuilds the whole
 * widget, so focus has to be re-established through `focusTableCell`.
 *
 * Enter commits and moves down a row — and on the last row it appends a new
 * one and lands in it, which is the "Enter adds a row" behaviour asked for.
 * Shift+Enter inserts a line break inside the cell. Escape cancels without
 * touching the document.
 */
function startCellEdit(
  view: EditorView,
  cellEl: HTMLElement,
  span: CellSpan,
  coord: CellCoord,
  seed?: string,
): void {
  if (cellEl.querySelector('.cm-table-cell-input')) return;

  const original = cellEl.innerHTML;
  cellEl.classList.add('cm-table-cell-editing');
  cellEl.textContent = '';

  const input = document.createElement('textarea');
  input.className = 'cm-table-cell-input';
  input.rows = 1;
  input.value = seed ?? cellSourceToEditor(span.text);

  const autoGrow = () => {
    input.rows = input.value.split('\n').length;
  };
  autoGrow();

  let settled = false;

  /** `next` says where focus should land once the edit is resolved. */
  const finish = (commit: boolean, next: 'stay' | 'down') => {
    if (settled) return;
    settled = true;

    const nextSource = editorToCellSource(input.value);
    const changed = commit && nextSource !== span.text;
    if (changed) {
      // Rewrite the whole inter-pipe region so spacing stays `| value |`
      // regardless of what the cell held before (an empty cell has a
      // zero-width text range, which would otherwise yield `|  value|`).
      view.dispatch({
        changes: { from: span.padFrom, to: span.padTo, insert: ` ${nextSource} ` },
      });
    } else {
      cellEl.classList.remove('cm-table-cell-editing');
      cellEl.innerHTML = original;
    }

    if (next === 'down') {
      const isLastRow = coord.row >= coord.rowCount - 1;
      if (isLastRow) {
        if (appendEmptyRow(view, coord.tableFrom)) {
          focusTableCell(view, coord.tableFrom, coord.rowCount, 0);
          return;
        }
      }
      focusTableCell(view, coord.tableFrom, Math.min(coord.row + 1, coord.rowCount - 1), coord.col);
      return;
    }

    if (changed) focusTableCell(view, coord.tableFrom, coord.row, coord.col);
    else cellEl.focus();
  };

  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => {
    // Every key stays inside this input — CodeMirror binds Enter and the arrow
    // keys, and this widget's own grid navigation listens one level up.
    e.stopPropagation();
    if (e.key === 'Enter' && e.shiftKey) {
      // Let the textarea insert the newline itself; it becomes `<br>` on commit.
      requestAnimationFrame(autoGrow);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      finish(true, 'down');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false, 'stay');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finish(true, 'stay');
      const nextCol = coord.col + 1;
      if (nextCol < coord.colCount) focusTableCell(view, coord.tableFrom, coord.row, nextCol);
      else focusTableCell(view, coord.tableFrom, Math.min(coord.row + 1, coord.rowCount - 1), 0);
    }
  });
  input.addEventListener('blur', () => finish(true, 'stay'));

  cellEl.appendChild(input);
  input.focus();
  if (seed === undefined) input.select();
}

class TableWidget extends WidgetType {
  constructor(
    readonly raw: string,
    readonly from: number,
    readonly to: number,
    readonly columnHeader: boolean,
    readonly headerCells: CellSpan[],
    readonly bodyRows: CellSpan[][],
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return this.raw === other.raw && this.columnHeader === other.columnHeader;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'rv-content cm-table-widget group relative';
    // Every other widget in this directory does this: without it the rendered
    // table inherits `contenteditable` from CodeMirror's content DOM, so the
    // browser puts its own caret inside cells and native editing fights both
    // the cell editors and CodeMirror's document model.
    container.contentEditable = 'false';
    container.dataset.tableFrom = String(this.from);
    container.style.display = 'block';
    container.style.width = '100%';
    container.style.margin = '0.5rem 0';

    let html = renderTableMarkdown(this.raw);
    if (this.columnHeader) html = applyColumnHeaderStyling(html);
    container.innerHTML = html;

    const rowCount = 1 + this.bodyRows.length;
    const colCount = this.headerCells.length;
    const coordOf = (row: number, col: number): CellCoord => ({
      tableFrom: this.from,
      row,
      col,
      rowCount,
      colCount,
    });

    const attachCell = (cellEl: Element | undefined, span: CellSpan | undefined, row: number, col: number) => {
      if (!cellEl || !span) return;
      const el = cellEl as HTMLElement;
      el.classList.add('cm-table-cell');
      el.tabIndex = -1;
      el.dataset.row = String(row);
      el.dataset.col = String(col);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startCellEdit(view, el, span, coordOf(row, col));
      });
    };

    container.querySelectorAll('thead th').forEach((el, i) => attachCell(el, this.headerCells[i], 0, i));
    container.querySelectorAll('tbody tr').forEach((rowEl, rIdx) => {
      const cells = this.bodyRows[rIdx];
      if (!cells) return;
      Array.from(rowEl.children).forEach((cellEl, cIdx) => attachCell(cellEl, cells[cIdx], rIdx + 1, cIdx));
    });

    // ── Grid keyboard navigation (a focused cell, not an open editor) ───────
    const focusAt = (row: number, col: number) => {
      container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)?.focus();
    };
    const leaveTable = (direction: 'up' | 'down') => {
      const anchor =
        direction === 'up'
          ? Math.max(0, this.from - 1)
          : Math.min(view.state.doc.length, this.to + 1);
      view.dispatch({ selection: { anchor } });
      view.focus();
    };

    container.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      // The open cell editor owns its own keys (including Shift+Enter).
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;

      const cell = target.closest<HTMLElement>('[data-row]');
      if (!cell) return;
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);

      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      switch (e.key) {
        case 'ArrowDown':
          handled();
          if (row + 1 < rowCount) focusAt(row + 1, col);
          else leaveTable('down');
          return;
        case 'ArrowUp':
          handled();
          if (row > 0) focusAt(row - 1, col);
          else leaveTable('up');
          return;
        case 'ArrowRight':
          handled();
          if (col + 1 < colCount) focusAt(row, col + 1);
          else if (row + 1 < rowCount) focusAt(row + 1, 0);
          return;
        case 'ArrowLeft':
          handled();
          if (col > 0) focusAt(row, col - 1);
          else if (row > 0) focusAt(row - 1, colCount - 1);
          return;
        case 'Enter': {
          handled();
          const span = row === 0 ? this.headerCells[col] : this.bodyRows[row - 1]?.[col];
          if (span) startCellEdit(view, cell, span, coordOf(row, col));
          return;
        }
        case 'Escape':
          handled();
          leaveTable('down');
          return;
        default:
          break;
      }

      // Typing a printable character opens the cell seeded with that character.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        handled();
        const span = row === 0 ? this.headerCells[col] : this.bodyRows[row - 1]?.[col];
        if (span) startCellEdit(view, cell, span, coordOf(row, col), e.key);
      }
    });

    const menuHost = document.createElement('div');
    menuHost.className = 'absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity';

    const kebab = document.createElement('button');
    kebab.title = '표 옵션';
    kebab.className =
      'p-1 rounded text-mutedText hover:text-primary hover:bg-white/10 cursor-pointer flex items-center justify-center bg-darkPanel/90 border border-white/10';
    kebab.innerHTML = ICONS.kebab;

    const menu = document.createElement('div');
    menu.className =
      'hidden absolute top-full right-0 mt-1 min-w-[9.5rem] py-1 rounded-md shadow-2xl ' +
      'bg-darkPanel border border-white/10 flex flex-col z-10';

    const closeMenu = () => {
      menu.classList.add('hidden');
      document.removeEventListener('mousedown', onDocMouseDown, true);
    };
    const onDocMouseDown = (e: MouseEvent) => {
      if (!menuHost.contains(e.target as Node)) closeMenu();
    };

    const makeItem = (label: string, svg: string, eventName: string, detail: Record<string, number>) => {
      const item = document.createElement('button');
      item.className =
        'flex items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/10 hover:text-primary cursor-pointer whitespace-nowrap';
      item.innerHTML = `<span class="shrink-0">${svg}</span><span>${label}</span>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeMenu();
        item.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail }));
      });
      return item;
    };

    menu.appendChild(makeItem('원본 마크다운 보기/편집', ICONS.raw, 'table-toggle-raw', { pos: this.from }));
    menu.appendChild(makeItem('열 추가', ICONS.addCol, 'table-add-column', { from: this.from, to: this.to }));
    menu.appendChild(makeItem('열 삭제', ICONS.removeCol, 'table-remove-column', { from: this.from, to: this.to }));
    menu.appendChild(makeItem('행 삭제', ICONS.removeRow, 'table-remove-row', { from: this.from, to: this.to }));
    menu.appendChild(
      makeItem(
        this.columnHeader ? '세로 헤더 해제' : '세로 헤더',
        ICONS.columnHeader,
        'table-toggle-column-header',
        { pos: this.from },
      ),
    );

    kebab.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const isHidden = menu.classList.contains('hidden');
      if (isHidden) {
        menu.classList.remove('hidden');
        document.addEventListener('mousedown', onDocMouseDown, true);
      } else {
        closeMenu();
      }
    });

    menuHost.appendChild(kebab);
    menuHost.appendChild(menu);
    container.appendChild(menuHost);

    // Fallback for the margin around the table itself — cells and buttons stop
    // propagation, so this only fires for the container's own padding.
    container.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      container.dispatchEvent(new CustomEvent('table-click', { bubbles: true, detail: { pos: this.from } }));
    });

    return container;
  }

  /** This widget handles its own mouse and keyboard interaction; CodeMirror
   *  must not also react to events originating inside it. */
  ignoreEvent(): boolean {
    return true;
  }
}

export const tableInteractionPlugin = [
  pinnedRawTablesField,
  columnHeaderTablesField,
  ViewPlugin.fromClass(
    class {
      constructor(private view: EditorView) {
        view.dom.addEventListener('table-click', this.onClick as EventListener);
        view.dom.addEventListener('table-toggle-raw', this.onToggleRaw as EventListener);
        view.dom.addEventListener('table-add-column', this.onAddColumn as EventListener);
        view.dom.addEventListener('table-remove-column', this.onRemoveColumn as EventListener);
        view.dom.addEventListener('table-remove-row', this.onRemoveRow as EventListener);
        view.dom.addEventListener('table-toggle-column-header', this.onToggleColumnHeader as EventListener);
      }

      destroy() {
        this.view.dom.removeEventListener('table-click', this.onClick as EventListener);
        this.view.dom.removeEventListener('table-toggle-raw', this.onToggleRaw as EventListener);
        this.view.dom.removeEventListener('table-add-column', this.onAddColumn as EventListener);
        this.view.dom.removeEventListener('table-remove-column', this.onRemoveColumn as EventListener);
        this.view.dom.removeEventListener('table-remove-row', this.onRemoveRow as EventListener);
        this.view.dom.removeEventListener('table-toggle-column-header', this.onToggleColumnHeader as EventListener);
      }

      onClick = (e: CustomEvent) => {
        const pos = e.detail?.pos;
        if (typeof pos !== 'number') return;
        this.view.dispatch({ selection: { anchor: pos } });
        this.view.focus();
      };

      onToggleRaw = (e: CustomEvent) => {
        const pos = e.detail?.pos;
        if (typeof pos !== 'number') return;

        const wasPinned = this.view.state.field(pinnedRawTablesField).has(pos);
        if (wasPinned) {
          // Turning preview back on. The orchestrator only rebuilds decorations on
          // docChanged/selection/IME effects, so a same-value selection is included
          // purely to force a rebuild without actually moving the caret.
          this.view.dispatch({
            effects: toggleTableRawEffect.of(pos),
            selection: this.view.state.selection,
          });
        } else {
          // Turning raw editing on — move the caret in so typing works immediately.
          this.view.dispatch({
            effects: toggleTableRawEffect.of(pos),
            selection: { anchor: pos },
          });
        }
        this.view.focus();
      };

      onAddColumn = (e: CustomEvent) => {
        const { from, to } = e.detail ?? {};
        if (typeof from !== 'number' || typeof to !== 'number') return;
        const raw = this.view.state.sliceDoc(from, to);
        this.view.dispatch({ changes: { from, to, insert: addColumnToTableText(raw) } });
        this.view.focus();
      };

      onRemoveColumn = (e: CustomEvent) => {
        const { from, to } = e.detail ?? {};
        if (typeof from !== 'number' || typeof to !== 'number') return;
        const raw = this.view.state.sliceDoc(from, to);
        const next = removeColumnFromTableText(raw);
        if (next === null) return;
        this.view.dispatch({ changes: { from, to, insert: next } });
        this.view.focus();
      };

      onRemoveRow = (e: CustomEvent) => {
        const { from, to } = e.detail ?? {};
        if (typeof from !== 'number' || typeof to !== 'number') return;
        const raw = this.view.state.sliceDoc(from, to);
        const next = removeLastRowFromTableText(raw);
        if (next === null) return;
        this.view.dispatch({ changes: { from, to, insert: next } });
        this.view.focus();
      };

      onToggleColumnHeader = (e: CustomEvent) => {
        const pos = e.detail?.pos;
        if (typeof pos !== 'number') return;
        this.view.dispatch({
          effects: toggleColumnHeaderEffect.of(pos),
          selection: this.view.state.selection,
        });
        this.view.focus();
      };
    },
  ),
];
