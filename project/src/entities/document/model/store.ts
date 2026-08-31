import { create } from 'zustand';
import { FileEntry, fileSystemRepository } from '@/shared/api/fs';
import { MindNode, parseMarkdown } from '@/entities/document/lib/parser';
import { isSameOrInside, rebasePath } from '@/shared/lib/path';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { getTabStore } from './tabStoreRegistry';

export type TabType = 'markdown' | 'mindmap-global' | 'erd';

export interface TabCache {
  rawContent: string;
  nodes: MindNode[];
  spatialData: Record<string, { x: number; y: number }>;
}

export interface TabItem {
  id: string;            // filePath 혹은 'global-mindmap'
  type: TabType;
  title: string;
  filePath?: string;     // markdown, erd 일 때 파일 경로
  fileEntry?: FileEntry; // markdown, erd 일 때 FileEntry 저장
  isDirty?: boolean;
  savedContent?: string;
  cache?: TabCache;      // 탭 전환 시 미저장 편집 내용을 보존하는 인메모리 캐시
}

export interface SplitPane {
  id: string;            // 'pane-1', 'pane-2' ...
  tabs: TabItem[];       // 해당 패널의 열려있는 탭 목록
  activeTabId: string;   // 현재 활성화된 탭 ID
}

interface DocumentState {
  // ── 패널 & 탭 구조 상태 ──────────────────────────────────────────
  panes: SplitPane[];
  activePaneId: string;
  layoutDirection: 'horizontal' | 'vertical';

  // ── 활성 파일 로드/저장에 쓰는 워크스페이스 메타데이터 ────────────────
  // C-4(REF-20260831-01): rawContent/nodes/isDirty/viewMode 는 탭 스코프
  // TabDocumentProvider 로 전부 이관됐다. spatialData 는 이 티켓의 5개 필드에
  // 포함되지 않는다 — 파일별 마인드맵 좌표를 spatial-metadata.json 에서
  // 읽고/쓸 때만 쓰는 전송용 필드로 남긴다(로드 시 정렬 입력, 저장 시 출력).
  spatialData: Record<string, { x: number; y: number }>;

  // ── Helper Getters ──────────────────────────────────────────────
  getActivePane: () => SplitPane | undefined;
  getActiveTab: () => TabItem | undefined;
  getCurrentFile: () => FileEntry | null;

  // ── Tab & Pane 액션 ─────────────────────────────────────────────
  loadFile: (file: FileEntry) => Promise<void>;
  openTab: (file: FileEntry | { type: 'mindmap-global' }) => Promise<void>;
  closeTab: (paneId: string, tabId: string) => void;
  closePane: (paneId: string) => void;
  setActiveTab: (paneId: string, tabId: string) => void;
  setActivePane: (paneId: string) => void;
  splitPane: (sourcePaneId: string, direction: 'horizontal' | 'vertical') => void;
  resetDocumentState: () => void;

  // ── Document/Editor 액션 ─────────────────────────────────────────
  _snapshotActiveTab: () => SplitPane[];
  _activateTabContent: (paneId: string, tabId: string, panesBase: SplitPane[]) => Promise<void>;
  updateContentForTab: (tabId: string, content: string) => void;
  /**
   * 콘텐츠 텍스트는 안 바뀌었지만(예: 마인드맵 노드 좌표 드래그) 저장 대상인
   * 변경이 생겼을 때 탭 바 점(dot)을 켠다. updateContentForTab 은 `content !==
   * savedContent` 비교로 dirty 를 판정하므로 좌표만 바뀐 경우엔 무반응이다 —
   * 이 액션은 비교 없이 무조건 켠다.
   */
  markTabDirty: (tabId: string) => void;
  saveFile: (paneId?: string, tabId?: string) => Promise<void>;

  // ── File System Sync 액션 ────────────────────────────────────────
  handleFileRenamed: (oldPath: string, newPath: string, newName: string) => void;
  handleFileDeleted: (path: string, isDir: boolean) => void;
}

let openSeq = 0;

/** loadedSpatialData 로 새로 파싱된 nodes 의 좌표를 정렬한다(로드 경로 공통 로직). */
function alignNodes(nodes: MindNode[], spatialData: Record<string, { x: number; y: number }>): MindNode[] {
  return nodes.map((node) => {
    if (spatialData[node.id]) {
      return { ...node, x: spatialData[node.id].x, y: spatialData[node.id].y };
    }
    const baseId = node.id.replace(/_\d+$/, '');
    if (baseId !== node.id && spatialData[baseId]) {
      return { ...node, x: spatialData[baseId].x, y: spatialData[baseId].y };
    }
    return node;
  });
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  panes: [
    {
      id: 'pane-main',
      tabs: [],
      activeTabId: '',
    },
  ],
  activePaneId: 'pane-main',
  layoutDirection: 'horizontal',

  spatialData: {},

  // Getters
  getActivePane: () => {
    const { panes, activePaneId } = get();
    return panes.find((p) => p.id === activePaneId) || panes[0];
  },

  getActiveTab: () => {
    const pane = get().getActivePane();
    if (!pane) return undefined;
    return pane.tabs.find((t) => t.id === pane.activeTabId);
  },

  getCurrentFile: () => {
    const activeTab = get().getActiveTab();
    if (activeTab && (activeTab.type === 'markdown' || activeTab.type === 'erd')) {
      return activeTab.fileEntry || null;
    }
    return null;
  },

  // ── Tab & Pane 관리 로직 ──────────────────────────────────────────
  loadFile: async (file) => {
    await get().openTab(file);
  },

  openTab: async (item) => {
    const panesWithSnapshot = get()._snapshotActiveTab();
    // 스냅샷을 **즉시 커밋**한다 (BUG-20260826-02 잔여 구멍).
    // 아래 디스크 로드 경로는 await 뒤에 `get().panes` 를 다시 읽으므로, 여기서
    // 커밋하지 않으면 떠나는 탭의 미저장 편집이 통째로 버려진다 —
    // BUG-20260826-02 가 캐시 복원 분기만 고치고 로드 분기를 놓친 잔여 구멍이다.
    // 먼저 커밋해 두면 로드가 실패하거나 openSeq 로 무효화되어도 버퍼는 살아남는다.
    if (panesWithSnapshot !== get().panes) set({ panes: panesWithSnapshot });
    const { activePaneId } = get();
    const activePane = panesWithSnapshot.find((p) => p.id === activePaneId) || panesWithSnapshot[0];

    // 1. 독립 마인드뷰 탭 오픈 요청
    if ('type' in item && item.type === 'mindmap-global') {
      const tabId = 'global-mindmap';
      const existingTab = activePane.tabs.find((t) => t.id === tabId);

      if (!existingTab) {
        const newTab: TabItem = {
          id: tabId,
          type: 'mindmap-global',
          title: '전역 마인드맵',
        };
        const updatedPanes = panesWithSnapshot.map((p) =>
          p.id === activePane.id
            ? { ...p, tabs: [...p.tabs, newTab], activeTabId: tabId }
            : p
        );
        set({ panes: updatedPanes });
      } else {
        set({
          panes: panesWithSnapshot.map((p) => (p.id === activePane.id ? { ...p, activeTabId: tabId } : p)),
        });
      }
      return;
    }

    // 2. 일반 마크다운 파일 오픈 요청
    const file = item as FileEntry;
    const tabId = file.path;

    // 7-A Edge Case: 같은 파일을 다른 패널이 이미 열고 있으면 거기에 새 사본을
    // 만드는 대신 그 패널로 포커스만 옮긴다. 각 패널은 독립된 tabs 배열을
    // 가지므로, 막지 않으면 같은 파일에 대해 캐시/isDirty 가 패널마다
    // 따로 갈라진다 — 어느 쪽이 "진짜" 최신인지 판단할 방법이 없어진다.
    const otherPaneWithTab = panesWithSnapshot.find(
      (p) => p.id !== activePane.id && p.tabs.some((t) => t.id === tabId),
    );
    if (otherPaneWithTab) {
      get().setActivePane(otherPaneWithTab.id);
      await get().setActiveTab(otherPaneWithTab.id, tabId);
      return;
    }

    const existingTab = activePane.tabs.find((t) => t.id === tabId);

    // 캐시 우선 복원 — cache 는 이미 rawContent/nodes/spatialData 를 전부 갖고
    // 있으므로 activeTabId 만 바꾸면 된다. TabDocumentProvider 가 activeTab.cache
    // 에서 initialContent/initialNodes 를 읽어 탭 스코프 스토어를 새로 만든다.
    if (existingTab?.cache) {
      set({
        panes: panesWithSnapshot.map(p => p.id === activePane.id ? { ...p, activeTabId: tabId } : p),
      });
      return;
    }

    const token = ++openSeq;
    try {
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      if (!workspacePath) return;

      const content = await fileSystemRepository.readFile(file.path);
      const isErd = file.path.toLowerCase().endsWith('.erd');

      const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);

      if (token !== openSeq) return;

      // await 이후 다시 탭 존재 여부 확인 (중간에 닫혔을 수도 있음, 하지만 새로 여는 경우는 무조건 추가)
      const currentPanes = get().panes;
      const currentActivePane = currentPanes.find(p => p.id === activePane.id);
      if (!currentActivePane) return; // 패널이 통째로 닫힘

      const spatialData = allMetadata[file.path] || {};
      const parsedNodes = isErd ? [] : parseMarkdown(content);
      const alignedNodes = alignNodes(parsedNodes, spatialData);
      const cache: TabCache = { rawContent: content, nodes: alignedNodes, spatialData };

      const stillExistingTab = currentActivePane.tabs.find((t) => t.id === tabId);
      const updatedTabs = stillExistingTab
        ? currentActivePane.tabs.map((t) => (t.id === tabId ? { ...t, cache } : t))
        : [
            ...currentActivePane.tabs,
            {
              id: tabId,
              type: (isErd ? 'erd' : 'markdown') as TabType,
              title: file.name,
              filePath: file.path,
              fileEntry: file,
              isDirty: false,
              savedContent: content,
              cache,
            },
          ];

      set({
        panes: currentPanes.map((p) =>
          p.id === activePane.id
            ? { ...p, tabs: updatedTabs, activeTabId: tabId }
            : p
        ),
        spatialData,
      });
    } catch (e) {
      console.error(`Failed to load file ${file.path}:`, e);
    }
  },

  setActiveTab: async (paneId, tabId) => {
    const { panes, activePaneId } = get();
    const pane = panes.find((p) => p.id === paneId);
    if (!pane) return;

    if (pane.activeTabId === tabId && paneId === activePaneId) return; // 이미 활성 탭

    // ── Step 1: 현재 활성 탭의 편집 상태를 캐시에 저장 ──
    const panesWithSavedCache = get()._snapshotActiveTab();

    // ── Step 2: 대상 탭 활성화 + Step 3: 캐시에서 복원 또는 디스크에서 로드 ──
    const updatedPanes = panesWithSavedCache.map((p) =>
      p.id === paneId ? { ...p, activeTabId: tabId } : p
    );
    await get()._activateTabContent(paneId, tabId, updatedPanes);
  },

  // setActiveTab(사용자가 탭을 클릭)과 closeTab(닫은 탭 다음으로 자동 전환)이
  // 공유하는 콘텐츠 복원 로직. panesBase 는 activeTabId 전환까지 이미 반영된
  // panes — 이 함수는 targetTab 을 그 안에서 찾아 캐시 또는 디스크에서 콘텐츠를
  // 복원해 커밋하기만 한다(활성 탭 자체를 바꾸는 책임은 호출자에게 있다).
  _activateTabContent: async (paneId, tabId, panesBase) => {
    const pane = panesBase.find((p) => p.id === paneId);
    const targetTab = pane?.tabs.find((t) => t.id === tabId);

    if (targetTab && (targetTab.type === 'markdown' || targetTab.type === 'erd') && targetTab.fileEntry) {
      // 캐시가 있으면 디스크 I/O 없이 즉시 복원 — TabDocumentProvider 가
      // activeTab.cache 에서 초기값을 읽으므로 panes 전환만 커밋하면 된다.
      if (targetTab.cache) {
        set({ panes: panesBase, activePaneId: paneId });
        return;
      }

      const token = ++openSeq;
      // 캐시가 없으면 디스크에서 읽기 (최초 로드 시)
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      if (workspacePath) {
        const content = await fileSystemRepository.readFile(targetTab.fileEntry.path);
        const isErd = targetTab.type === 'erd';

        const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
        if (token !== openSeq) return;

        const loadedSpatialData = allMetadata[targetTab.fileEntry.path] || {};
        const parsedNodes = isErd ? [] : parseMarkdown(content);
        const alignedNodes = alignNodes(parsedNodes, loadedSpatialData);
        const cache: TabCache = { rawContent: content, nodes: alignedNodes, spatialData: loadedSpatialData };

        const currentPanes = get().panes;
        const currentUpdatedPanes = currentPanes.map((p) =>
          p.id === paneId
            ? { ...p, activeTabId: tabId, tabs: p.tabs.map((t) => (t.id === tabId ? { ...t, cache } : t)) }
            : p
        );

        set({ panes: currentUpdatedPanes, activePaneId: paneId, spatialData: loadedSpatialData });
        return;
      }
    }

    set({ panes: panesBase, activePaneId: paneId });
  },

  resetDocumentState: () => {
    set({
      panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }],
      activePaneId: 'pane-main',
      spatialData: {},
    });
  },

  closeTab: async (paneId, tabId) => {
    const { panes, activePaneId } = get();
    const closingPane = panes.find((p) => p.id === paneId);
    const wasActiveTabClosed = closingPane?.activeTabId === tabId;

    const updatedPanes = panes.map((p) => {
      if (p.id !== paneId) return p;

      const filteredTabs = p.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = p.activeTabId;

      if (p.activeTabId === tabId) {
        const closedIndex = p.tabs.findIndex((t) => t.id === tabId);
        const nextTab = filteredTabs[closedIndex] || filteredTabs[closedIndex - 1];
        newActiveTabId = nextTab ? nextTab.id : '';
      }

      return { ...p, tabs: filteredTabs, activeTabId: newActiveTabId };
    });

    // REF-20260810-01: 빈 패널 자동 GC — 최소 1개 패널은 상시 유지.
    const cleaned = updatedPanes.filter((p) => p.tabs.length > 0);
    const finalPanes = cleaned.length > 0 ? cleaned : updatedPanes.slice(0, 1);

    // 활성 패널이 GC되었다면 남은 첫 패널로 포커스 이동
    const activeStillExists = finalPanes.some((p) => p.id === activePaneId);
    const newActivePaneId = activeStillExists ? activePaneId : (finalPanes[0]?.id ?? activePaneId);

    // If the active pane no longer has an active tab, clear the editor state
    const newActivePane = finalPanes.find(p => p.id === newActivePaneId);
    if (!newActivePane || !newActivePane.activeTabId) {
      // C-4: 탭이 하나도 없으면 PaneContainer 가 TabDocumentProvider 자체를
      // 마운트하지 않으므로 지울 전역 콘텐츠 상태가 없다 — panes 전환만.
      set({ panes: finalPanes, activePaneId: newActivePaneId });
    } else if (newActivePaneId !== activePaneId || (wasActiveTabClosed && paneId === newActivePaneId)) {
      // 새로 활성화된 탭의 콘텐츠를 캐시/디스크에서 다시 로드해야 하는 두 경우:
      //  1. 닫힌 탭이 (전역으로 보이는) 활성 탭이었고 같은 패널의 다음 탭으로
      //     자동 전환됐다 — 예전에는 activeTabId 만 갱신하고 rawContent/
      //     nodes/spatialData 는 그대로 둬서, 탭을 닫으면 화면이 방금 닫힌
      //     탭 내용을 계속 보여주다가 그 탭을 다시 클릭해도 setActiveTab 의
      //     "이미 활성 탭" 가드에 걸려 아무 반응이 없는 것처럼 보였다.
      //  2. 활성 패널 자체가 탭 0개로 GC 되어(그 패널의 마지막 탭을 닫음)
      //     이미 자기 탭을 갖고 있던 **다른** 패널로 활성 소유권이 넘어갔다
      //     (7-A 로 발견 — 이전에는 모든 패널이 같은 전역 상태를 봤으므로
      //     드러나지 않았다). newActivePaneId !== activePaneId 가 이 경우다.
      await get()._activateTabContent(newActivePaneId, newActivePane.activeTabId, finalPanes);
    } else {
      set({ panes: finalPanes, activePaneId: newActivePaneId });
    }
  },

  // REF-20260810-01: 특정 패널 닫기 — 탭은 인접 패널로 병합
  closePane: (paneId) => {
    // 7-A: 닫히는 패널이 활성 패널이면(대개 그렇다 — 자기 패널 닫기 버튼) 그
    // 안의 미저장 편집이 탭 스코프 스토어에만 있고 tab.cache 엔 아직 없을 수
    // 있다. 병합 대상 패널로 소유권이 넘어가기 전에 먼저 캐시에 반영해야,
    // 병합된 탭이 방금 편집한 내용이 아니라 그 이전 스냅샷을 보여주는 걸 막는다.
    const panesWithSnapshot = get()._snapshotActiveTab();
    const { activePaneId } = get();
    if (panesWithSnapshot.length <= 1) return; // 최소 1개 패널 보장

    const targetIndex = panesWithSnapshot.findIndex((p) => p.id === paneId);
    if (targetIndex === -1) return;

    const targetPane = panesWithSnapshot[targetIndex];

    // 병합 대상: 왼쪽 패널 우선, 없으면 오른쪽 패널
    const mergeTarget = panesWithSnapshot[targetIndex - 1] ?? panesWithSnapshot[targetIndex + 1];

    // 닫히는 패널의 탭을 병합 대상으로 이동 (중복 탭 제거).
    // 닫히는 패널이 활성 패널이었다면(preferClosingCopy) 위에서 방금
    // _snapshotActiveTab 으로 그 탭의 캐시를 최신화했다 — 같은 id 의 탭이
    // mergeTarget 에도 있을 때(예: splitPane 직후처럼 두 패널이 같은 탭을
    // 복사해 갖고 있는 경우) mergeTarget 의 기존(더 오래된) 사본을 그대로
    // 두면 방금 캐시에 반영한 편집이 조용히 버려진다. 그래서 이 경우엔
    // mergeTarget 자리를 유지한 채 내용만 닫히는 쪽의 사본으로 바꿔치기한다.
    const preferClosingCopy = paneId === activePaneId;
    const targetPaneTabsById = new Map(targetPane.tabs.map((t) => [t.id, t]));
    const mergeTargetTabIds = new Set(mergeTarget.tabs.map((t) => t.id));
    const reconciledMergeTargetTabs = mergeTarget.tabs.map((t) =>
      preferClosingCopy && targetPaneTabsById.has(t.id) ? targetPaneTabsById.get(t.id)! : t,
    );
    const newTabsFromClosingPane = targetPane.tabs.filter((t) => !mergeTargetTabIds.has(t.id));
    const mergedTabs = [...reconciledMergeTargetTabs, ...newTabsFromClosingPane];
    const mergedActiveTabId = mergeTarget.activeTabId || (mergedTabs[0]?.id ?? '');

    const remaining = panesWithSnapshot
      .filter((p) => p.id !== paneId)
      .map((p) =>
        p.id === mergeTarget.id
          ? { ...p, tabs: mergedTabs, activeTabId: mergedActiveTabId }
          : p
      );

    const newActivePaneId =
      activePaneId === paneId ? mergeTarget.id : activePaneId;

    set({ panes: remaining, activePaneId: newActivePaneId });
  },

  setActivePane: (paneId) => {
    // 7-A: 비활성 패널은 이제 tab.cache 스냅샷만 그린다. 소유권을 넘기기
    // 전에 지금 활성 패널의 미저장 편집 상태를 먼저 캐시에 반영해야,
    // 방금까지 편집하던 패널이 포커스를 잃는 순간 옛 내용을 보여주지 않는다.
    const panesWithSnapshot = get()._snapshotActiveTab();
    set({ panes: panesWithSnapshot, activePaneId: paneId });
  },

  splitPane: (sourcePaneId, direction) => {
    // 7-A: 분할은 활성 패널에서 시작되는 게 보통이고, 새 패널로 활성 소유권이
    // 넘어간다. sourcePane 이 활성 패널이었다면 그 안의 미저장 편집을 먼저
    // 캐시에 반영해야, 새로 생기는 패널이 복사해가는 tabs 가 옛 스냅샷이
    // 되는 걸 막는다(둘 다 같은 tab 객체를 참조하므로 원본 패널도 같이 낡는다).
    const panesWithSnapshot = get()._snapshotActiveTab();
    const sourcePane = panesWithSnapshot.find((p) => p.id === sourcePaneId);
    if (!sourcePane) return;

    const newPaneId = `pane-${Date.now()}`;
    const newPane: SplitPane = {
      id: newPaneId,
      tabs: [...sourcePane.tabs],
      activeTabId: sourcePane.activeTabId,
    };

    set({
      panes: [...panesWithSnapshot, newPane],
      activePaneId: newPaneId,
      layoutDirection: direction,
    });
  },

  // ── File System Sync 로직 ─────────────────────────────────────────
  handleFileRenamed: (oldPath, newPath, newName) => {
    const { panes } = get();
    const updatedPanes = panes.map((p) => {
      const updatedTabs = p.tabs.map((t) => {
        if ((t.type === 'markdown' || t.type === 'erd') && t.filePath && isSameOrInside(t.filePath, oldPath)) {
          // If the path exactly matches, or it's inside the renamed directory
          const newFilePath = rebasePath(t.filePath, oldPath, newPath);
          const newTabId = rebasePath(t.id, oldPath, newPath);
          const newTitle = t.filePath === oldPath ? newName : t.title; // update title only if it's the exact file

          return {
            ...t,
            id: newTabId,
            title: newTitle,
            filePath: newFilePath,
            fileEntry: t.fileEntry ? { ...t.fileEntry, path: newFilePath, name: t.filePath === oldPath ? newName : t.fileEntry.name } : undefined,
          };
        }
        return t;
      });

      const updatedActiveTabId = isSameOrInside(p.activeTabId, oldPath)
        ? rebasePath(p.activeTabId, oldPath, newPath)
        : p.activeTabId;

      return { ...p, tabs: updatedTabs, activeTabId: updatedActiveTabId };
    });
    set({ panes: updatedPanes });
  },

  handleFileDeleted: (path, _isDir) => {
    const { panes } = get();

    // Find all tabs that match the deleted path (or are children of it)
    const tabsToClose: { paneId: string, tabId: string }[] = [];

    panes.forEach(p => {
      p.tabs.forEach(t => {
        if ((t.type === 'markdown' || t.type === 'erd') && t.filePath && isSameOrInside(t.filePath, path)) {
          tabsToClose.push({ paneId: p.id, tabId: t.id });
        }
      });
    });

    // We can't just call closeTab repeatedly inside the loop because it relies on get().panes
    // But closeTab uses get() internally, so it's safe if we do it sequentially
    for (const { paneId, tabId } of tabsToClose) {
      get().closeTab(paneId, tabId);
    }
  },

  // ── Document/Editor Sync 로직 ──────────────────────────────────────
  // C-4: 이전엔 전역 블록 스토어의 소유권 필드로 "지금 이 탭을 라이브로 편집
  // 중인가"를 확인했다. 탭 스코프 스토어는 구조적으로 한 탭에 묶이므로,
  // "이 tabId 로 등록된 라이브 스토어가 있는가"가 그 자리를 대신한다
  // (getTabStore) — 런타임 소유권 가드가 구조적 존재 여부 확인으로 바뀐 것.
  _snapshotActiveTab: () => {
    const { panes, activePaneId, spatialData } = get();
    const activePane = panes.find((p) => p.id === activePaneId);
    if (!activePane || !activePane.activeTabId) return panes;

    const activeTab = activePane.tabs.find((t) => t.id === activePane.activeTabId);
    if (!activeTab) return panes;

    const liveStore = getTabStore(activeTab.id);
    if (!liveStore) return panes; // 라이브 스토어가 없다(예: mindmap-global) — 스냅샷할 것도 없다

    const state = liveStore.getState();
    // 마크다운은 blocks 가 진실이다 — rawContent 는 디바운스 동기화 대상이라
    // 이 순간 blocks 보다 뒤처져 있을 수 있다(A2). getMergedContent() 로
    // blocks 에서 직접 계산해야 방금 키 입력을 놓치지 않는다.
    const contentToSave = activeTab.type === 'markdown' ? state.getMergedContent() : state.rawContent;

    return panes.map((p) => {
      if (p.id !== activePaneId) return p;
      return {
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === activePane.activeTabId
            ? { ...t, cache: { rawContent: contentToSave, nodes: state.nodes, spatialData }, isDirty: state.isDirty }
            : t
        ),
      };
    });
  },

  updateContentForTab: (tabId, content) => {
    const { panes, activePaneId, spatialData } = get();

    const tabFound = panes.some((p) => p.tabs.some((t) => t.id === tabId));
    if (!tabFound) return;

    const parsedNodes = parseMarkdown(content);
    const alignedNodes = alignNodes(parsedNodes, spatialData);

    const updatedPanes = panes.map((p) => ({
      ...p,
      tabs: p.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const isActiveTab = p.id === activePaneId && p.activeTabId === tabId;
        const hasChanged = content !== (t.savedContent ?? t.cache?.rawContent ?? '');
        if (isActiveTab) {
          // 활성 탭: cache 는 여기서 건드리지 않는다 — 라이브 편집 중엔 탭
          // 스코프 스토어가 진실이고, cache 는 _snapshotActiveTab 이 이
          // 패널을 떠날 때 한 번에 채운다(중복 갱신 방지, D-5 의 저장 버튼
          // dirty 표시는 탭 스코프 스토어의 isDirty 를 직접 구독하므로
          // 여기서 t.isDirty 를 갱신하는 건 탭 바 점(dot) 표시 전용이다).
          return { ...t, isDirty: hasChanged };
        }
        return {
          ...t,
          isDirty: hasChanged,
          cache: t.cache ? { ...t.cache, rawContent: content, nodes: alignedNodes } : { rawContent: content, nodes: alignedNodes, spatialData: {} },
        };
      }),
    }));

    set({ panes: updatedPanes });
  },

  markTabDirty: (tabId) => {
    const { panes } = get();
    const tabFound = panes.some((p) => p.tabs.some((t) => t.id === tabId));
    if (!tabFound) return;

    set({
      panes: panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.id === tabId ? { ...t, isDirty: true } : t)),
      })),
    });
  },

  saveFile: async (paneId?: string, tabId?: string) => {
    // 1. 대상 탭 찾기
    const { panes, activePaneId } = get();
    const targetPaneId = paneId ?? activePaneId;
    const targetPane = panes.find(p => p.id === targetPaneId);
    if (!targetPane) return;

    const targetTabId = tabId ?? targetPane.activeTabId;
    const targetTab = targetPane.tabs.find(t => t.id === targetTabId);
    if (!targetTab || (targetTab.type !== 'markdown' && targetTab.type !== 'erd')) return;
    if (!targetTab.fileEntry) return;

    const workspacePath = useWorkspaceStore.getState().workspacePath;
    if (!workspacePath) return;

    // C-4: 예전엔 전역 블록 스토어의 소유권 필드로 "이 탭이 지금 활성 편집
    // 표면인가"를 물었다. 이제 그 판단은 "이 tabId 로 등록된 라이브 탭
    // 스토어가 있는가"다 — 어느 패널이 globally active 인지와 무관하게, 이
    // tabId 를 자기 활성 탭으로 물고 있는 패널이 있으면 라이브 스토어가
    // 존재한다(C-3 가 패널마다 독립 Provider 를 준 덕분).
    const liveStore = getTabStore(targetTabId);

    let latestContent: string;
    let spatialToPersist: Record<string, { x: number; y: number }>;

    if (liveStore) {
      const state = liveStore.getState();
      latestContent = targetTab.type === 'erd' ? state.rawContent : state.getMergedContent();
      // spatialData 는 더 이상 전역에 라이브로 반영되지 않는다(그건
      // MindView 가 탭 스코프 스토어의 nodes 만 갱신하기 때문 — C-3).
      // 저장 시점에 nodes 의 x/y 에서 직접 재구성한다.
      spatialToPersist = Object.fromEntries(state.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    } else {
      latestContent = targetTab.cache?.rawContent ?? targetTab.savedContent ?? '';
      spatialToPersist = targetTab.cache?.spatialData ?? {};
    }

    try {
      await fileSystemRepository.writeFile(targetTab.fileEntry.path, latestContent);

      try {
        const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
        const updatedMetadata = { ...allMetadata, [targetTab.fileEntry.path]: spatialToPersist };
        await fileSystemRepository.writeSpatialMetadata(workspacePath, updatedMetadata);
      } catch (e) {
        console.warn('Failed to update spatial metadata (ignoring):', e);
      }

      // 저장 버튼의 dirty 표시(D-5)는 탭 스코프 스토어의 isDirty 를 직접
      // 구독하므로, 여기서도 그 스토어의 isDirty 를 꺼 줘야 화면이 즉시
      // clean 으로 바뀐다 — tab.isDirty(탭 바 점) 만 지우면 반영되지 않는다.
      if (liveStore) {
        liveStore.getState().setDirty(false);
      }

      // dirty 상태 해제 + **저장 기준선 갱신**
      // savedContent 를 함께 옮기지 않으면 기준선이 '파일을 처음 열었을 때의 내용'에
      // 영원히 머문다. 그러면 저장 후 표시가 디스크와 어긋난다 (BUG-20260826-07 DoD):
      //   - 저장한 내용 그대로인데 dirty 로 보이고(거짓 양성),
      //   - 저장 전 원문으로 되돌리면 clean 으로 보인다(거짓 음성 — 사용자가
      //     저장된 줄 알고 디스크와 다른 내용을 들고 있게 되는 위험한 방향).
      const updatedPanes = get().panes.map((p) => {
        if (p.id !== targetPaneId) return p;
        return {
          ...p,
          tabs: p.tabs.map((t) =>
            t.id === targetTabId ? { ...t, isDirty: false, savedContent: latestContent } : t
          ),
        };
      });

      set({ panes: updatedPanes });
    } catch (e) {
      console.error(`Failed to save file ${targetTab.fileEntry.path}:`, e);
    }
  },
}));
