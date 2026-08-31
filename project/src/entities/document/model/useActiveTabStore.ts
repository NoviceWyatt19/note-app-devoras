import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { useDocumentStore } from './store';
import { createTabStore } from './tabStore';
import { MindNode } from '@/entities/document/lib/parser';
import { getTabStore, subscribeTabStoreRegistry, getTabStoreRegistryVersion } from './tabStoreRegistry';

/**
 * REF-20260831-01 (Step 7-C, C-3, D-2/D-5) — Provider 밖에서 "활성 패널의
 * 활성 탭" 스토어를 동적으로 구독한다.
 *
 * MindView 팝업과 WorkspacePage 상단 툴바는 `PaneContainer`(= `TabDocumentProvider`
 * 서브트리) 바깥에 렌더되므로 React Context 로 탭 스토어에 닿을 수 없다. 이 훅은
 * `useDocumentStore` 의 activePaneId/activeTabId 로 "지금 활성 탭이 무엇인지"를
 * 반응형으로 계산하고, `tabStoreRegistry` 에서 그 탭의 스토어를 조회해 구독한다.
 * 탭을 열 때 한 번 고정(스냅샷)하는 게 아니라 활성 탭이 바뀔 때마다 따라간다 —
 * 이게 결함이 아니라 팝업/툴바의 명세다(D-2).
 *
 * 호출자가 activeTabId 를 임의로 지정할 수 없고 오직 "현재 활성 탭"만 가리키므로,
 * 이건 "전역에서 내 데이터를 추론"하는 것과 다르다 — 애초에 이 훅 자체가
 * "활성 탭을 따라간다"는 게 계약인 컴포넌트 전용이다(BlockEditor/ReadView 같이
 * 자기 소유 탭이 명확한 컴포넌트는 `useEffectiveTabStore(tab.id)` 를 쓴다).
 */
const DUMMY_ACTIVE_TAB_STORE = createTabStore('__active-tab-store-dummy__');

export interface ActiveTabStoreView {
  /** 활성 탭에 마운트된 탭 스토어를 찾았는지 — false 면 나머지 필드는 빈 기본값이다. */
  hasActiveTabStore: boolean;
  rawContent: string;
  nodes: MindNode[];
  isDirty: boolean;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
}

export function useActiveTabStoreView(): ActiveTabStoreView {
  const activeTabId = useDocumentStore((s) => s.getActiveTab()?.id) ?? null;

  // 레지스트리 등록/해제가 있을 때마다 재확인 — Provider 의 등록 effect 가
  // 이 컴포넌트의 렌더보다 한 틱 늦게 커밋되는 경우(같은 배치의 형제 트리)를
  // 자기-교정한다. 값 자체(version)는 안 쓰고 재렌더 트리거로만 쓴다.
  useSyncExternalStore(subscribeTabStoreRegistry, getTabStoreRegistryVersion, getTabStoreRegistryVersion);

  const resolvedApi = activeTabId ? getTabStore(activeTabId) : undefined;
  const activeApi = resolvedApi ?? DUMMY_ACTIVE_TAB_STORE;

  // Hooks 규칙: resolvedApi 유무와 무관하게 항상 같은 훅을 호출한다.
  const rawContent = useStore(activeApi, (s) => s.rawContent);
  const nodes = useStore(activeApi, (s) => s.nodes);
  const isDirty = useStore(activeApi, (s) => s.isDirty);

  if (!resolvedApi) {
    return { hasActiveTabStore: false, rawContent: '', nodes: [], isDirty: false, updateNodeCoordinate: () => {} };
  }

  return {
    hasActiveTabStore: true,
    rawContent,
    nodes,
    isDirty,
    updateNodeCoordinate: (nodeId, x, y) => {
      resolvedApi.getState().updateNodeCoordinate(nodeId, x, y);
      // 탭 스코프 스토어의 isDirty 는 켜지지만(저장 버튼용), 좌표만 바뀐
      // 경우 updateContentForTab 을 거치지 않으므로 탭 바 점(dot)은 별도로
      // 켜야 한다 — activeTabId 는 이 시점에도 여전히 이 탭이어야 정확하다.
      if (activeTabId) useDocumentStore.getState().markTabDirty(activeTabId);
    },
  };
}
