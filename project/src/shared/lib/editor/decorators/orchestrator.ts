import { Extension } from '@codemirror/state';
import { RangeSet } from '@codemirror/state';
import {
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
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
 */
class DecorationOrchestrator implements PluginValue {
  decorations: DecorationSet;

  /**
   * True while an IME composition session is in progress.
   *
   * During Korean (and other CJK) input on macOS/Windows the browser fires
   * `compositionstart` before each syllable is confirmed and `compositionend`
   * after the user commits (via Space, Enter, or arrow key). While composing
   * we must NOT rebuild decorations because any `Decoration.replace` that
   * overlaps the preedit text would erase the in-progress syllable.
   */
  private isComposing = false;

  // We must track the DOM element so we can remove the listeners on destroy.
  private contentDOM: HTMLElement | null = null;
  private readonly onCompositionStart = () => { this.isComposing = true; };
  private readonly onCompositionEnd   = () => { this.isComposing = false; };

  constructor(
    view: EditorView,
    private readonly decorators: readonly SyntaxDecorator[],
  ) {
    this.decorations = this.buildAll(view);
    this.attachCompositionListeners(view);
  }

  update(upd: ViewUpdate): void {
    // Skip rebuild during active IME composition.
    // The decoration set stays unchanged — the preedit text is handled
    // entirely by the browser native composition layer.
    if (this.isComposing) return;

    // Rebuild on document edit, viewport change, or cursor move.
    // Cursor move is included so that bold/italic markers reveal themselves
    // when the user's caret enters the marked span.
    if (upd.docChanged || upd.viewportChanged || upd.selectionSet) {
      this.decorations = this.buildAll(upd.view);
    }
  }

  destroy(): void {
    if (this.contentDOM) {
      this.contentDOM.removeEventListener('compositionstart', this.onCompositionStart);
      this.contentDOM.removeEventListener('compositionend',   this.onCompositionEnd);
      this.contentDOM = null;
    }
  }

  private attachCompositionListeners(view: EditorView): void {
    // CodeMirror exposes the editable content element via `view.contentDOM`.
    this.contentDOM = view.contentDOM;
    this.contentDOM.addEventListener('compositionstart', this.onCompositionStart);
    this.contentDOM.addEventListener('compositionend',   this.onCompositionEnd);
  }

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
  const plugin = ViewPlugin.define(
    (view) => new DecorationOrchestrator(view, decorators),
    { decorations: (p) => p.decorations },
  );
  return [plugin, decorationBaseTheme];
}
