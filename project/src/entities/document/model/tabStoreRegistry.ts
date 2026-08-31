import { TabStoreApi } from './tabStore';

/**
 * REF-20260831-01 (Step 7-C, C-3, D-2/D-5) — tabId → TabStoreApi 조회 레지스트리.
 *
 * `TabDocumentProvider` 는 React Context 라서 그 서브트리 밖에서는 닿지 않는다.
 * MindView 팝업(WorkspacePage.tsx, PaneContainer 바깥에 렌더)과 WorkspacePage
 * 상단 툴바(저장 버튼의 dirty 표시)는 "활성 패널의 활성 탭" 스토어를 Context
 * 없이 조회해야 한다. 선례: `shared/lib/editorViewRegistry.ts`(paneId → EditorView).
 *
 * 격리 원칙과 충돌하지 않는다(D-2 isolation_note) — 호출자가 tabId 를 명시적으로
 * 지정해야 조회가 되므로, "전역 활성 탭을 암묵적으로 추론"하는 것과는 다르다.
 *
 * 생명주기: `TabDocumentProvider` 가 마운트될 때 등록하고, tabId 가 바뀌거나
 * 언마운트될 때 해제한다(그 Provider 인스턴스가 마지막으로 등록한 항목일 때만 —
 * StrictMode 이중 마운트·경합 시 최신 등록을 실수로 지우지 않도록 등록자 자신의
 * api 참조와 일치할 때만 delete 한다).
 */
const registry = new Map<string, TabStoreApi>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  listeners.forEach((listener) => listener());
}

export function registerTabStore(tabId: string, api: TabStoreApi): void {
  registry.set(tabId, api);
  notify();
}

export function unregisterTabStore(tabId: string, api: TabStoreApi): void {
  if (registry.get(tabId) === api) {
    registry.delete(tabId);
    notify();
  }
}

export function getTabStore(tabId: string): TabStoreApi | undefined {
  return registry.get(tabId);
}

/** `useSyncExternalStore` 용 구독 — 등록/해제가 있을 때마다 재확인을 트리거한다. */
export function subscribeTabStoreRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTabStoreRegistryVersion(): number {
  return version;
}

/**
 * 테스트 전용 — T1 하네스가 `TabDocumentProvider` 없이 `registerTabStore` 를
 * 직접 호출해 "라이브 편집 중"을 흉내낼 때, 이전 테스트 케이스가 등록해 둔
 * 항목이 남아 다음 케이스를 오염시키는 걸 막는다(레지스트리가 모듈 전역이라
 * 테스트 파일 하나 안에서 프로세스 수명 내내 유지된다). 실제 앱에서는
 * `TabDocumentProvider` 의 마운트/언마운트가 이 역할을 하므로 쓸 일이 없다.
 */
export function __clearTabStoreRegistryForTests(): void {
  registry.clear();
}
