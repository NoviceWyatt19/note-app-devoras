import { Extension, RangeSet, StateField, StateEffect, EditorState } from '@codemirror/state';
import { DecorationSet, EditorView, PluginValue, ViewPlugin } from '@codemirror/view';
import { SyntaxDecorator } from './types';

// ---------------------------------------------------------------------------
// Internal IME State Effect & Field
// ---------------------------------------------------------------------------

// Emitted by the ViewPlugin when IME composition starts or ends
const setImeEffect = StateEffect.define<boolean>();

// Tracks the DOM IME composition state in CodeMirror's state
const imeStateField = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => {
    for (const e of tr.effects) {
      if (e.is(setImeEffect)) return e.value;
    }
    return value;
  }
});

// ---------------------------------------------------------------------------
// Decoration StateField
// ---------------------------------------------------------------------------

function buildAll(state: EditorState, decorators: readonly SyntaxDecorator[]): DecorationSet {
  if (decorators.length === 0) return RangeSet.empty;
  
  // Since Devoras splits blocks into separate CodeMirror instances,
  // doc.length is small enough to parse the whole block synchronously.
  const from = 0;
  const to = state.doc.length;

  const sets = decorators.map((d) => {
    try {
      return d.createDecorations(state, from, to);
    } catch (err) {
      // Isolate failures — one broken decorator must not crash the editor
      console.warn(`[Orchestrator] Decorator "${d.name}" threw:`, err);
      return RangeSet.empty as DecorationSet;
    }
  });

  // RangeSet.join merges multiple sorted sets into one, preserving all ranges
  return RangeSet.join(sets);
}

// ---------------------------------------------------------------------------
// IME Latch ViewPlugin (DOM event manager)
// ---------------------------------------------------------------------------

/**
 * ## IME / Composition Policy
 * A rebuild is blocked by two independent signals:
 *
 * - CodeMirror's `tr.isUserEvent('input.type.compose')` or native composing flags.
 * - A DOM `compositionstart`/`compositionend` latch, which remains true through
 *   WebKit's transient false reports during Korean IME preedit updates.
 *
 * The latch is deliberately cleared only after `compositionend`; rebuilding is
 * then deferred one task so the final committed document and selection are both
 * stable before any `Decoration.replace` or widget can be introduced.
 */
class ImeLatchPlugin implements PluginValue {
  private compositionEndTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(private readonly view: EditorView) {
    view.contentDOM.addEventListener('compositionstart', this.onCompositionStart, true);
    view.contentDOM.addEventListener('compositionend', this.onCompositionEnd, true);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.compositionEndTimer !== null) clearTimeout(this.compositionEndTimer);
    this.view.contentDOM.removeEventListener('compositionstart', this.onCompositionStart, true);
    this.view.contentDOM.removeEventListener('compositionend', this.onCompositionEnd, true);
  }

  private readonly onCompositionStart = (): void => {
    if (this.compositionEndTimer !== null) {
      clearTimeout(this.compositionEndTimer);
      this.compositionEndTimer = null;
    }
    this.view.dispatch({ effects: setImeEffect.of(true) });
  };

  private readonly onCompositionEnd = (): void => {
    this.compositionEndTimer = setTimeout(() => {
      this.compositionEndTimer = null;
      if (this.destroyed) return;
      this.view.dispatch({ effects: setImeEffect.of(false) });
    }, 0);
  };
}

// ---------------------------------------------------------------------------
// Base theme for classes emitted by the built-in decorators
// ---------------------------------------------------------------------------

const decorationBaseTheme = EditorView.baseTheme({

  '&.cm-editor .cm-h1-line': {
    fontSize: '35px',
    fontWeight: '700',
    color: '#f1f5f9',
    margin: '0.75rem 0 0.5rem',
    lineHeight: '1.3',
    textAlign: 'center',
  },
  '&.cm-editor .cm-h2-line': {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: '0.625rem 0 0.4rem',
    lineHeight: '1.35',
  },
  '&.cm-editor .cm-h3-line': {
    fontSize: '1.05rem',
    fontWeight: '600',
    color: '#cbd5e1',
    margin: '0.5rem 0 0.35rem',
    lineHeight: '1.4',
  },
  '&.cm-editor .cm-h4-line, &.cm-editor .cm-h5-line, &.cm-editor .cm-h6-line': {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#94a3b8',
    margin: '0.4rem 0 0.25rem',
    lineHeight: '1.4',
  },
  '&.cm-editor .cm-heading-badge': {
    display: 'inline-block',
    marginRight: '0.5rem',
    fontSize: '0.65rem',
    color: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    fontWeight: '800',
    userSelect: 'none',
  },

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
  '&.cm-editor .cm-code-block-line': {
    backgroundColor: '#1a1b26',
    backgroundClip: 'padding-box',
    borderLeft: '1rem solid transparent',
    borderRight: '1rem solid transparent',
    boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05), inset -1px 0 0 rgba(255,255,255,0.05)',
    paddingLeft: '1rem',
    paddingRight: '1rem',
  },
  '&.cm-editor .cm-code-block-top': {
    borderTopLeftRadius: '0.75rem',
    borderTopRightRadius: '0.75rem',
    paddingTop: '1rem',
    boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05), inset -1px 0 0 rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  '&.cm-editor .cm-code-block-flat-top': {
    paddingTop: '1rem',
  },
  '&.cm-editor .cm-code-block-hidden-fence': {
    height: '4px !important',
    minHeight: '4px !important',
    padding: '0 !important',
    margin: '0 !important',
    border: '0 !important',
    overflow: 'hidden !important',
    fontSize: '0 !important',
    lineHeight: '0 !important',
    background: 'transparent !important',
  },
  '&.cm-editor .cm-code-block-hidden-fence br': {
    display: 'none',
  },
  '&.cm-editor .cm-code-block-widget-line': {
    padding: '0 !important',
    margin: '0 !important',
    border: '0 !important',
    background: 'transparent !important',
    lineHeight: '0 !important',
    fontSize: '0 !important',
  },
  '&.cm-editor .cm-code-block-widget-line br': {
    display: 'none',
  },
  '&.cm-editor .cm-code-block-header': {
    fontSize: '12px',
    lineHeight: '1.5',
  },
  '&.cm-editor .cm-cb-lang': { fontSize: '11px' },
  '&.cm-editor .cm-cb-title': { fontSize: '12px' },
  '&.cm-editor .cm-cb-copied': { fontSize: '10px' },
  '&.cm-editor .cm-image-caption': { fontSize: '0.85em', lineHeight: '1.5' },
  '&.cm-editor .cm-code-block-bottom': {
    borderBottomLeftRadius: '0.75rem',
    borderBottomRightRadius: '0.75rem',
    paddingBottom: '1rem',
    boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05), inset -1px 0 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(255,255,255,0.05)',
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
 * through the central orchestrator using a StateField (to support multi-line replacement).
 */
export function createDecorationPlugin(decorators: SyntaxDecorator[]): Extension {
  const decorationStateField = StateField.define<DecorationSet>({
    create(state) {
      return buildAll(state, decorators);
    },
    update(value, tr) {
      // Do not rebuild during DOM composition
      if (tr.state.field(imeStateField, false)) {
        if (tr.docChanged) return value.map(tr.changes);
        return value;
      }

      // Rebuild on doc change, selection change, or IME unlatch
      if (tr.docChanged || tr.selection || tr.effects.some(e => e.is(setImeEffect))) {
        return buildAll(tr.state, decorators);
      }

      return value;
    },
    provide: (f) => EditorView.decorations.from(f)
  });

  const imePlugin = ViewPlugin.fromClass(ImeLatchPlugin);

  return [
    imeStateField,
    decorationStateField,
    imePlugin,
    decorationBaseTheme
  ];
}
