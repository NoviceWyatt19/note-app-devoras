/**
 * T1.5 — 저장 버튼 / 탭 dirty 점 (REF-20260902-01 first_targets #1)
 *
 * 탭 스코프 스토어 리팩터(REF-20260831-01) 이후 dirty 표시는 두 갈래로
 * 나뉜다 — ①저장 버튼 스타일은 useActiveTabStoreView() 가 레지스트리에서
 * 조회한 탭 스토어의 isDirty(WorkspacePage.tsx), ②탭 바의 노란 점은
 * useDocumentStore 의 panes[].tabs[].isDirty(updateContentForTab 이 저장
 * 기준선과 비교해 판정). 순수 로직 하네스(dirty_baseline_harness.ts)는
 * ②만 스토어 상태로 검사한다 — 이 하네스는 그 두 표시가 **실제 DOM**에서도
 * 함께 갱신되는지, WorkspacePage 전체를 렌더해서 확인한다.
 *
 * 실행: pnpm test:savedirty
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePage } from '../WorkspacePage';
import { useDocumentStore } from '@/entities/document/model/store';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { fileSystemRepository } from '@/shared/api/fs';
import { getTabStore, __clearTabStoreRegistryForTests } from '@/entities/document/model/tabStoreRegistry';

const FILE = { name: 'save-dirty.md', path: '/mock-workspace/save-dirty.md', isDir: false };

afterEach(cleanup);

async function freshLoad(initial: string) {
  __clearTabStoreRegistryForTests();
  useWorkspaceStore.setState({ workspacePath: '/mock-workspace', files: [] });
  await fileSystemRepository.writeFile(FILE.path, initial);
  useDocumentStore.getState().resetDocumentState();
  useDocumentStore.setState({
    panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }] as any,
    activePaneId: 'pane-main',
  });
  await useDocumentStore.getState().loadFile(FILE as any);
}

/** BlockEditor.handleBlockUpdate 가 실제로 타는 두 경로를 그대로 재현한다
 *  (탭 스토어 setDirty + 문서 스토어 updateContentForTab, BlockEditor.tsx:596/665).
 *  React 트리 밖에서 직접 zustand 스토어를 건드리므로, DOM 갱신을 동기적으로
 *  보장하려면 act() 로 감싸야 한다 — 아니면 저장 버튼 className 을 읽는 시점에
 *  아직 리렌더가 커밋되지 않아 테스트가 실제 결함 없이도 흔들린다. */
function editViaLiveTabStore(content: string) {
  const store = getTabStore(FILE.path);
  assert.ok(store, 'TabDocumentProvider 가 활성 탭 스토어를 레지스트리에 등록해 두지 않았다');
  act(() => {
    store!.getState().setContent(content);
    store!.getState().setDirty(true);
    useDocumentStore.getState().updateContentForTab(FILE.path, content);
  });
}

function saveButton(): HTMLElement {
  return screen.getByText('저장 (Cmd+S)').closest('button')!;
}

test('로드 직후 저장 버튼은 clean 스타일이고 탭 바에 점이 없다', async () => {
  await freshLoad('AAA');
  render(<WorkspacePage />);

  const btn = saveButton();
  assert.ok(!btn.className.includes('bg-primary/10'), '편집 전인데 저장 버튼이 dirty 스타일이다');
  assert.strictEqual(
    document.querySelector('.bg-warning'),
    null,
    '편집 전인데 탭 바에 dirty 점이 떠 있다',
  );
});

test('편집하면 저장 버튼과 탭 바 점이 함께 dirty 로 바뀐다', async () => {
  await freshLoad('AAA');
  render(<WorkspacePage />);

  editViaLiveTabStore('BBB');

  const btn = saveButton();
  assert.ok(btn.className.includes('bg-primary/10'), '편집 후 저장 버튼이 dirty 스타일로 바뀌지 않았다');
  assert.ok(document.querySelector('.bg-warning'), '편집 후 탭 바에 dirty 점이 뜨지 않았다');
});

test('저장 버튼 클릭 시 디스크에 반영되고 두 dirty 표시가 함께 꺼진다', async () => {
  const user = userEvent.setup();
  await freshLoad('AAA');
  render(<WorkspacePage />);

  editViaLiveTabStore('BBB');
  assert.ok(saveButton().className.includes('bg-primary/10'), '사전조건: 편집 후 dirty 여야 한다');

  await user.click(saveButton());
  // executeSave 가 저장 애니메이션 유지를 위해 400ms setTimeout 뒤에 isSaving
  // 을 끈다(WorkspacePage.tsx) — 그 전엔 버튼이 isSaving 스타일이라 dirty 여부를
  // 읽을 수 없다. 그 타이머가 만드는 상태 갱신도 act() 로 감싸 애니메이션이
  // 끝날 때까지 기다린 뒤 최종 상태를 본다.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });

  assert.strictEqual(await fileSystemRepository.readFile(FILE.path), 'BBB', '디스크에 반영되지 않았다');
  assert.ok(
    !saveButton().className.includes('bg-primary/10'),
    '저장 후에도 저장 버튼이 dirty 스타일로 남아 있다',
  );
  assert.strictEqual(
    document.querySelector('.bg-warning'),
    null,
    '저장 후에도 탭 바 dirty 점이 남아 있다 — 노란 점이 디스크 반영 여부와 어긋난다(B1/BUG-20260826-07 재발)',
  );
});
