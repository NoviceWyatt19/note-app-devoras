/**
 * REF-20260831-01 (Step 7-C, C-1) — 탭 스코프 스토어 격리 하네스 (T1)
 *
 * C-1 은 `createTabStore`/`TabDocumentProvider` 를 만들되 아직 아무 소비자도
 * 연결하지 않는 단계다. 그래서 이 하네스가 다루는 범위는 스토어 팩토리 자체의
 * 순수 로직(격리·직렬화 왕복)에 한정된다 — 실제 React 트리 마운트/언마운트나
 * 워크스페이스 전환 연동 검증은 C-2~C-4 에서 소비자가 연결된 뒤에나 의미가
 * 있다(티켓의 `to_add` 에 적힌 나머지 두 케이스는 그때 추가한다).
 *
 * 실행: pnpm test:tabstore
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTabStore } from '../model/tabStore.ts';

test('createTabStore (C-1) — 구조적 격리 + 직렬화 왕복', async (t) => {
  await t.test('T1: 탭 A 의 스토어에 쓴 값이 탭 B 의 스토어에 보이지 않는다', () => {
    const storeA = createTabStore('tab-A', '# A\n본문A');
    const storeB = createTabStore('tab-B', '# B\n본문B');

    storeA.getState().setContent('# A 편집됨\n새 본문');
    storeA.getState().setDirty(true);

    assert.strictEqual(storeA.getState().rawContent, '# A 편집됨\n새 본문');
    assert.strictEqual(storeA.getState().isDirty, true);

    // B 는 A 의 편집에 전혀 영향받지 않아야 한다 — 런타임 가드가 아니라
    // 서로 다른 zustand 인스턴스라는 구조 자체가 격리를 보장한다.
    assert.strictEqual(storeB.getState().rawContent, '# B\n본문B');
    assert.strictEqual(storeB.getState().isDirty, false);
  });

  await t.test('T2: 같은 tabId 로 다시 호출해도 완전히 새 인스턴스를 준다(전역 레지스트리로 캐싱하지 않는다)', () => {
    const first = createTabStore('tab-X', '내용');
    first.getState().setDirty(true);

    const second = createTabStore('tab-X', '내용');

    assert.notStrictEqual(first, second, '같은 tabId 라도 별개의 스토어 인스턴스여야 한다');
    assert.strictEqual(
      second.getState().isDirty,
      false,
      '두 번째 호출이 첫 번째 인스턴스의 상태를 이어받으면(=모듈 전역에 캐싱됐다는 뜻) 안 된다',
    );
  });

  await t.test('T3: setContent 는 block/store.ts 와 동일한 2-패스 매칭을 재사용한다(헤딩 id 안정성)', () => {
    const store = createTabStore('tab-Y', '## 원래제목\n본문');
    const beforeId = store.getState().blocks[0].id;

    store.getState().setContent('## 바뀐제목\n본문');

    assert.strictEqual(
      store.getState().blocks[0].id,
      beforeId,
      '탭 스토어도 A7 의 2-패스 매칭을 그대로 써야 한다 — 제목만 바꿔도 id 가 보존돼야 한다',
    );
  });

  await t.test('T4: serialize() → hydrate() 왕복이 blocks/isDirty/viewMode 를 손실 없이 복원한다', () => {
    const store = createTabStore('tab-Z', '## 제목\n본문\n\n### 자식\n자식 본문');
    store.getState().setDirty(true);
    store.getState().setViewMode('read');
    store.getState().focusBlock(store.getState().blocks[0].id, 3);

    const snapshot = store.getState().serialize();

    // 새 스토어(빈 상태)로 옮겨서 왕복 복원이 실제로 재현하는지 확인.
    const restored = createTabStore('tab-Z');
    restored.getState().hydrate(snapshot);

    assert.deepStrictEqual(restored.getState().blocks, snapshot.blocks);
    assert.strictEqual(restored.getState().isDirty, true);
    assert.strictEqual(restored.getState().viewMode, 'read');
    assert.strictEqual(restored.getState().activeBlockId, snapshot.activeBlockId);
    assert.strictEqual(restored.getState().focusOffset, 3);
    assert.strictEqual(restored.getState().rawContent, snapshot.rawContent);
  });

  await t.test('T5: hydrate 에 다른 tabId 의 스냅샷을 넣어도 이 인스턴스의 tabId 자체는 바뀌지 않는다', () => {
    const store = createTabStore('tab-owner', '내용');
    const foreignSnapshot = createTabStore('tab-other', '다른 내용').getState().serialize();

    store.getState().hydrate(foreignSnapshot);

    assert.strictEqual(store.getState().tabId, 'tab-owner', '스토어 인스턴스의 tabId 는 생성 시점에 고정되어야 한다');
    assert.strictEqual(store.getState().rawContent, '다른 내용', '내용 자체는 스냅샷대로 복원된다(경고만 남기고 진행)');
  });
});
