/**
 * B1 / BUG-20260826-07 — dirty 판정 기준선(savedContent) 하네스 (T1)
 *
 * 결함: isDirty 가 "저장 기준선"이 아니라 직전 메모리 값과의 델타로 계산되어
 *       탭의 노란 점이 실제 디스크 반영 여부와 어긋난다.
 * 처방: TabItem.savedContent 를 기준선으로 두고 `content !== savedContent` 로 판정.
 *
 * DoD: **탭 노란 점 표시가 실제 디스크 반영 여부와 항상 일치**해야 한다.
 *      따라서 이 하네스는 isDirty 를 "디스크에 있는 내용과 다른가"와 대조한다.
 *
 * C-4(REF-20260831-01): 블록 스토어가 전역 싱글턴에서 탭 스코프로 바뀌었다.
 * "편집 경로"는 이제 탭 스코프 스토어에 setContent 를 호출한 뒤 updateContentForTab
 * 으로 TabItem.isDirty 를 갱신하는 것 — 실제 BlockEditor.handleBlockUpdate 가
 * 타는 경로와 동일하다.
 *
 * 실행: pnpm test:dirty
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { useDocumentStore } from '../model/store.ts';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { fileSystemRepository } from '@/shared/api/fs';
import { createTabStore } from '../model/tabStore.ts';
import { getTabStore, registerTabStore, __clearTabStoreRegistryForTests } from '../model/tabStoreRegistry.ts';

const FILE = { name: 'dirty.md', path: '/mock-workspace/dirty.md', isDir: false };

/** 활성 탭의 isDirty (탭의 노란 점) */
const tabDirty = () => {
  const s = useDocumentStore.getState();
  const pane = s.getActivePane();
  return pane?.tabs.find((t) => t.id === pane.activeTabId)?.isDirty ?? false;
};
/** 디스크에 실제로 들어 있는 내용 */
const onDisk = () => fileSystemRepository.readFile(FILE.path);

function liveStore() {
  let store = getTabStore(FILE.path);
  if (!store) {
    store = createTabStore(FILE.path, '');
    registerTabStore(FILE.path, store);
  }
  return store;
}

/** 앱의 실제 편집 경로를 그대로 재현한다 — 탭 스코프 스토어가 내용의 소유자다.
 *  saveFile 이 markdown 내용을 그 스토어에서 읽으므로 이 경로를 타야 의미가 있다. */
function edit(content: string) {
  liveStore().getState().setContent(content);
  useDocumentStore.getState().updateContentForTab(FILE.path, content);
}

async function freshLoad(initial: string) {
  __clearTabStoreRegistryForTests(); // 이전 테스트 케이스가 등록해 둔 탭 스토어 잔존 방지
  useWorkspaceStore.setState({ workspacePath: '/mock-workspace' });
  await fileSystemRepository.writeFile(FILE.path, initial);
  useDocumentStore.getState().resetDocumentState?.();
  useDocumentStore.setState({
    panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }] as any,
    activePaneId: 'pane-main',
  });
  await useDocumentStore.getState().loadFile(FILE as any);
}

test('BUG-20260826-07 — dirty 기준선', async (t) => {
  await t.test('D1: 저장 → 편집 → 같은 내용 재방출 시 dirty 가 유지된다', async () => {
    await freshLoad('AAA');
    assert.equal(tabDirty(), false, '로드 직후는 clean');

    edit('BBB');
    assert.equal(tabDirty(), true, '편집하면 dirty');

    // 같은 내용을 다시 방출해도 (기준선 대비 여전히 다르므로) dirty 유지
    edit('BBB');
    assert.equal(tabDirty(), true, '동일 내용 재방출로 dirty 가 풀리면 안 된다');
  });

  await t.test('D2: 편집 → 원문 복귀 시 dirty 가 해제된다', async () => {
    await freshLoad('AAA');
    edit('BBB');
    assert.equal(tabDirty(), true);

    edit('AAA');
    assert.equal(tabDirty(), false, 'Undo 로 원문에 돌아오면 clean 이어야 한다');
    assert.equal(await onDisk(), 'AAA', '디스크도 원문 — 표시와 실제가 일치');
  });

  await t.test('D3: 노드 좌표 변경이 dirty 를 만든다', async () => {
    await freshLoad('AAA');
    assert.equal(tabDirty(), false);

    // MindView 의 handleMouseMove 가 타는 경로: 탭 스코프 스토어의
    // updateNodeCoordinate + markTabDirty(탭 바 점 갱신, C-4 신설 — 좌표만
    // 바뀌면 콘텐츠 비교로는 dirty 를 못 잡는다).
    liveStore().getState().updateNodeCoordinate('node-1', 10, 20);
    useDocumentStore.getState().markTabDirty(FILE.path);
    assert.equal(tabDirty(), true, '좌표 변경도 저장 대상이므로 dirty');
  });

  // ── DoD 직결: 저장 이후에도 표시가 디스크와 일치하는가 ────────────────
  await t.test('D4: 저장 후 기준선이 갱신되어 dirty 표시가 디스크와 일치한다', async () => {
    await freshLoad('AAA');
    edit('BBB');
    await useDocumentStore.getState().saveFile();

    assert.equal(await onDisk(), 'BBB', '디스크에 BBB 가 저장됨');
    assert.equal(tabDirty(), false, '저장 직후는 clean');

    // 저장된 내용과 동일한 값을 다시 방출 → 디스크와 같으므로 clean 이어야 한다
    edit('BBB');
    assert.equal(
      tabDirty(),
      false,
      '디스크(BBB)와 내용(BBB)이 같은데 dirty 로 표시되면 기준선이 저장 시점에 갱신되지 않은 것이다',
    );
  });

  await t.test('D5: 저장 후 옛 원문으로 되돌리면 dirty 여야 한다 (위험 방향)', async () => {
    await freshLoad('AAA');
    edit('BBB');
    await useDocumentStore.getState().saveFile();
    assert.equal(await onDisk(), 'BBB');

    // 디스크는 BBB 인데 편집기는 AAA 로 되돌아갔다 → 저장 안 된 상태다
    edit('AAA');
    assert.equal(
      tabDirty(),
      true,
      '디스크(BBB)와 내용(AAA)이 다른데 clean 으로 보이면 사용자가 저장된 줄 알고 데이터를 잃는다',
    );
  });
});
