import { useTabStoreApi } from './TabDocumentProvider';
import { EditorBlock } from '@/entities/block/model/store';
import { MindNode } from '@/entities/document/lib/parser';

/**
 * REF-20260831-01 (Step 7-C, C-4) — 탭 스코프 스토어 어댑터.
 *
 * C-2/C-3 는 `TabDocumentProvider` 가 없을 때 전역 `useBlockStore`+`useDocumentStore`
 * 로 폴백하는 전환기 이중 경로였다. C-4 에서 그 전역 싱글턴 자체가 소멸했으므로
 * 폴백은 더 이상 존재할 수 없다 — 이 어댑터는 이제 `TabDocumentProvider` Context
 * 하나만 본다(없으면 `useTabStoreApi` 가 던진다. `PaneContainer` 가 활성 탭이
 * 있는 동안 항상 Provider 를 마운트해 두므로 실제로 던질 일은 없다).
 *
 * 그럼에도 이 파일을 남겨 둔 이유: `BlockEditor`/`ReadView`/`FormatToolbar`/
 * `ErdDesignerMainView` 는 원본 `TabStoreState` 그대로가 아니라 `getFreshBlocks()`
 * 같은 어댑터 전용 편의 메서드를 함께 쓴다 — 그 계약을 여기 한 곳에 모아 둔다.
 */
export interface EffectiveTabStore {
  rawContent: string;
  blocks: EditorBlock[];
  nodes: MindNode[];
  isDirty: boolean;
  viewMode: 'write' | 'read';
  activeBlockId: string | null;
  focusOffset: number;
  /** BUG-20260831-01 — focusOffset 이 "명령"인지 판정하는 토큰. CodeMirrorBlock 조정자 전용. */
  focusToken: number;
  /** 디스크/외부에서 읽은 원문으로 blocks 를 재계산한다(구조적 변경 경로). */
  setContent: (content: string) => void;
  /** ERD 탭 전용 — 마크다운 재파싱 없이 rawContent 만 교체한다. */
  setRawContent: (content: string) => void;
  /** 타이핑 중 디바운스 동기화용 — blocks 는 그대로 두고 rawContent 만 맞춘다(재파싱 없음). */
  syncRawContentFromBlocks: () => void;
  getMergedContent: () => string;
  updateBlockContent: (id: string, content: string) => void;
  mergeBlockWithPrevious: (id: string) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  focusBlock: (id: string, offset?: number) => void;
  setDirty: (isDirty: boolean) => void;
  setViewMode: (mode: 'write' | 'read') => void;
  toggleViewMode: () => void;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
  /**
   * `blocks` 필드는 이 훅이 호출된 렌더 시점의 스냅샷이다 — 같은 틱 안에서
   * 연속 호출되는 로직(예: setContent 직후 바로 그 결과를 읽어야 하는 커서
   * 위치 재계산)은 React 재렌더를 기다릴 수 없다. `tabApi.getState()` 급
   * "항상 지금 이 순간의 값" 보장을 유지하기 위한 탈출구.
   */
  getFreshBlocks: () => EditorBlock[];
}

export function useEffectiveTabStore(): EffectiveTabStore {
  const tabApi = useTabStoreApi();

  const rawContent = tabApi((s) => s.rawContent);
  const blocks = tabApi((s) => s.blocks);
  const nodes = tabApi((s) => s.nodes);
  const isDirty = tabApi((s) => s.isDirty);
  const viewMode = tabApi((s) => s.viewMode);
  const activeBlockId = tabApi((s) => s.activeBlockId);
  const focusOffset = tabApi((s) => s.focusOffset);
  const focusToken = tabApi((s) => s.focusToken);

  return {
    rawContent,
    blocks,
    nodes,
    isDirty,
    viewMode,
    activeBlockId,
    focusOffset,
    focusToken,
    setContent: (content) => tabApi.getState().setContent(content),
    setRawContent: (content) => tabApi.getState().setRawContent(content),
    syncRawContentFromBlocks: () => tabApi.getState().syncRawContentFromBlocks(),
    getMergedContent: () => tabApi.getState().getMergedContent(),
    updateBlockContent: (id, content) => tabApi.getState().updateBlockContent(id, content),
    mergeBlockWithPrevious: (id) => tabApi.getState().mergeBlockWithPrevious(id),
    reorderBlocks: (fromIndex, toIndex) => tabApi.getState().reorderBlocks(fromIndex, toIndex),
    focusBlock: (id, offset) => tabApi.getState().focusBlock(id, offset),
    setDirty: (v) => tabApi.getState().setDirty(v),
    setViewMode: (mode) => tabApi.getState().setViewMode(mode),
    toggleViewMode: () => tabApi.getState().toggleViewMode(),
    updateNodeCoordinate: (nodeId, x, y) => tabApi.getState().updateNodeCoordinate(nodeId, x, y),
    getFreshBlocks: () => tabApi.getState().blocks,
  };
}
