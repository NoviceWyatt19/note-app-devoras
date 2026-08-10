import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// **bold** — non-greedy, single-line, no bare * inside
const BOLD_RE = /\*\*([^*\n]+?)\*\*/g;

// *italic* — must NOT be part of **bold** markers
// Negative lookbehind/lookahead to exclude adjacent *
const ITALIC_RE = /(?<!\*)\*([^*\n]+?)\*(?!\*)/g;

// ---------------------------------------------------------------------------
// Reusable decoration instances (immutable — safe to reuse across ranges)
// ---------------------------------------------------------------------------

// inclusive: false prevents typing at span edges from being absorbed into the mark.
// BUG-20260810-04: Added to fix edge-typing cursor trap.
const HIDE_DECO  = Decoration.replace({});
const BOLD_MARK  = Decoration.mark({ class: 'cm-strong',  inclusive: false });
const ITALIC_MARK = Decoration.mark({ class: 'cm-em',     inclusive: false });

// ---------------------------------------------------------------------------
// Internal range accumulator
// ---------------------------------------------------------------------------

interface DR {
  from: number;
  to: number;
  deco: Decoration;
}

// ---------------------------------------------------------------------------
// BoldItalicDecorator
// ---------------------------------------------------------------------------

/**
 * Applies WYSIWYG-like bold/italic decoration to the editor:
 *
 * - `**bold**`   → the `**` markers are hidden, content is styled `cm-strong`
 * - `*italic*`   → the `*` markers are hidden, content is styled `cm-em`
 * - When the cursor enters a span, markers are revealed so the user can edit.
 */
export class BoldItalicDecorator implements SyntaxDecorator {
  readonly name = 'bold-italic';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    // Use selection HEAD so that a collapsed cursor triggers marker reveal
    const cursorHead = view.state.selection.main.head;

    const ranges: DR[] = [];

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = Math.max(line.from, from);
      const lineTo = Math.min(line.to, to);
      const text = doc.sliceString(lineFrom, lineTo);

      // ── Bold ──────────────────────────────────────────────────────────────
      BOLD_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = BOLD_RE.exec(text)) !== null) {
        const s = lineFrom + m.index;
        const e = s + m[0].length;
        // If the cursor is anywhere inside the span, reveal raw markers
        if (cursorHead >= s && cursorHead <= e) continue;

        ranges.push({ from: s,     to: s + 2, deco: HIDE_DECO });   // hide **
        ranges.push({ from: s + 2, to: e - 2, deco: BOLD_MARK });   // style content
        ranges.push({ from: e - 2, to: e,     deco: HIDE_DECO });   // hide **
      }

      // ── Italic ─────────────────────────────────────────────────────────────
      ITALIC_RE.lastIndex = 0;
      while ((m = ITALIC_RE.exec(text)) !== null) {
        const s = lineFrom + m.index;
        const e = s + m[0].length;
        if (cursorHead >= s && cursorHead <= e) continue;

        ranges.push({ from: s,     to: s + 1, deco: HIDE_DECO });   // hide *
        ranges.push({ from: s + 1, to: e - 1, deco: ITALIC_MARK }); // style content
        ranges.push({ from: e - 1, to: e,     deco: HIDE_DECO });   // hide *
      }

      pos = line.to + 1;
    }

    // RangeSetBuilder requires ranges in ascending `from` order.
    // Sort by from; when from is equal, shorter ranges first (replace before mark).
    ranges.sort((a, b) =>
      a.from !== b.from ? a.from - b.from : a.to - b.to,
    );

    // Build — skip any range that overlaps with an already-added one.
    // This cleanly handles malformed markdown where bold/italic patterns overlap.
    const builder = new RangeSetBuilder<Decoration>();
    let lastTo = -1;
    for (const r of ranges) {
      if (r.from >= lastTo) {
        builder.add(r.from, r.to, r.deco);
        lastTo = r.to;
      }
    }

    return builder.finish();
  }
}
