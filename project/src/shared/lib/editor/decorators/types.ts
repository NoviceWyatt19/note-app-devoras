import { DecorationSet, EditorView } from '@codemirror/view';

/**
 * Pluggable markdown syntax decoration handler.
 *
 * Implement this interface to add WYSIWYG-like visual effects to the CodeMirror editor
 * without touching the core editor module. Register instances via `createDecorationPlugin`.
 *
 * Adding a new syntax:
 *   1. Create a class implementing SyntaxDecorator in `impl/`
 *   2. Add an instance to the array passed to `createDecorationPlugin` in BlockEditor.tsx
 *   → No changes to the orchestrator or other decorators required.
 */
export interface SyntaxDecorator {
  /** Unique identifier used for debugging and error logging. */
  readonly name: string;

  /**
   * Compute a sorted DecorationSet for the currently visible viewport range.
   *
   * Called on every view update (doc change, scroll, cursor move).
   * Keep this method fast — only process characters within [from, to].
   *
   * @param view  Current EditorView (provides doc, state, selection)
   * @param from  Viewport start offset (inclusive)
   * @param to    Viewport end offset (inclusive)
   */
  createDecorations(view: EditorView, from: number, to: number): DecorationSet;
}
