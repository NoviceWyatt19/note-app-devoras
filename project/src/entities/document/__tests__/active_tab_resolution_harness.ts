/**
 * REF-20260831-01 (Step 7-C, C-3, D-5 test_gap) — 레지스트리 기반 활성 탭 해석 하네스 (T1)
 *
 * D-5 가 지적한 공백: 어떤 하네스도 "viewMode 토글 클릭"과 "저장 버튼의 dirty
 * 표시"를 검사하지 않았다. 이 프로젝트의 T1 계층은 순수 Node 위에서 도는
 * TS 트랜스파일 로더일 뿐 React 렌더러가 없다(@testing-library 류 미설치) —
 * 그래서 `useActiveTabStoreView`/`useEffectiveTabStore` 같은 훅 자체는 여기서
 * 호출할 수 없다. 이 하네스는 그 훅들이 감싸고 있는 **훅이 아닌 로직**
 * (tabStoreRegistry 의 등록·조회·구독, tabStore 의 toggleViewMode/setRawContent)
 * 을 직접 검증한다 — FormatToolbar 의 클릭 이벤트, WorkspacePage 저장 버튼의
 * 실제 리렌더까지는 사람 손이 필요하다(VERIFY_BY_HUMAN.md 참고).
 *
 * 실행: pnpm test:activetab
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTabStore } from '../model/tabStore.ts';
import {
  registerTabStore,
  unregisterTabStore,
  getTabStore,
  subscribeTabStoreRegistry,
  getTabStoreRegistryVersion,
} from '../model/tabStoreRegistry.ts';

test('tabStoreRegistry (C-3, D-2/D-5) — tabId 조회 + 구독', async (t) => {
  await t.test('R1: 등록된 tabId 로 조회하면 그 스토어를 돌려준다', () => {
    const store = createTabStore('tab-R1', '내용');
    registerTabStore('tab-R1', store);

    assert.strictEqual(getTabStore('tab-R1'), store);

    unregisterTabStore('tab-R1', store);
  });

  await t.test('R2: 등록되지 않은 tabId 는 undefined', () => {
    assert.strictEqual(getTabStore('tab-never-registered'), undefined);
  });

  await t.test('R3: unregister 는 등록자 자신의 api 참조와 일치할 때만 지운다(경합 가드)', () => {
    const oldStore = createTabStore('tab-R3', '옛 내용');
    const newStore = createTabStore('tab-R3', '새 내용');

    registerTabStore('tab-R3', oldStore);
    registerTabStore('tab-R3', newStore); // 같은 tabId 로 새 인스턴스 재등록(탭 재방문 시나리오)

    // 이전 등록자(oldStore)가 뒤늦게 자기 cleanup 을 돌려도, 최신 등록(newStore)을
    // 실수로 지우면 안 된다 — StrictMode 이중 마운트·빠른 탭 전환 경합 방어.
    unregisterTabStore('tab-R3', oldStore);
    assert.strictEqual(getTabStore('tab-R3'), newStore, '최신 등록이 살아 있어야 한다');

    unregisterTabStore('tab-R3', newStore);
    assert.strictEqual(getTabStore('tab-R3'), undefined);
  });

  await t.test('R4: 등록/해제마다 구독자에게 알린다(useSyncExternalStore 재확인 트리거)', () => {
    let notifyCount = 0;
    const unsubscribe = subscribeTabStoreRegistry(() => { notifyCount++; });
    const versionBefore = getTabStoreRegistryVersion();

    const store = createTabStore('tab-R4', '내용');
    registerTabStore('tab-R4', store);
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(getTabStoreRegistryVersion(), versionBefore + 1);

    unregisterTabStore('tab-R4', store);
    assert.strictEqual(notifyCount, 2);

    unsubscribe();
    const otherStore = createTabStore('tab-R4b', '내용');
    registerTabStore('tab-R4b', otherStore); // 구독 해제 후에는 더 이상 알림이 오면 안 된다
    assert.strictEqual(notifyCount, 2, 'unsubscribe 후에는 콜백이 다시 불리면 안 된다');
    unregisterTabStore('tab-R4b', otherStore);
  });
});

test('tabStore — viewMode 토글 (FormatToolbar 클릭 경로의 밑바탕 로직)', async (t) => {
  await t.test('V1: toggleViewMode 는 write ↔ read 를 오간다', () => {
    const store = createTabStore('tab-V1', '내용');
    assert.strictEqual(store.getState().viewMode, 'write');

    store.getState().toggleViewMode();
    assert.strictEqual(store.getState().viewMode, 'read');

    store.getState().toggleViewMode();
    assert.strictEqual(store.getState().viewMode, 'write');
  });

  await t.test('V2: setViewMode 는 명시적으로 지정한 모드로 고정한다', () => {
    const store = createTabStore('tab-V2', '내용');
    store.getState().setViewMode('read');
    assert.strictEqual(store.getState().viewMode, 'read');
    store.getState().setViewMode('read'); // 이미 read 여도 안전
    assert.strictEqual(store.getState().viewMode, 'read');
  });
});

test('tabStore — 저장 버튼 dirty 표시의 밑바탕 로직', async (t) => {
  await t.test('D1: setRawContent 는 rawContent 교체와 동시에 dirty 로 표시한다(ERD 경로)', () => {
    const store = createTabStore('tab-D1', '{}');
    assert.strictEqual(store.getState().isDirty, false);

    store.getState().setRawContent('{"tables":[]}');

    assert.strictEqual(store.getState().rawContent, '{"tables":[]}');
    assert.strictEqual(store.getState().isDirty, true);
  });

  await t.test('D2: setDirty(false) 로 저장 완료 후 dirty 를 되돌릴 수 있다(저장 버튼이 꺼져야 하는 경로)', () => {
    const store = createTabStore('tab-D2', '내용');
    store.getState().setDirty(true);
    assert.strictEqual(store.getState().isDirty, true);

    store.getState().setDirty(false);
    assert.strictEqual(store.getState().isDirty, false);
  });

  await t.test('D3: 레지스트리로 조회한 스토어의 isDirty 가 곧 저장 버튼이 읽을 값이다(엔드투엔드 배선 확인)', () => {
    const store = createTabStore('tab-D3', '# 제목\n본문');
    registerTabStore('tab-D3', store);

    // WorkspacePage 저장 버튼은 useActiveTabStoreView() → getTabStore(activeTabId).isDirty 를 읽는다.
    // 이 하네스는 훅을 못 부르니 그 마지막 단계(레지스트리 조회 → isDirty 읽기)만 재현한다.
    assert.strictEqual(getTabStore('tab-D3')?.getState().isDirty, false);

    store.getState().updateBlockContent(store.getState().blocks[0].id, '# 바뀐 제목');
    store.getState().setDirty(true); // BlockEditor/ReadView 가 편집 시 명시적으로 호출하는 것과 동일

    assert.strictEqual(getTabStore('tab-D3')?.getState().isDirty, true, '저장 버튼이 dirty 로 보여야 하는 상태');

    unregisterTabStore('tab-D3', store);
    assert.strictEqual(getTabStore('tab-D3'), undefined, '탭이 언마운트되면 저장 버튼도 더는 이 스토어를 봐선 안 된다');
  });
});
