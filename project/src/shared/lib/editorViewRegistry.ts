import { EditorView } from '@codemirror/view';
import { useDocumentStore } from '@/entities/document/model/store';

// 키 구조: `${paneId}::${blockId}`
const registry = new Map<string, EditorView>();

// 패널별로 현재 캐럿이 위치한 블록을 별도 추적 (렌더링 트리거가 아님)
const caretHolder = new Map<string, string>(); // paneId -> blockId

/**
 * CodeMirrorBlock 마운트 시 등록
 */
export function registerEditorView(paneId: string, blockId: string, view: EditorView): void {
  registry.set(`${paneId}::${blockId}`, view);
}

/**
 * CodeMirrorBlock 언마운트 시 해제 (가상화 지원)
 */
export function unregisterEditorView(paneId: string, blockId: string): void {
  registry.delete(`${paneId}::${blockId}`);
  if (caretHolder.get(paneId) === blockId) {
    caretHolder.delete(paneId);
  }
}

/**
 * updateListener 의 focusChanged 에서 호출
 * 이 값이 렌더링을 트리거해서는 안 됨
 */
export function reportCaretFocus(paneId: string, blockId: string): void {
  caretHolder.set(paneId, blockId);
}

/**
 * 특정 pane과 block의 EditorView 반환 (전역 검색 등에 사용)
 */
export function getEditorViewForBlock(paneId: string, blockId: string): EditorView | null {
  return registry.get(`${paneId}::${blockId}`) ?? null;
}

/**
 * 현재 활성 패널에서 포커스를 가진 EditorView 반환 (FormatToolbar 등에 사용)
 */
export function getActiveEditorView(): EditorView | null {
  const { activePaneId } = useDocumentStore.getState();
  const blockId = caretHolder.get(activePaneId);
  if (!blockId) return null;
  return registry.get(`${activePaneId}::${blockId}`) ?? null;
}
