/**
 * P0-3 Stage A-2 (Step 7-A) — 패널 소유권 이전 하네스 (T1)
 *
 * 7-A 는 "전역 blockStore 를 편집하는 인스턴스를 상시 1개(활성 패널)로 제한"
 * 하고, 비활성 패널은 tab.cache 스냅샷만 그린다. 이 모델에서는 activePaneId
 * 가 바뀌는 모든 지점에서 **떠나는 패널의 미저장 편집을 먼저 tab.cache 에
 * 반영**해야 한다 — 안 하면 방금까지 편집하던 패널이 포커스를 잃는 순간
 * 옛 스냅샷을 보여준다(리뷰 중 project-1f 가 setActivePane 외에 closePane·
 * splitPane 도 같은 결함을 갖고 있음을 발견).
 *
 * 실행: pnpm test:paneownership
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { useDocumentStore } from '../model/store.ts';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useBlockStore } from '@/entities/block/model/store';
import { fileSystemRepository } from '@/shared/api/fs';

const A = { name: 'a.md', path: '/mock-workspace/a.md', isDir: false };
const B = { name: 'b.md', path: '/mock-workspace/b.md', isDir: false };

/** A 를 연 단일 패널(pane-main) 상태로 리셋. */
async function setupSinglePane() {
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
}

/** 활성 블록의 라이브 편집 상태를 시뮬레이션 — updateContent 가 실제 타이핑 경로다. */
function simulateLiveEdit(newContent: string) {
  useBlockStore.getState().setBlocksFromContent(newContent, useDocumentStore.getState().getCurrentFile()?.path);
  useDocumentStore.getState().updateContent(newContent);
}

function tabInPane(paneId: string, tabId: string) {
  return useDocumentStore.getState().panes.find((p) => p.id === paneId)?.tabs.find((t) => t.id === tabId);
}

test('7-A 패널 소유권 이전 — 떠나는 패널의 라이브 편집이 캐시에 반영된다', async (t) => {
  await t.test('P1: setActivePane — 다른 패널로 포커스를 옮기면 이전 패널의 편집이 캐시에 남는다', async () => {
    await setupSinglePane();
    useDocumentStore.getState().splitPane('pane-main', 'horizontal');
    // splitPane 이 activePaneId 를 새 패널로 옮겼다 — pane-main 으로 되돌아가서 편집한다.
    const mainPaneId = useDocumentStore.getState().panes[0].id;
    useDocumentStore.getState().setActivePane(mainPaneId);
    simulateLiveEdit('AAA EDITED');

    const otherPaneId = useDocumentStore.getState().panes[1].id;
    useDocumentStore.getState().setActivePane(otherPaneId);

    const cached = tabInPane(mainPaneId, A.path)?.cache?.rawContent;
    assert.strictEqual(cached, 'AAA EDITED', '포커스를 옮기기 전에 편집 내용이 캐시에 반영돼야 한다');
  });

  await t.test('P2: splitPane — 분할 시작 패널의 편집이 새 패널로 복사되는 tab 에도 반영된다', async () => {
    await setupSinglePane();
    simulateLiveEdit('AAA EDITED BEFORE SPLIT');

    useDocumentStore.getState().splitPane('pane-main', 'horizontal');

    const cached = tabInPane('pane-main', A.path)?.cache?.rawContent;
    assert.strictEqual(cached, 'AAA EDITED BEFORE SPLIT', '분할 전 편집이 원본 패널의 캐시에 반영돼야 한다');

    const newPane = useDocumentStore.getState().panes[1];
    const copiedTab = newPane.tabs.find((t) => t.id === A.path);
    assert.strictEqual(
      copiedTab?.cache?.rawContent,
      'AAA EDITED BEFORE SPLIT',
      '새 패널이 복사해가는 tab 객체도 최신 캐시를 가리켜야 한다(같은 tab 참조를 공유하므로)',
    );
  });

  await t.test('P3: closePane — 활성 패널을 닫으면 그 편집이 병합 대상 패널의 캐시에 반영된다', async () => {
    await setupSinglePane();
    useDocumentStore.getState().splitPane('pane-main', 'horizontal');
    const mainPaneId = useDocumentStore.getState().panes[0].id;
    const newPaneId = useDocumentStore.getState().panes[1].id;

    // 새 패널(활성)에서 편집한 뒤 그 패널을 닫는다 — 편집이 병합 대상(mainPane)으로 넘어가야 한다.
    simulateLiveEdit('AAA EDITED IN NEW PANE');
    useDocumentStore.getState().closePane(newPaneId);

    assert.strictEqual(useDocumentStore.getState().panes.length, 1, '패널이 하나로 병합돼야 한다');
    const cached = tabInPane(mainPaneId, A.path)?.cache?.rawContent;
    assert.strictEqual(cached, 'AAA EDITED IN NEW PANE', '닫히기 전 편집이 병합된 탭의 캐시에 반영돼야 한다');
  });

  await t.test('P4: closeTab — 활성 패널이 GC 되어 이미 탭을 가진 다른 패널로 넘어가면 그 콘텐츠가 로드된다', async () => {
    await setupSinglePane();
    useDocumentStore.getState().splitPane('pane-main', 'horizontal');
    const mainPaneId = useDocumentStore.getState().panes[0].id;
    const newPaneId = useDocumentStore.getState().panes[1].id;

    // 새 패널은 B 를 연다(A 를 그대로 두면 두 패널이 같은 탭을 공유해 GC 시나리오가 안 만들어진다).
    useDocumentStore.getState().setActivePane(newPaneId);
    await useDocumentStore.getState().openTab(B as any);
    // openTab 이 A 를 닫지 않으므로 명시적으로 A 를 지워 새 패널에 B 하나만 남긴다.
    useDocumentStore.getState().closeTab(newPaneId, A.path);
    assert.strictEqual(
      useDocumentStore.getState().panes.find((p) => p.id === newPaneId)?.tabs.length,
      1,
      '새 패널에 B 하나만 남아야 한다(시나리오 전제)',
    );

    // mainPane(A, 탭 1개, 활성)의 마지막 탭을 닫는다 — mainPane 이 GC 되고
    // 활성 소유권이 이미 B 를 열어둔 newPane 으로 넘어가야 한다.
    useDocumentStore.getState().setActivePane(mainPaneId);
    useDocumentStore.getState().closeTab(mainPaneId, A.path);

    assert.strictEqual(useDocumentStore.getState().panes.length, 1, 'mainPane 이 GC 로 사라져야 한다');
    assert.strictEqual(useDocumentStore.getState().activePaneId, newPaneId, '활성 소유권이 newPane 으로 넘어가야 한다');
    assert.strictEqual(
      useDocumentStore.getState().rawContent,
      'BBB',
      'newPane 이 이미 갖고 있던 B 의 콘텐츠가 전역 rawContent 에 로드돼야 한다(회귀: 이전엔 안 됐음)',
    );
  });

  await t.test('P5: openTab — 이미 다른 패널이 열어 둔 파일은 새 사본을 만들지 않고 그 패널로 포커스만 옮긴다', async () => {
    await setupSinglePane();
    useDocumentStore.getState().splitPane('pane-main', 'horizontal');
    const mainPaneId = useDocumentStore.getState().panes[0].id;
    const newPaneId = useDocumentStore.getState().panes[1].id;

    // mainPane 에서 B 를 연다(A 는 이미 두 패널 다 갖고 있으니 B 로 시나리오를 명확히 한다).
    useDocumentStore.getState().setActivePane(mainPaneId);
    await useDocumentStore.getState().openTab(B as any);
    assert.strictEqual(
      useDocumentStore.getState().panes.find((p) => p.id === mainPaneId)?.tabs.length,
      2,
      'mainPane 에 A·B 두 탭이 있어야 한다(시나리오 전제)',
    );

    // newPane(활성 아님)에서 다시 B 를 연다 — 새 사본을 만들지 않고 mainPane 으로 이동해야 한다.
    useDocumentStore.getState().setActivePane(newPaneId);
    await useDocumentStore.getState().openTab(B as any);

    assert.strictEqual(useDocumentStore.getState().activePaneId, mainPaneId, 'B 를 이미 연 mainPane 으로 포커스가 옮겨가야 한다');
    assert.strictEqual(
      useDocumentStore.getState().panes.find((p) => p.id === newPaneId)?.tabs.some((t) => t.id === B.path),
      false,
      'newPane 에는 B 의 새 사본이 생기면 안 된다',
    );
    assert.strictEqual(
      useDocumentStore.getState().panes.find((p) => p.id === mainPaneId)?.activeTabId,
      B.path,
      'mainPane 의 활성 탭이 B 여야 한다',
    );
  });
});
