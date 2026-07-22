import { EditorView } from '@codemirror/view';

/**
 * Module-level singleton tracking the CodeMirror EditorView that currently
 * has (or most recently had) keyboard focus inside the BlockEditor.
 *
 * Why a module singleton and not React state / context?
 *   - The FormatToolbar applies formatting on the user's active block.
 *     At the moment a toolbar button is pressed (onMouseDown + preventDefault),
 *     the editor still owns focus, so the ref must reflect the last focused view.
 *   - Passing the view through React props / context would require re-renders
 *     on every focus change, which is expensive given React.memo CodeMirrorBlock.
 *
 * Usage:
 *   - Call setActiveEditorView(view) whenever a CodeMirrorBlock gains focus.
 *   - Call setActiveEditorView(null) when a CodeMirrorBlock view is destroyed.
 *   - The FormatToolbar reads getActiveEditorView() inside onMouseDown callbacks.
 */

let _activeView: EditorView | null = null;

export function setActiveEditorView(view: EditorView | null): void {
  _activeView = view;
}

export function getActiveEditorView(): EditorView | null {
  return _activeView;
}
