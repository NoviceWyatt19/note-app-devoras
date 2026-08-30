/**
 * B1 / BUG-20260826-04 — 미저장 탭 종료 가드 하네스 (T1)
 *
 * 결함: dirty 탭이 Cmd+W · X 버튼 · 앱 종료 시 경고 없이 파괴된다.
 * 처방: confirmDiscardIfDirty / hasDirtyTabs (project/src/pages/WorkspacePage/lib/confirmClose.ts)
 *
 * 확인 방법에 관해:
 *   `confirmDiscardIfDirty` 는 Tauri 의 `ask` 를 직접 import 한다. Node 에는 `window` 가
 *   없으므로 **ask 에 도달하면 ReferenceError 가 난다.** 이걸 그대로 관측 수단으로 쓴다 —
 *   던지지 않고 true 가 나오면 "확인 창을 띄우지 않았다"는 증거이고,
 *   던지면 "확인 창을 띄우려 했다"는 증거다. 목(mock) 없이 게이트 동작을 증명할 수 있다.
 *
 * 실행: pnpm test:closeguard
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { useDocumentStore } from '../model/store.ts';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useBlockStore } from '@/entities/block/model/store';
import { confirmDiscardIfDirty, hasDirtyTabs } from '@/pages/WorkspacePage/lib/confirmClose';
import { fileSystemRepository } from '@/shared/api/fs';

const A = { name: 'a.md', path: '/mock-workspace/a.md', isDir: false };
const B = { name: 'b.md', path: '/mock-workspace/b.md', isDir: false };

const pane = () => {
  const p = useDocumentStore.getState().getActivePane();
  assert.ok(p, '활성 패널이 있어야 한다');
  return p;
};
const tabIds = () => pane().tabs.map((t) => t.id);
const tabById = (id: string) => pane().tabs.find((t) => t.id === id);

async function setup() {
  useWorkspaceStore.setState({ workspacePath: '/mock-workspace' });
  await fileSystemRepository.writeFile(A.path, 'AAA');
  await fileSystemRepository.writeFile(B.path, 'BBB');
  useDocumentStore.setState({
    panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }] as any,
    activePaneId: 'pane-main',
    rawContent: '',
    isDirty: false,
  });
  await useDocumentStore.getState().loadFile(A as any);
  await useDocumentStore.getState().loadFile(B as any);
}

/** WorkspacePage.tsx 의 닫기 흐름을 그대로 재현 (confirm 만 주입 가능하게). */
async function closeWithGuard(tabId: string, confirm: (dirty: boolean) => Promise<boolean>) {
  const tab = tabById(tabId);
  const canClose = tab?.isDirty ? await confirm(true) : true;
  if (canClose) useDocumentStore.getState().closeTab('pane-main', tabId);
  return canClose;
}

test('BUG-20260826-04 — 미저장 탭 종료 가드', async (t) => {
  await t.test('C1: clean 탭은 확인 창 없이 닫힌다', async () => {
    await setup();
    // 게이트가 ask 에 도달하지 않는다는 증거 — 던지지 않고 true 를 돌려준다
    assert.equal(await confirmDiscardIfDirty(tabById(A.path)), true);
    assert.equal(await confirmDiscardIfDirty(undefined), true, '탭이 없으면 막지 않는다');

    await closeWithGuard(A.path, async () => {
      throw new Error('clean 탭인데 확인 창을 띄웠다');
    });
    assert.ok(!tabIds().includes(A.path), 'clean 탭은 제거된다');
  });

  await t.test('C2: dirty 탭은 확인 창을 띄운다', async () => {
    await setup();
    useBlockStore.getState().setBlocksFromContent('EDITED', B.path);
    useDocumentStore.getState().updateContent('EDITED');
    assert.equal(tabById(B.path)?.isDirty, true, '편집으로 dirty 가 된다');

    // ask 에 도달하면 Node 에서 window 참조로 던진다 → 확인 창을 띄우려 했다는 증거
    await assert.rejects(
      () => confirmDiscardIfDirty(tabById(B.path)),
      /window is not defined/,
      'dirty 탭은 확인 창 경로로 들어가야 한다',
    );
  });

  await t.test('C3: dirty + 취소 → 탭과 cache 가 모두 보존된다', async () => {
    await setup();
    useBlockStore.getState().setBlocksFromContent('EDITED', B.path);
    useDocumentStore.getState().updateContent('EDITED');

    const ok = await closeWithGuard(B.path, async () => false);
    assert.equal(ok, false);
    assert.ok(tabIds().includes(B.path), '취소했으므로 탭이 남아 있어야 한다');
    assert.equal(tabById(B.path)?.isDirty, true, 'dirty 표시도 유지된다');
    assert.equal(
      useDocumentStore.getState().rawContent,
      'EDITED',
      '취소 시 편집 내용이 살아 있어야 한다 (DoD: 취소 시 편집 내용 유지)',
    );
  });

  await t.test('C4: dirty + 확인 → 탭이 제거된다', async () => {
    await setup();
    useBlockStore.getState().setBlocksFromContent('EDITED', B.path);
    useDocumentStore.getState().updateContent('EDITED');

    const ok = await closeWithGuard(B.path, async () => true);
    assert.equal(ok, true);
    assert.ok(!tabIds().includes(B.path), '확인했으므로 탭이 제거된다');
  });

  await t.test('C5: 앱 종료 가드 — dirty 탭이 하나라도 있으면 감지한다', async () => {
    await setup();
    assert.equal(hasDirtyTabs(useDocumentStore.getState().panes), false, '전부 clean');

    useBlockStore.getState().setBlocksFromContent('EDITED', B.path);
    useDocumentStore.getState().updateContent('EDITED');
    assert.equal(
      hasDirtyTabs(useDocumentStore.getState().panes),
      true,
      '한 탭만 dirty 여도 종료를 막아야 한다',
    );
  });

  // 세션 티켓의 미검증 항목: "savedContent 가 스냅샷/복원 경로에서 유실되지 않는지"
  await t.test('C6: savedContent 가 탭 전환(스냅샷↔캐시 복원)에서 유실되지 않는다', async () => {
    await setup();
    assert.equal(tabById(B.path)?.savedContent, 'BBB', '로드 시 기준선이 잡힌다');

    // B 편집 → A 로 전환(스냅샷) → B 로 복귀(캐시 복원)
    useBlockStore.getState().setBlocksFromContent('EDITED', B.path);
    useDocumentStore.getState().updateContent('EDITED');
    await useDocumentStore.getState().openTab(A as any);
    await useDocumentStore.getState().openTab(B as any);

    assert.equal(
      tabById(B.path)?.savedContent,
      'BBB',
      '기준선이 스냅샷/복원 왕복에서 살아남아야 한다 — 유실되면 dirty 판정이 무너진다',
    );
    assert.equal(tabById(B.path)?.isDirty, true, '복원 후에도 dirty 가 유지된다');
    assert.equal(useDocumentStore.getState().rawContent, 'EDITED', '편집 내용도 복원된다');
  });

  // 실기(빌드) 테스트 중 발견: 활성 탭을 닫으면 activeTabId 는 다음 탭으로 넘어가는데
  // rawContent/nodes/spatialData 는 방금 닫힌 탭 것으로 남아, 화면이 새 활성 탭과
  // 어긋나고 이후 그 탭을 다시 클릭해도 setActiveTab 의 "이미 활성 탭" 가드에 걸려
  // 아무 반응이 없는 것처럼 보이는 회귀였다.
  await t.test('C7: 활성 탭을 닫으면 rawContent 가 새 활성 탭 것으로 즉시 갱신된다', async () => {
    await setup();
    // setup() 직후 활성 탭은 B(마지막에 로드됨).
    assert.equal(pane().activeTabId, B.path);
    assert.equal(useDocumentStore.getState().rawContent, 'BBB');

    await useDocumentStore.getState().closeTab('pane-main', B.path);

    assert.equal(pane().activeTabId, A.path, '다음 활성 탭은 A 여야 한다');
    assert.equal(
      useDocumentStore.getState().rawContent,
      'AAA',
      'rawContent 가 새 활성 탭(A) 내용으로 갱신되어야 한다 — 방금 닫힌 B 의 내용(BBB)이 남아있으면 회귀',
    );
  });
});
