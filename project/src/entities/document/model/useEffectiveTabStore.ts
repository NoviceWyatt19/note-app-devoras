import { useOptionalTabStoreApi } from './TabDocumentProvider';
import { createTabStore } from './tabStore';
import { useBlockStore, EditorBlock } from '@/entities/block/model/store';
import { useDocumentStore } from './store';

/**
 * REF-20260831-01 (Step 7-C, C-2) — 전환기 어댑터.
 *
 * `TabDocumentProvider` 가 있으면 탭 스코프 스토어를, 없으면 전역
 * `useBlockStore`+`useDocumentStore` 조합을 **같은 모양**으로 내준다.
 * `BlockEditor` 는 이 어댑터만 보고 구현하면 되고, 상태가 어디서 오는지
 * 몰라도 된다 — 소스 안에 `if (tabApi) ... else ...` 를 흩뿌리는 대신 위험을
 * 이 파일 하나로 모은다. C-4 에서 전역 경로가 사라지면 이 파일도 함께 정리된다.
 *
 * Hooks 규칙: 두 소스의 훅을 **항상 둘 다** 호출한다(조건부로 호출하지 않는다).
 * `tabApi` 가 없을 때도 무언가를 구독해야 하므로, 아무도 쓰지 않는 더미
 * 탭 스토어를 항상 구독 대상으로 준다 — 실제 반환값은 버려진다.
 */
const DUMMY_TAB_STORE = createTabStore('__effective-tab-store-dummy__');

export interface EffectiveTabStore {
  rawContent: string;
  blocks: EditorBlock[];
  isDirty: boolean;
  viewMode: 'write' | 'read';
  activeBlockId: string | null;
  focusOffset: number;
  /** 디스크/외부에서 읽은 원문으로 blocks 를 재계산한다(구조적 변경 경로). */
  setContent: (content: string) => void;
  /**
   * 타이핑 중 디바운스 동기화용 — blocks 는 건드리지 않고 rawContent 만
   * 현재 blocks 와 일치하도록 맞춘다(재파싱 없음). 전역 경로에는 애초에
   * "rawContent" 개념이 useBlockStore 에 없으므로(그 필드는 useDocumentStore
   * 소유) 이 경로에서는 no-op — 호출부가 이어서 하는 updateContentForTab
   * 호출이 그 역할을 그대로 한다.
   */
  syncRawContentFromBlocks: () => void;
  getMergedContent: () => string;
  updateBlockContent: (id: string, content: string) => void;
  mergeBlockWithPrevious: (id: string) => void;
  focusBlock: (id: string, offset?: number) => void;
  setDirty: (isDirty: boolean) => void;
  /**
   * `blocks` 필드는 이 훅이 호출된 렌더 시점의 스냅샷이다 — 같은 틱 안에서
   * 연속 호출되는 로직(예: setContent 직후 바로 그 결과를 읽어야 하는 커서
   * 위치 재계산)은 React 재렌더를 기다릴 수 없다. 원래 `useBlockStore.getState()`
   * 가 주던 "항상 지금 이 순간의 값" 보장을 그대로 유지하기 위한 탈출구.
   */
  getFreshBlocks: () => EditorBlock[];
  /** 이 렌더가 탭 스코프 스토어를 쓰고 있는지 — 디버깅/계측용, 분기 로직에는 안 쓴다. */
  usingTabStore: boolean;
}

/**
 * @param ownerTabId 전역 경로에서만 쓰인다 — `useBlockStore.setBlocksFromContent`
 *   의 `ownerTabId` 가드에 필요하다. 탭 스코프 경로는 인스턴스 자체가 이미
 *   한 탭에 묶여 있으므로 필요 없다.
 */
export function useEffectiveTabStore(ownerTabId: string | undefined): EffectiveTabStore {
  const tabApi = useOptionalTabStoreApi();
  const activeApi = tabApi ?? DUMMY_TAB_STORE;

  // ── 탭 스코프 경로(항상 구독 — Hooks 규칙) ──
  const tabRawContent = activeApi((s) => s.rawContent);
  const tabBlocks = activeApi((s) => s.blocks);
  const tabIsDirty = activeApi((s) => s.isDirty);
  const tabViewMode = activeApi((s) => s.viewMode);
  const tabActiveBlockId = activeApi((s) => s.activeBlockId);
  const tabFocusOffset = activeApi((s) => s.focusOffset);

  // ── 전역 경로(항상 구독 — Hooks 규칙, tabApi 가 있으면 이 값들은 버려진다) ──
  const globalRawContent = useDocumentStore((s) => s.rawContent);
  const globalBlocks = useBlockStore((s) => s.blocks);
  const globalIsDirty = useDocumentStore((s) => s.isDirty);
  const globalViewMode = useDocumentStore((s) => s.viewMode);
  const globalActiveBlockId = useBlockStore((s) => s.activeBlockId);
  const globalFocusOffset = useBlockStore((s) => s.focusOffset);

  const usingTabStore = tabApi !== null;

  if (usingTabStore) {
    return {
      rawContent: tabRawContent,
      blocks: tabBlocks,
      isDirty: tabIsDirty,
      viewMode: tabViewMode,
      activeBlockId: tabActiveBlockId,
      focusOffset: tabFocusOffset,
      setContent: (content) => tabApi.getState().setContent(content),
      syncRawContentFromBlocks: () => tabApi.getState().syncRawContentFromBlocks(),
      getMergedContent: () => tabApi.getState().getMergedContent(),
      updateBlockContent: (id, content) => tabApi.getState().updateBlockContent(id, content),
      mergeBlockWithPrevious: (id) => tabApi.getState().mergeBlockWithPrevious(id),
      focusBlock: (id, offset) => tabApi.getState().focusBlock(id, offset),
      setDirty: (v) => tabApi.getState().setDirty(v),
      getFreshBlocks: () => tabApi.getState().blocks,
      usingTabStore: true,
    };
  }

  return {
    rawContent: globalRawContent,
    blocks: globalBlocks,
    isDirty: globalIsDirty,
    viewMode: globalViewMode,
    activeBlockId: globalActiveBlockId,
    focusOffset: globalFocusOffset,
    setContent: (content) => useBlockStore.getState().setBlocksFromContent(content, ownerTabId),
    syncRawContentFromBlocks: () => {}, // no-op — 전역 경로는 updateContentForTab 이 이 역할을 대신한다
    getMergedContent: () => useBlockStore.getState().getMergedContent(),
    updateBlockContent: (id, content) => useBlockStore.getState().updateBlockContent(id, content),
    mergeBlockWithPrevious: (id) => useBlockStore.getState().mergeBlockWithPrevious(id),
    focusBlock: (id, offset) => useBlockStore.getState().focusBlock(id, offset),
    setDirty: (v) => useDocumentStore.getState().setDirty(v),
    getFreshBlocks: () => useBlockStore.getState().blocks,
    usingTabStore: false,
  };
}
