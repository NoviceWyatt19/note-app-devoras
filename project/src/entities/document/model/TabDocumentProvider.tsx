import React, { createContext, useContext, useRef } from 'react';
import { createTabStore, TabStoreApi, TabStoreState } from './tabStore';

/**
 * REF-20260831-01 (Step 7-C) — 탭 스코프 스토어를 트리에 공급하는 Context.
 *
 * C-1 단계에서는 아무 소비자도 없다 — Provider 를 씌워도 기존 화면의 동작은
 * 전역 `useBlockStore`/`useDocumentStore` 그대로다. C-2/C-3 에서 각 컴포넌트가
 * `useTabStore`/`useOptionalTabStore` 로 이 Context 를 읽기 시작하고, C-4 에서
 * 전역 싱글턴이 사라지면 이 Provider 가 유일한 상태 소스가 된다.
 */
const TabStoreContext = createContext<TabStoreApi | null>(null);

export const TabDocumentProvider: React.FC<{
  tabId: string;
  initialContent?: string;
  children: React.ReactNode;
}> = ({ tabId, initialContent, children }) => {
  // tabId 가 바뀌면(다른 탭으로 전환) 새 스토어 인스턴스를 만든다. useRef 로
  // tabId 를 추적해, 같은 탭인데 initialContent prop 이 리렌더마다 새 참조로
  // 들어와도(흔한 실수) 불필요하게 스토어를 재생성하지 않게 한다.
  const tabIdRef = useRef(tabId);
  const storeRef = useRef<TabStoreApi | null>(null);

  if (storeRef.current === null || tabIdRef.current !== tabId) {
    storeRef.current = createTabStore(tabId, initialContent);
    tabIdRef.current = tabId;
  }

  const store = storeRef.current;

  return <TabStoreContext.Provider value={store}>{children}</TabStoreContext.Provider>;
};

/** Provider 안에서만 쓸 수 있다 — 없으면 던진다(호출부가 반드시 스코프 안에 있다는 계약). */
export function useTabStore<T>(selector: (state: TabStoreState) => T): T {
  const store = useContext(TabStoreContext);
  if (!store) {
    throw new Error('useTabStore 는 TabDocumentProvider 안에서만 호출할 수 있다.');
  }
  return store(selector);
}

/**
 * C-2/C-3 전환기 전용 — Provider 가 없으면 `null` 을 반환해 호출부가 전역
 * 스토어로 폴백할 수 있게 한다. C-4 에서 폴백 경로를 걷어낼 때 이 훅의
 * 존재 이유도 함께 사라진다(전부 `useTabStore` 로 교체).
 */
export function useOptionalTabStoreApi(): TabStoreApi | null {
  return useContext(TabStoreContext);
}
