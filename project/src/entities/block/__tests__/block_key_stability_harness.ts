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
