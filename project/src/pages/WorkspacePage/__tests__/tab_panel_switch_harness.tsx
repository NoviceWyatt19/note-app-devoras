/**
 * T1.5 — 탭 전환 · 패널 전환 DOM 결과 (REF-20260902-01 first_targets #3)
 *
 * `PaneContainer`(WorkspacePage.tsx)의 탭 클릭·패널 클릭이 실제로 activeTab/
 * activePane 을 옮기고, 그 결과가 className(활성 탭 강조)과 렌더된 콘텐츠
 * (TabDocumentProvider 서브트리 교체)에 반영되는지 확인한다. 7-A 가 고친
 * 표면이라 순수 로직 하네스(pane_ownership_harness.ts)는 스토어 상태만
 * 본다 — 여기서는 클릭이 실제 DOM 을 옮기는지까지 본다.
 *
 * 실행: pnpm test:tabswitch
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePage } from '../WorkspacePage';
import { useDocumentStore } from '@/entities/document/model/store';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { fileSystemRepository } from '@/shared/api/fs';
import { __clearTabStoreRegistryForTests } from '@/entities/document/model/tabStoreRegistry';

const FILE_A = { name: 'tab-a.md', path: '/mock-workspace/tab-a.md', isDir: false };
const FILE_B = { name: 'tab-b.md', path: '/mock-workspace/tab-b.md', isDir: false };

afterEach(cleanup);

/** 한 패널에 두 파일을 열어 둔다 — 두 번째 loadFile 이 activeTabId 를 B 로 옮긴다. */
async function loadTwoTabs() {
  __clearTabStoreRegistryForTests();
  useWorkspaceStore.setState({ workspacePath: '/mock-workspace', files: [] });
  await fileSystemRepository.writeFile(FILE_A.path, '# A\n본문 A');
  await fileSystemRepository.writeFile(FILE_B.path, '# B\n본문 B');
  useDocumentStore.getState().resetDocumentState();
  useDocumentStore.setState({
    panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }] as any,
    activePaneId: 'pane-main',
  });
  await useDocumentStore.getState().loadFile(FILE_A as any);
  await useDocumentStore.getState().loadFile(FILE_B as any);
}

/** FileExplorer 사이드바에도 같은 파일명 텍스트가 뜨므로(사이드바 행), 탭 바
 *  고유 클래스 조합(`rounded-t border-t-2`, PaneContainer 탭 렌더)으로 좁힌다. */
function tabRow(title: string): HTMLElement {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('div[class*="rounded-t"]')).filter((el) =>
    el.textContent?.includes(title),
  );
  assert.strictEqual(rows.length, 1, `탭 바에서 "${title}" 행을 정확히 하나 찾지 못했다 (found ${rows.length})`);
  return rows[0];
}

test('두 파일을 열면 나중에 연 탭이 활성 탭 강조(className)를 받는다', async () => {
  await loadTwoTabs();
  render(<WorkspacePage />);

  assert.ok(tabRow('tab-b.md').className.includes('border-primary'), 'B 탭이 활성 강조를 받지 못했다');
  assert.ok(!tabRow('tab-a.md').className.includes('border-primary'), 'A 탭이 비활성인데 활성 강조를 받고 있다');
});

test('비활성 탭을 클릭하면 활성 탭이 바뀌고 강조 className 도 함께 옮겨간다', async () => {
  const user = userEvent.setup();
  await loadTwoTabs();
  render(<WorkspacePage />);

  await user.click(tabRow('tab-a.md'));

  assert.ok(tabRow('tab-a.md').className.includes('border-primary'), '클릭한 A 탭이 활성 강조를 받지 못했다');
  assert.ok(!tabRow('tab-b.md').className.includes('border-primary'), '이전 활성 탭(B)의 강조가 안 꺼졌다');
  assert.strictEqual(
    useDocumentStore.getState().getActiveTab()?.id,
    FILE_A.path,
    '스토어의 activeTabId 도 A 로 옮겨가야 한다',
  );
});

test('패널 분할 후 비활성 패널을 클릭하면 activePane 이 그쪽으로 바뀐다', async () => {
  const user = userEvent.setup();
  await loadTwoTabs();
  render(<WorkspacePage />);

  await user.click(screen.getByTitle('화면 좌우 분할'));

  // splitPane 은 항상 새 패널을 활성으로 만든다(store.ts:445) — 그러니 분할
  // 직후엔 원래 패널(pane-main)이 opacity-85 로 비활성 표시돼야 한다.
  const panes = useDocumentStore.getState().panes;
  assert.strictEqual(panes.length, 2, '분할 후 패널이 2개여야 한다');
  assert.notStrictEqual(useDocumentStore.getState().activePaneId, 'pane-main', '분할 직후엔 새 패널이 활성이어야 한다');

  const inactivePane = document.querySelector('.opacity-85');
  assert.ok(inactivePane, '비활성 패널(opacity-85)이 DOM 에 없다');

  await user.click(inactivePane as HTMLElement);

  assert.strictEqual(
    useDocumentStore.getState().activePaneId,
    'pane-main',
    '비활성 패널을 클릭해도 activePaneId 가 옮겨가지 않았다',
  );
});

test('activeTab 이 없는 패널에는 "열린 문서가 없습니다" 안내가 뜬다', async () => {
  __clearTabStoreRegistryForTests();
  useWorkspaceStore.setState({ workspacePath: '/mock-workspace', files: [] });
  useDocumentStore.getState().resetDocumentState();
  useDocumentStore.setState({
    panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }] as any,
    activePaneId: 'pane-main',
  });

  render(<WorkspacePage />);

  assert.ok(screen.getByText('열린 문서가 없습니다.'), '빈 패널 안내 문구가 렌더되지 않았다');
});
