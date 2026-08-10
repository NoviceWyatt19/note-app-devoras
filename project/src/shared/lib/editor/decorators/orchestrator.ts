import { Extension, RangeSet } from '@codemirror/state';
import { DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { SyntaxDecorator } from './types';

// ---------------------------------------------------------------------------
// Internal orchestrator class
// ---------------------------------------------------------------------------

/**
 * Central ViewPlugin that drives all registered SyntaxDecorators.
 *
 * On every view update it calls each decorator's `createDecorations` for the
 * current viewport range, then merges the results with `RangeSet.join` so that
 * CodeMirror receives a single, coherent DecorationSet.
 *
 * ## IME / Composition Policy
 * A rebuild is blocked by two independent signals:
 *
 * - CodeMirror's `view.composing`, which protects the normal transaction path.
 * - A DOM `compositionstart`/`compositionend` latch, which remains true through
 *   WebKit's transient `view.composing === false` reports during Korean IME
 *   preedit updates.
 *
 * The latch is deliberately cleared only after `compositionend`; rebuilding is
 * then deferred one task so the final committed document and selection are both
 * stable before any `Decoration.replace` or widget can be introduced.
 */
class DecorationOrchestrator implements PluginValue {
  decorations: DecorationSet;
  private domComposing = false;
  private rebuildPending = false;
  private compositionEndTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly editorView: EditorView;

  constructor(
    view: EditorView,
    private readonly decorators: readonly SyntaxDecorator[],
  ) {
    this.editorView = view;
    this.decorations = this.buildAll(view);
    // Capture phase makes the DOM latch active before CodeMirror processes the
    // same composition event and emits its ViewUpdate.
    view.contentDOM.addEventListener('compositionstart', this.onCompositionStart, true);
    view.contentDOM.addEventListener('compositionend', this.onCompositionEnd, true);
  }

  update(upd: ViewUpdate): void {
    // Do not let a selection/doc update toggle marker visibility while the DOM
    // still owns a preedit string. `domComposing` covers WebKit's false-negative
    // `view.composing` pulses; `view.composing` covers platforms that do not
    // deliver DOM composition events in the expected order.
    if (this.domComposing || upd.view.composing) {
      // BUG-20260810-06: Even while composing, if the document changed we MUST
      // map existing decorations to the new coordinates via upd.changes.
      // Without this, stale offsets from the previous doc layout remain and
      // cause "Decorations that replace line breaks" RangeErrors when CodeMirror
      // tries to apply them against the updated document.
      if (upd.docChanged) {
        this.decorations = this.decorations.map(upd.changes);
      }
      this.rebuildPending = true;
      return;
    }

    // Rebuild on document edit, viewport change, or cursor move.
    // Cursor move is included so that bold/italic markers reveal themselves
    // when the user's caret enters the marked span.
    if (this.rebuildPending || upd.docChanged || upd.viewportChanged || upd.selectionSet) {
      this.decorations = this.buildAll(upd.view);
      this.rebuildPending = false;
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.compositionEndTimer !== null) clearTimeout(this.compositionEndTimer);
    this.editorView.contentDOM.removeEventListener(
      'compositionstart',
      this.onCompositionStart,
      true,
    );
    this.editorView.contentDOM.removeEventListener('compositionend', this.onCompositionEnd, true);
  }

  private readonly onCompositionStart = (): void => {
    this.domComposing = true;
    if (this.compositionEndTimer !== null) {
      clearTimeout(this.compositionEndTimer);
      this.compositionEndTimer = null;
    }
  };

  private readonly onCompositionEnd = (): void => {
    this.rebuildPending = true;

    // `compositionend` can precede CodeMirror's final input transaction. Run
    // after that transaction. Keeping the latch set until this task also
    // blocks the final event's selection/doc ViewUpdate from rebuilding early.
    this.compositionEndTimer = setTimeout(() => {
      this.compositionEndTimer = null;
      if (this.destroyed) return;
      this.domComposing = false;
      // Force a no-op view update so the plugin performs exactly one rebuild
      // with committed offsets.
      this.editorView.dispatch({});
    }, 0);
  };

  private buildAll(view: EditorView): DecorationSet {
    if (this.decorators.length === 0) return RangeSet.empty;
    const { from, to } = view.viewport;

    const sets = this.decorators.map((d) => {
      try {
        return d.createDecorations(view, from, to);
      } catch (err) {
        // Isolate failures — one broken decorator must not crash the editor
        console.warn(`[Orchestrator] Decorator "${d.name}" threw:`, err);
        return RangeSet.empty as DecorationSet;
      }
    });

    // RangeSet.join merges multiple sorted sets into one, preserving all ranges
    return RangeSet.join(sets);
  }
}

// ---------------------------------------------------------------------------
// Base theme for classes emitted by the built-in decorators
// ---------------------------------------------------------------------------

const decorationBaseTheme = EditorView.baseTheme({
  // Strikethrough mark
  '&.cm-editor .cm-strikethrough': {
    textDecoration: 'line-through',
    opacity: '0.65',
  },

  // Inline code  (`code`)
  '&.cm-editor .cm-inline-code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.88em',
    backgroundColor: 'rgba(99,102,241,0.14)',
    color: '#a5b4fc',
    padding: '0.05em 0.3em',
    borderRadius: '3px',
  },

  // Code-fence block line background
  '&.cm-editor .cm-code-block': {
    backgroundColor: 'rgba(0,0,0,0.22)',
    display: 'block',
  },

  // Inline math  $...$  (visual hint; replaced by KaTeX widget when rendered)
  '&.cm-editor .cm-math-inline': {
    color: '#f0abfc',
    fontStyle: 'italic',
    backgroundColor: 'rgba(168,85,247,0.10)',
    padding: '0.05em 0.25em',
    borderRadius: '3px',
  },

  // Display math  $$...$$
  '&.cm-editor .cm-math-display': {
    color: '#f0abfc',
    display: 'block',
    textAlign: 'center',
    padding: '0.2em 0',
  },

  // KaTeX inline widget container
  '&.cm-editor .cm-math-widget-inline': {
    display: 'inline-block',
    verticalAlign: 'middle',
    cursor: 'text',
  },

  // KaTeX display widget container (single-line $$...$$)
  '&.cm-editor .cm-math-widget-display': {
    display: 'block',
    textAlign: 'center',
    padding: '0.5em 1em',
    cursor: 'text',
  },

  // KaTeX block widget container (fence-style $$\n...\n$$)
  '&.cm-editor .cm-math-widget-block': {
    display: 'block',
    textAlign: 'center',
    padding: '0.75em 1em',
    backgroundColor: 'rgba(168,85,247,0.05)',
    borderRadius: '6px',
    cursor: 'text',
  },

  // Fallback for parse/render errors
  '&.cm-editor .cm-math-error': {
    color: '#f87171',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.85em',
  },

  // Interactive checkbox widget  - [ ] / - [x]
  '& .cm-checkbox': {
    cursor: 'pointer',
    accentColor: '#6366f1',
    verticalAlign: 'middle',
    marginRight: '0.35em',
    width: '13px',
    height: '13px',
  },

  // Hyperlink text  [text](url)  — markers hidden, text styled
  '&.cm-editor .cm-md-link-text': {
    color: '#818cf8',
    textDecoration: 'underline',
    textDecorationColor: 'rgba(129,140,248,0.45)',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
});

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Creates a CodeMirror `Extension` that wires up all provided decorators
 * through the central orchestrator.
 *
 * Usage in BlockEditor:
 * ```ts
 * const decorationPlugin = createDecorationPlugin([
 *   new BoldItalicDecorator(),
 *   new StrikethroughDecorator(),
 *   // To add new syntax: just append a new instance here
 * ]);
 * EditorState.create({ extensions: [..., decorationPlugin] });
 * ```
 */
export function createDecorationPlugin(decorators: SyntaxDecorator[]): Extension {
  const plugin = ViewPlugin.define((view) => new DecorationOrchestrator(view, decorators), {
    decorations: (p) => p.decorations,
  });
  return [plugin, decorationBaseTheme];
}
