/**
 * T1.5 — FileExplorer 클릭 / 컨텍스트 메뉴 (REF-20260902-01 first_targets #4)
 *
 * 어떤 T1 하네스도 이 위젯을 덮지 않는다(§2.1 evidence). 지원 파일(.md/.erd)
 * 클릭이 실제로 탭을 여는지, 디렉터리/파일 우클릭이 각기 다른 메뉴 항목
 * 집합을 보여주는지를 실제 DOM 상호작용으로 확인한다.
 *
 * 실행: pnpm test:fileexplorer
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileExplorer } from '../ui/FileExplorer';
import { useDocumentStore } from '@/entities/document/model/store';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { __clearTabStoreRegistryForTests } from '@/entities/document/model/tabStoreRegistry';

afterEach(cleanup);

/** MockFileSystem 이 `/mock-workspace` 에 기본 제공하는 README.md · 기획안.md ·
 *  assets/ 를 그대로 쓴다(shared/api/fs.ts) — 별도 파일을 쓰지 않아도 된다. */
async function openMockWorkspace() {
  __clearTabStoreRegistryForTests();
  useDocumentStore.getState().resetDocumentState();
  useDocumentStore.setState({
    panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }] as any,
    activePaneId: 'pane-main',
  });
  useWorkspaceStore.setState({ workspacePath: '/mock-workspace', files: [] });
  await useWorkspaceStore.getState().scanWorkspace();
}

test('지원 파일(.md) 클릭 시 탭이 열리고 문서 스토어의 활성 파일이 된다', async () => {
  const user = userEvent.setup();
  await openMockWorkspace();
  render(<FileExplorer />);

  await user.click(screen.getByText('README.md'));

  const currentFile = useDocumentStore.getState().getCurrentFile();
  assert.strictEqual(currentFile?.path, '/mock-workspace/README.md', 'README.md 클릭이 탭을 열지 않았다');
});

test('파일(디렉터리 아님) 우클릭 메뉴는 "이름 변경"/"삭제"만 보여주고 "새 문서"류는 숨긴다', async () => {
  await openMockWorkspace();
  render(<FileExplorer />);

  fireEvent.contextMenu(screen.getByText('README.md'), { pageX: 40, pageY: 60 });

  assert.ok(screen.getByText('이름 변경'), '파일 우클릭 메뉴에 "이름 변경" 이 없다');
  assert.ok(screen.getByText('삭제'), '파일 우클릭 메뉴에 "삭제" 가 없다');
  assert.strictEqual(
    screen.queryByText('새 문서'),
    null,
    '파일(디렉터리 아님) 우클릭인데 "새 문서" 항목이 떴다 — isDir 분기가 깨졌다',
  );
});

test('디렉터리 우클릭 메뉴는 "새 문서"/"새 ERD 문서"/"새 폴더"를 보여준다', async () => {
  await openMockWorkspace();
  render(<FileExplorer />);

  fireEvent.contextMenu(screen.getByText('assets'), { pageX: 40, pageY: 60 });

  assert.ok(screen.getByText('새 문서'), '디렉터리 우클릭 메뉴에 "새 문서" 가 없다');
  assert.ok(screen.getByText('새 ERD 문서'), '디렉터리 우클릭 메뉴에 "새 ERD 문서" 가 없다');
  assert.ok(screen.getByText('새 폴더'), '디렉터리 우클릭 메뉴에 "새 폴더" 가 없다');
});

test('빈 공간 우클릭 메뉴도 "새 문서" 류를 보여준다(entry=null 분기)', async () => {
  await openMockWorkspace();
  render(<FileExplorer />);

  const root = screen.getByText('워크스페이스').closest('div[class*="flex-1 flex flex-col"]')!;
  fireEvent.contextMenu(root, { pageX: 10, pageY: 10 });

  assert.ok(screen.getByText('새 문서'), '빈 공간 우클릭 메뉴에 "새 문서" 가 없다');
  assert.strictEqual(
    screen.queryByText('이름 변경'),
    null,
    '빈 공간(entry=null) 우클릭인데 "이름 변경" 이 떴다',
  );
});
