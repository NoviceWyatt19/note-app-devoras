import { test } from 'node:test';
import assert from 'node:assert';
import { useBlockStore, flattenTree } from '../model/store';

test('Block Key Stability (G0)', async (t) => {
  await t.test('K1, K2: 비헤딩 블록의 키가 부모+순번으로 고유 생성되며 첫 줄 수정에도 보존된다', () => {
    const store = useBlockStore.getState();
    const content = `Target line\nSecond line`;
    store.setBlocksFromContent(content, 'test-tab-2');
    let flat = flattenTree(useBlockStore.getState().blocks);
    const targetBlock = flat[0];
    assert.ok(targetBlock);
    const targetId = targetBlock.id;

    // Simulate update from editor (first line modified)
    store.updateBlockContent(targetId, 'Edited line\nSecond line');
    
    // Check if ID is preserved
    flat = flattenTree(useBlockStore.getState().blocks);
    const editedBlock = flat[0];
    assert.ok(editedBlock, 'ID was not preserved');
    assert.strictEqual(editedBlock.id, targetId);
    assert.strictEqual(editedBlock.content, 'Edited line\nSecond line');
  });

  await t.test('K3: 헤딩 분할/추가 후 비헤딩 블록의 id 가 보존되는가', () => {
    const store = useBlockStore.getState();
    // Start with a non-heading block at the top, then H2
    const content = `Target line\n\n## H2\nH2 text`;
    store.setBlocksFromContent(content, 'test-tab-3');
    let flat = flattenTree(useBlockStore.getState().blocks);
    const targetId = flat[0].id;

    // Simulate editing H2 to H1
    const h2Block = flat[1];
    store.updateBlockContent(h2Block.id, '# H2 changed to H1\nH2 text');

    // After updating, the first block should still have the same id
    flat = flattenTree(useBlockStore.getState().blocks);
    assert.strictEqual(flat[0].id, targetId, 'ID was not preserved after tree shape changed');
  });
});

test('Heading Identity Stability (G1 / A7)', async (t) => {
  await t.test('K4: 헤딩 라벨만 고쳐도(구조 변화 없음) id 가 보존된다', () => {
    const store = useBlockStore.getState();
    store.setBlocksFromContent('## 원래제목\n본문', 'test-tab-g1a');
    const before = flattenTree(useBlockStore.getState().blocks)[0];
    const beforeId = before.id;

    store.setBlocksFromContent('## 바뀐제목\n본문', 'test-tab-g1a');
    const after = flattenTree(useBlockStore.getState().blocks)[0];

    assert.strictEqual(
      after.id,
      beforeId,
      `헤딩 id 가 라벨 변경만으로 바뀌었다(A7): ${beforeId} -> ${after.id}. ` +
        '렌더 key 로 쓰이는 id 가 내용(라벨)에서 파생되면 React 가 EditorView 를 파괴·재생성하고 undo 히스토리를 잃는다.',
    );
  });

  // 참고: 이 시나리오는 수정 전 코드에서도 이미 통과한다 — updateBlockContent 가
  // 실시간 상태를 즉시 갱신하므로, 나중 재파싱의 "old" 비교 대상도 이미 바뀐
  // 라벨을 담고 있어 old/new 키가 같은 라벨에서 계산되기 때문이다. K4 가 진짜
  // 재현 사례이고, 이 테스트는 그 수정이 이 흔한 앱 흐름도 계속 안전하게
  // 유지하는지 지키는 회귀 가드다.
  await t.test('K5: 제목을 고친 뒤 다른 곳에서 헤딩을 추가해도(재파싱 트리거) 편집 중이던 블록의 id 는 유지된다', () => {
    const store = useBlockStore.getState();
    store.setBlocksFromContent('## 원래제목\n본문', 'test-tab-g1b');
    const original = flattenTree(useBlockStore.getState().blocks)[0];
    const originalId = original.id;

    // 1) 제목만 편집 (구조 변화 없음 — updateBlockContent 경로)
    store.updateBlockContent(originalId, '## 바뀐제목\n본문');

    // 2) 이어서 다른 헤딩을 추가해 재파싱을 트리거 (setBlocksFromContent 경로,
    //    실제로는 handleBlockUpdate 가 헤딩 개수 변화를 감지해 호출한다)
    const contentAfterAdd = flattenTree(useBlockStore.getState().blocks)
      .map((b) => b.content)
      .join('\n') + '\n\n## 새로 추가된 헤딩\n새 본문';
    store.setBlocksFromContent(contentAfterAdd, 'test-tab-g1b');

    const edited = flattenTree(useBlockStore.getState().blocks).find((b) =>
      b.content.startsWith('## 바뀐제목'),
    );
    assert.ok(edited, '편집한 블록을 찾을 수 없다');
    assert.strictEqual(
      edited!.id,
      originalId,
      `제목 편집 후 구조 변화(헤딩 추가)가 트리거한 재파싱에서 id 가 바뀌었다(A7 위험 창): ${originalId} -> ${edited!.id}`,
    );
  });

  await t.test('K6: 같은 라벨의 헤딩 둘은 서로 다른 id 를 가진다(pass 1 의 중복 접미사 유지)', () => {
    const store = useBlockStore.getState();
    store.setBlocksFromContent('## 같은제목\n첫번째\n\n## 같은제목\n두번째', 'test-tab-g1c');
    const [first, second] = flattenTree(useBlockStore.getState().blocks);
    assert.notStrictEqual(first.id, second.id, '같은 라벨이라도 서로 다른 위치의 블록은 다른 id 를 가져야 한다');
  });

  await t.test('K7: 헤딩을 재정렬해도(라벨 불변) id 가 보존된다 — 위치 기반 id 로 갔다면 깨질 회귀', () => {
    const store = useBlockStore.getState();
    store.setBlocksFromContent('## A\nA본문\n\n## B\nB본문\n\n## C\nC본문', 'test-tab-g1d');
    const before = flattenTree(useBlockStore.getState().blocks);
    const idA = before.find((b) => b.content.startsWith('## A'))!.id;
    const idB = before.find((b) => b.content.startsWith('## B'))!.id;
    const idC = before.find((b) => b.content.startsWith('## C'))!.id;

    // reorderBlocks 는 ReadView.tsx 의 드래그앤드롭이 실제로 호출하는 경로다.
    // [A,B,C] -> [C,A,B]
    store.reorderBlocks(2, 0);

    const after = flattenTree(useBlockStore.getState().blocks);
    assert.strictEqual(after.find((b) => b.content.startsWith('## A'))!.id, idA, 'A 는 위치가 바뀌어도 id 를 유지해야 한다');
    assert.strictEqual(after.find((b) => b.content.startsWith('## B'))!.id, idB, 'B 도 마찬가지');
    assert.strictEqual(after.find((b) => b.content.startsWith('## C'))!.id, idC, 'C 도 마찬가지');
  });
});
