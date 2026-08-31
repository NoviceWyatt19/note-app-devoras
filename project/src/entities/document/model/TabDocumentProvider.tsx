import React, { createContext, useContext, useRef, useLayoutEffect } from 'react';
import { createTabStore, TabStoreApi, TabStoreState } from './tabStore';
import { registerTabStore, unregisterTabStore } from './tabStoreRegistry';
import { MindNode } from '@/entities/document/lib/parser';

/**
 * REF-20260831-01 (Step 7-C) — 탭 스코프 스토어를 트리에 공급하는 Context.
 *
 * C-4 로 전역 `useBlockStore`/`useDocumentStore` 문서 필드 싱글턴이 소멸했다 —
 * 이 Provider 가 이제 rawContent/blocks/nodes/isDirty/viewMode 의 유일한
 * 소스다. `PaneContainer` 가 활성 탭이 있는 동안 항상 이걸 마운트해 둔다.
 */
const TabStoreContext = createContext<TabStoreApi | null>(null);

export const TabDocumentProvider: React.FC<{
  tabId: string;
  initialContent?: string;
  /** 정렬된(spatialData 반영) 초기 nodes — 없으면 initialContent 를 그냥 parseMarkdown 한다. */
  initialNodes?: MindNode[];
  children: React.ReactNode;
}> = ({ tabId, initialContent, initialNodes, children }) => {
  // tabId 가 바뀌면(다른 탭으로 전환) 새 스토어 인스턴스를 만든다. useRef 로
  // tabId 를 추적해, 같은 탭인데 initialContent prop 이 리렌더마다 새 참조로
  // 들어와도(흔한 실수) 불필요하게 스토어를 재생성하지 않게 한다.
  const tabIdRef = useRef(tabId);
  const storeRef = useRef<TabStoreApi | null>(null);

  if (storeRef.current === null || tabIdRef.current !== tabId) {
    storeRef.current = createTabStore(tabId, initialContent, initialNodes);
    tabIdRef.current = tabId;
  }

  const store = storeRef.current;

  // D-2/D-5: Context 밖(MindView 팝업, WorkspacePage 툴바)에서도 tabId 로
  // 이 스토어를 조회할 수 있어야 한다 — 레지스트리에 등록. tabId·store 가
  // 바뀔 때(다른 탭으로 전환) cleanup 이 먼저 돌아 이전 등록을 지우므로
  // 등록이 항상 "현재 탭 하나"만 가리킨다(구독 누수 없음).
  useLayoutEffect(() => {
    registerTabStore(tabId, store);
    return () => unregisterTabStore(tabId, store);
  }, [tabId, store]);

  return <TabStoreContext.Provider value={store}>{children}</TabStoreContext.Provider>;
};

/** Provider 안에서만 쓸 수 있다 — 없으면 던진다(호출부가 반드시 스코프 안에 있다는 계약). */
export function useTabStore<T>(selector: (state: TabStoreState) => T): T {
  const store = useTabStoreApi();
  return store(selector);
}

/** `useTabStore` 와 같은 계약(Provider 밖이면 throw) — selector 없이 API 자체가 필요할 때. */
export function useTabStoreApi(): TabStoreApi {
  const store = useContext(TabStoreContext);
  if (!store) {
    throw new Error('useTabStore/useTabStoreApi 는 TabDocumentProvider 안에서만 호출할 수 있다.');
  }
  return store;
}
