/**
 * DEBUG_PLAN §5.0.4 — ReadView 드래그 재정렬 무회귀(Step 2 진입 게이트 항목).
 *
 * `SingleDocEditor`(Step 1)는 블록별 `updateBlockContent` 가 아니라 **디바운스된
 * 전체 문서 `setContent(rawText)`** 로 tabStore 를 동기화한다(`SingleDocEditor.tsx`
 * `syncContent`). ReadView 의 드래그 재정렬(`reorderBlocks`)은 이 배치에서 손대지
 * 않았지만 — 그 무사함이 "한 번도 안 건드렸다"만으로 보장되지 않는다: 재정렬은
 * `resolveBlocksFromContent` 의 2-패스 id 매칭이 만든 `blocks` 트리 위에서 동작하고,
 * 그 매칭은 "직전 blocks 대비 이번 content 가 얼마나 다른가"에 민감한 휴리스틱이다.
 * 블록 단위의 작은 diff 만 밀어 넣던 옛 경로와 달리, 단일 CM 은 **문서 전체를 한
 * 번에** 새 `setContent` 로 밀어 넣는다 — 이 하네스는 그 큰 diff 패턴 아래에서도
 * id 매칭(따라서 재정렬)이 여전히 정확한지를 재확인한다.
 *
 * `project-8c` 제안(2026-09-03): "T1 이 지금 닫을 수 있는 몫" — 드래그 제스처
 * 자체(T2)가 아니라, 재정렬이 의존하는 **id 안정성이 단일 CM 편집 패턴 아래서도
 * 유지되는가"를 검증한다.
 *
 * 실행: pnpm test:readvieweorder
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { flattenTree } from '@/entities/block/model/store';
import { createTabStore } from '../model/tabStore';

/** SingleDocEditor 의 디바운스 동기화를 흉내낸다 — 블록별 diff 가 아니라
 *  "지금 이 순간의 문서 전체 문자열"을 그대로 setContent 에 민다. */
function simulateSingleDocSync(tabStore: ReturnType<typeof createTabStore>, fullContent: string) {
  tabStore.getState().setContent(fullContent);
}

test('단일 CM 편집(전체 문서 setContent) 이후에도 재정렬이 올바른 순서를 만든다', () => {
  const tabStore = createTabStore('test-singledoc-reorder-1');
  simulateSingleDocSync(tabStore, '## A\nA 본문\n\n## B\nB 본문\n\n## C\nC 본문');

  const before = flattenTree(tabStore.getState().blocks);
  const idA = before.find((b) => b.content.startsWith('## A'))!.id;
  const idB = before.find((b) => b.content.startsWith('## B'))!.id;
  const idC = before.find((b) => b.content.startsWith('## C'))!.id;

  // SingleDocEditor 스타일 편집 — B 의 본문만 바꾸되, "블록 하나만" 이 아니라
  // 문서 전체 문자열을 통째로 다시 밀어 넣는다(실제 syncContent 가 하는 그대로).
  simulateSingleDocSync(tabStore, '## A\nA 본문\n\n## B\nB 본문 수정됨\n\n## C\nC 본문');

  const afterEdit = flattenTree(tabStore.getState().blocks);
  assert.strictEqual(afterEdit.find((b) => b.content.startsWith('## A'))!.id, idA, '무관한 편집인데 A 의 id 가 바뀌었다');
  assert.strictEqual(afterEdit.find((b) => b.content.startsWith('## C'))!.id, idC, '무관한 편집인데 C 의 id 가 바뀌었다');
  const editedB = afterEdit.find((b) => b.content.startsWith('## B'))!;
  assert.strictEqual(editedB.id, idB, '편집한 B 자신의 id 가 바뀌었다(2-패스 매칭 실패)');
  assert.ok(editedB.content.includes('B 본문 수정됨'), 'B 의 편집 내용이 반영되지 않았다');

  // ReadView 드래그 — [A,B,C] -> [C,A,B] (인덱스 2 를 0 으로).
  tabStore.getState().reorderBlocks(2, 0);

  const afterReorder = flattenTree(tabStore.getState().blocks);
  assert.deepStrictEqual(
    afterReorder.map((b) => b.content.split('\n')[0]),
    ['## C', '## A', '## B'],
    '재정렬 결과 순서가 의도(C,A,B)와 다르다',
  );
  assert.strictEqual(afterReorder.find((b) => b.content.startsWith('## A'))!.id, idA, '재정렬 후 A id 보존');
  assert.strictEqual(afterReorder.find((b) => b.content.startsWith('## C'))!.id, idC, '재정렬 후 C id 보존');
  assert.strictEqual(afterReorder.find((b) => b.content.startsWith('## B'))!.id, idB, '재정렬 후 B id 보존');
});

test('재정렬 이후에도 단일 CM 편집(전체 문서 setContent) 이 계속 정상 동작한다 — 왕복 확인', () => {
  const tabStore = createTabStore('test-singledoc-reorder-2');
  simulateSingleDocSync(tabStore, '## A\nA 본문\n\n## B\nB 본문\n\n## C\nC 본문');
  tabStore.getState().reorderBlocks(2, 0); // -> [C, A, B]

  const afterReorder = flattenTree(tabStore.getState().blocks);
  const idA = afterReorder.find((b) => b.content.startsWith('## A'))!.id;
  const idB = afterReorder.find((b) => b.content.startsWith('## B'))!.id;
  const idC = afterReorder.find((b) => b.content.startsWith('## C'))!.id;

  // 재정렬 직후 SingleDocEditor 로 계속 편집(A 본문 수정) — 전체 문서를 다시 민다.
  const mergedAfterReorder = afterReorder.map((b) => b.content).join('\n');
  const editedContent = mergedAfterReorder.replace('A 본문', 'A 본문 재편집됨');
  simulateSingleDocSync(tabStore, editedContent);

  const final = flattenTree(tabStore.getState().blocks);
  assert.deepStrictEqual(
    final.map((b) => b.content.split('\n')[0]),
    ['## C', '## A', '## B'],
    '재정렬 후 이어진 편집에서 순서가 무너졌다',
  );
  assert.strictEqual(final.find((b) => b.content.startsWith('## A'))!.id, idA, '재정렬 후 편집에서 A id 가 바뀌었다');
  assert.strictEqual(final.find((b) => b.content.startsWith('## B'))!.id, idB, '재정렬 후 편집에서 B id 가 바뀌었다');
  assert.strictEqual(final.find((b) => b.content.startsWith('## C'))!.id, idC, '재정렬 후 편집에서 C id 가 바뀌었다');
  assert.ok(
    final.find((b) => b.content.startsWith('## A'))!.content.includes('재편집됨'),
    'A 재편집 내용이 반영되지 않았다',
  );
});

test('중첩 헤딩(부모+자식)도 단일 CM 편집 후 재정렬이 그룹째로 옮긴다', () => {
  const tabStore = createTabStore('test-singledoc-reorder-3');
  simulateSingleDocSync(
    tabStore,
    '## A\nA 본문\n\n### A1\nA1 본문\n\n## B\nB 본문\n\n## C\nC 본문',
  );

  // SingleDocEditor 스타일 편집 — A1 본문만 수정, 문서 전체를 다시 민다.
  simulateSingleDocSync(
    tabStore,
    '## A\nA 본문\n\n### A1\nA1 본문 수정\n\n## B\nB 본문\n\n## C\nC 본문',
  );

  const before = flattenTree(tabStore.getState().blocks);
  const aIndex = before.findIndex((b) => b.content.startsWith('## A\n'));
  const cIndex = before.findIndex((b) => b.content.startsWith('## C'));

  // A(+자식 A1) 그룹을 C 뒤로 옮긴다.
  tabStore.getState().reorderBlocks(aIndex, cIndex);

  const after = flattenTree(tabStore.getState().blocks);
  const topLines = after.map((b) => b.content.split('\n')[0]);
  assert.deepStrictEqual(topLines, ['## B', '## C', '## A', '### A1'], 'A/A1 그룹이 통째로 옮겨지지 않았다');
  const movedA1 = after.find((b) => b.content.startsWith('### A1'))!;
  assert.ok(movedA1.content.includes('A1 본문 수정'), 'A1 의 편집 내용이 재정렬 후에도 유지돼야 한다');
});
