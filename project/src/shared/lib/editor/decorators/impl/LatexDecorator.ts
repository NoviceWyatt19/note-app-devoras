import katex from 'katex';
import { Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// Display math on a single line:  $$formula$$  (no `$` or newlines inside)
const DISPLAY_SINGLE_RE = /\$\$([^$\n]+?)\$\$/g;

// Inline math:  $formula$  — must NOT be adjacent `$$`
const INLINE_RE = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;

// Fence-style display math: line that is exactly `$$` (with optional trailing whitespace)
const DISPLAY_FENCE_RE = /^\$\$\s*$/;


// ---------------------------------------------------------------------------
// KaTeX widget helpers
// ---------------------------------------------------------------------------

function renderKatex(formula: string, displayMode: boolean): string {
  try {
    return katex.renderToString(formula, {
      throwOnError: false,
      displayMode,
      output: 'html',
    });
  } catch {
    // Graceful fallback: show raw formula in a styled span
    return `<span class="cm-math-error">${displayMode ? '$$' : '$'}${formula}${displayMode ? '$$' : '$'}</span>`;
  }
}

// ── Inline math widget ─────────────────────────────────────────────────────

class KatexInlineWidget extends WidgetType {
  constructor(readonly formula: string) {
    super();
  }

  eq(other: KatexInlineWidget): boolean {
    return this.formula === other.formula;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-math-widget-inline';
    span.contentEditable = 'false';
    span.innerHTML = renderKatex(this.formula, false);
    return span;
  }

  /** Allow mouse events to propagate */
  ignoreEvent(): boolean {
    return false;
  }
}

// ── Display math widget (single-line $$...$$ form) ────────────────────────

class KatexDisplayWidget extends WidgetType {
  constructor(readonly formula: string) {
    super();
  }

  eq(other: KatexDisplayWidget): boolean {
    return this.formula === other.formula;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-math-widget-display';
    span.style.display = 'inline-block';
    span.contentEditable = 'false';
    span.innerHTML = renderKatex(this.formula, true);
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ── Block display math widget (fence $$\n...\n$$ form) ────────────────────

class KatexBlockWidget extends WidgetType {
  constructor(readonly formula: string) {
    super();
  }

  eq(other: KatexBlockWidget): boolean {
    return this.formula === other.formula;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-math-widget-block';
    span.style.display = 'inline-block';
    span.style.width = '100%';
    span.contentEditable = 'false';
    span.innerHTML = renderKatex(this.formula, true);
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LatexDecorator
// ---------------------------------------------------------------------------

interface DR {
  from: number;
  to: number;
  deco: Decoration;
}

/**
 * Renders LaTeX math syntax inside the Write Mode editor using KaTeX.
 *
 * Supported patterns (all reveal raw markdown when cursor is inside the span):
 *
 *  - `$formula$`          → inline widget  (`katex displayMode: false`)
 *  - `$$formula$$`        → display widget on a single line
 *  - `$$\nformula\n$$`    → display widget spanning multiple lines (fence-style)
 *
 * KaTeX CSS must be imported at the app entry point:
 *   import 'katex/dist/katex.min.css';
 */
export class LatexDecorator implements SyntaxDecorator {
  readonly name = 'latex';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    const collected: DR[] = [];

    // ── 1. Fence-style display math  $$\n...\n$$  (multi-line) ──────────────
    // Scan lines for $$-only opener / closer
    let pos = from;
    let fenceFrom = -1;
    let fenceLines: string[] = [];

    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);

      if (DISPLAY_FENCE_RE.test(lineText)) {
        if (fenceFrom === -1) {
          // Opening fence
          fenceFrom = line.from;
          fenceLines = [];
        } else {
          // Closing fence — build the widget
          const fenceTo = line.to;
          const formula = fenceLines.join('\n').trim();
          if (formula) {
            const cursorInside = cursorHead >= fenceFrom && cursorHead <= fenceTo;
            if (!cursorInside) {
              collected.push({
                from: fenceFrom,
                to: fenceTo,
                deco: Decoration.replace({ widget: new KatexBlockWidget(formula), bidiIsolate: false }),
              });
            }
          }
          fenceFrom = -1;
          fenceLines = [];
        }
      } else if (fenceFrom !== -1) {
        fenceLines.push(lineText);
      }

      pos = line.to + 1;
    }
    // Reset if unclosed fence at viewport end
    fenceFrom = -1;

    // ── 2. Single-line display math  $$formula$$  ─────────────────────────
    pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = Math.max(line.from, from);
      const lineTo = Math.min(line.to, to);
      const lineText = doc.sliceString(lineFrom, lineTo);

      DISPLAY_SINGLE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DISPLAY_SINGLE_RE.exec(lineText)) !== null) {
        const s = lineFrom + m.index;
        const e = s + m[0].length;
        if (cursorHead >= s && cursorHead <= e) continue;
        collected.push({
          from: s,
          to: e,
          deco: Decoration.replace({ widget: new KatexDisplayWidget(m[1]), bidiIsolate: false }),
        });
      }

      pos = line.to + 1;
    }

    // ── 3. Inline math  $formula$  ────────────────────────────────────────
    pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = Math.max(line.from, from);
      const lineTo = Math.min(line.to, to);
      const lineText = doc.sliceString(lineFrom, lineTo);

      INLINE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = INLINE_RE.exec(lineText)) !== null) {
        const s = lineFrom + m.index;
        const e = s + m[0].length;
        if (cursorHead >= s && cursorHead <= e) continue;
        collected.push({
          from: s,
          to: e,
          deco: Decoration.replace({ widget: new KatexInlineWidget(m[1]), bidiIsolate: false }),
        });
      }

      pos = line.to + 1;
    }

    // Sort by `from`, skip overlapping ranges (display takes priority as it's added first)
    collected.sort((a, b) =>
      a.from !== b.from ? a.from - b.from : a.to - b.to,
    );

    const builder = new RangeSetBuilder<Decoration>();
    let lastTo = -1;
    for (const r of collected) {
      if (r.from >= lastTo) {
        builder.add(r.from, r.to, r.deco);
        lastTo = r.to;
      }
    }

    return builder.finish();
  }
}
