/**
 * FEAT-20260904-01 — 탭별 디바운스 자동 저장 (T1)
 *
 * `updateContentForTab` → `scheduleAutosave` → (지연 후) `saveFile` 경로를
 * 실제 편집 경로(탭 스코프 스토어 `setContent` + `updateContentForTab`)로
 * 재현해 검증한다. `fileSystemRepository` 는 Node(node:test) 환경에서
 * `MockFileSystem`(인메모리 가상 디스크)으로 해석되므로 — `dirty_baseline_harness.ts`
 * 와 같은 전제 — "실제로 디스크에 쓰이는가"를 진짜로 확인할 수 있다.
 *
 * 'high'(1500ms) 경로만 실시간 대기로 검증한다. 'low'(5000ms)는 시간 비용이
 * 커서 스케줄링 여부(__isAutosaveScheduledForTests)와 지연값 자체(AUTOSAVE_DELAY_MS)
 * 만 확인한다 — 콜백이 실제로 도는지는 'high' 케이스가 이미 같은 코드 경로로
 * 증명한다.
 *
 * 실행: pnpm test:autosave
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { useDocumentStore } from '../model/store.ts';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useSettingsStore } from '@/entities/settings/model/store';
import { fileSystemRepository } from '@/shared/api/fs';
import { createTabStore } from '../model/tabStore.ts';
import { getTabStore, registerTabStore, __clearTabStoreRegistryForTests } from '../model/tabStoreRegistry.ts';
import {
  AUTOSAVE_DELAY_MS,
  shouldSkipAutosave,
  cancelAutosave,
  __clearAutosaveTimersForTests,
  __isAutosaveScheduledForTests,
} from '../model/autosave.ts';

const FILE = { name: 'auto.md', path: '/mock-workspace/auto.md', isDir: false };

const tabDirty = () => {
  const s = useDocumentStore.getState();
  const pane = s.getActivePane();
  return pane?.tabs.find((t) => t.id === pane.activeTabId)?.isDirty ?? false;
};
const onDisk = () => fileSystemRepository.readFile(FILE.path);

function liveStore() {
  let store = getTabStore(FILE.path);
  if (!store) {
    store = createTabStore(FILE.path, '');
    registerTabStore(FILE.path, store);
  }
  return store;
}

function edit(content: string) {
  liveStore().getState().setContent(content);
  useDocumentStore.getState().updateContentForTab(FILE.path, content);
}

async function freshLoad(initial: string) {
  __clearTabStoreRegistryForTests();
  __clearAutosaveTimersForTests();
  useWorkspaceStore.setState({ workspacePath: '/mock-workspace' });
  await fileSystemRepository.writeFile(FILE.path, initial);
  useDocumentStore.getState().resetDocumentState?.();
  useDocumentStore.setState({
    panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }] as any,
    activePaneId: 'pane-main',
  });
  await useDocumentStore.getState().loadFile(FILE as any);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  cancelAutosave(FILE.path);
  __clearAutosaveTimersForTests();
  useSettingsStore.getState().updateEditor({ autosaveLevel: 'high' });
});

test('FEAT-20260904-01 — shouldSkipAutosave (순수 판정)', () => {
  assert.equal(shouldSkipAutosave('기존 내용', ''), true, '직전 내용이 있는데 새 내용이 비면 건너뛴다');
  assert.equal(shouldSkipAutosave('기존 내용', '   '), true, '공백만 남아도 건너뛴다(trim 기준)');
  assert.equal(shouldSkipAutosave('', ''), false, '원래도 비어 있었으면 건너뛸 이유가 없다(새 파일)');
  assert.equal(shouldSkipAutosave('AAA', 'BBB'), false, '정상 편집은 건너뛰지 않는다');
});

test('FEAT-20260904-01 — 지연값 매핑', () => {
  assert.equal(AUTOSAVE_DELAY_MS.high, 1500);
  assert.equal(AUTOSAVE_DELAY_MS.low, 5000);
  assert.ok(AUTOSAVE_DELAY_MS.low > AUTOSAVE_DELAY_MS.high, 'low 가 high 보다 지연이 길어야 한다(저장 빈도가 낮다는 뜻)');
});

test('FEAT-20260904-01 자동 저장 흐름', async (t) => {
  await t.test('A1: high — 지연 뒤 실제로 디스크에 쓰이고 dirty 표시 2종이 함께 꺼진다', async () => {
    await freshLoad('AAA');
    useSettingsStore.getState().updateEditor({ autosaveLevel: 'high' });

    edit('BBB');
    assert.equal(tabDirty(), true, '편집 직후엔 dirty');
    assert.equal(await onDisk(), 'AAA', '디바운스 전엔 디스크가 아직 안 바뀐다');

    await sleep(AUTOSAVE_DELAY_MS.high + 200);

    assert.equal(await onDisk(), 'BBB', '지연 뒤 자동으로 디스크에 반영돼야 한다');
    assert.equal(tabDirty(), false, '탭 바 점(documentStore.isDirty)이 꺼져야 한다');
    assert.equal(liveStore().getState().isDirty, false, '저장 버튼이 구독하는 탭 스코프 스토어의 isDirty 도 꺼져야 한다');
  });

  await t.test('A2: off — 아무리 기다려도 쓰이지 않고 dirty 가 유지된다', async () => {
    await freshLoad('AAA');
    useSettingsStore.getState().updateEditor({ autosaveLevel: 'off' });

    edit('BBB');
    assert.equal(__isAutosaveScheduledForTests(FILE.path), false, 'off 면 애초에 예약되지 않는다');

    await sleep(AUTOSAVE_DELAY_MS.high + 200);

    assert.equal(await onDisk(), 'AAA', 'off 상태에서는 디스크가 바뀌면 안 된다');
    assert.equal(tabDirty(), true, 'dirty 도 유지돼야 한다');
  });

  await t.test('A3: 안전장치 — 직전 내용이 있는데 새 내용이 비면 건너뛰고 dirty 를 유지한다', async () => {
    await freshLoad('원본 내용이 있습니다');
    useSettingsStore.getState().updateEditor({ autosaveLevel: 'high' });

    edit('');
    assert.equal(__isAutosaveScheduledForTests(FILE.path), false, '빈 내용으로의 편집은 예약되지 않는다');
    assert.equal(tabDirty(), true, '건너뛰어도 편집 자체는 dirty 다 — 사용자가 수동으로 처리해야 한다');

    await sleep(AUTOSAVE_DELAY_MS.high + 200);

    assert.equal(await onDisk(), '원본 내용이 있습니다', '원본이 빈 내용으로 덮이면 안 된다');
  });

  await t.test('A4: 디바운스 — 지연 안에 연달아 편집해도 마지막 내용 1회만 반영된다', async () => {
    await freshLoad('AAA');
    useSettingsStore.getState().updateEditor({ autosaveLevel: 'high' });

    edit('BBB');
    await sleep(AUTOSAVE_DELAY_MS.high / 2);
    edit('CCC'); // 아직 발화 전 — 타이머가 재설정돼야 한다
    assert.equal(await onDisk(), 'AAA', '재설정된 타이머는 아직 발화하지 않았어야 한다');

    await sleep(AUTOSAVE_DELAY_MS.high + 200);
    assert.equal(await onDisk(), 'CCC', '마지막 내용이 반영돼야 한다(BBB 를 거치지 않아도 무방)');
  });

  await t.test('A5: cancelAutosave — 취소하면 지연이 지나도 쓰이지 않는다', async () => {
    await freshLoad('AAA');
    useSettingsStore.getState().updateEditor({ autosaveLevel: 'high' });

    edit('BBB');
    assert.equal(__isAutosaveScheduledForTests(FILE.path), true);
    cancelAutosave(FILE.path);
    assert.equal(__isAutosaveScheduledForTests(FILE.path), false);

    await sleep(AUTOSAVE_DELAY_MS.high + 200);
    assert.equal(await onDisk(), 'AAA', '취소됐으므로 디스크가 바뀌면 안 된다');
    assert.equal(tabDirty(), true, 'dirty 는 여전히 유지된다(저장이 실제로 안 됐으므로)');
  });

  await t.test('A6: low — 스케줄만 확인(지연이 길어 실시간 대기는 생략)', async () => {
    await freshLoad('AAA');
    useSettingsStore.getState().updateEditor({ autosaveLevel: 'low' });

    edit('BBB');
    assert.equal(__isAutosaveScheduledForTests(FILE.path), true, 'low 도 off 가 아니므로 예약은 된다');
  });
});
