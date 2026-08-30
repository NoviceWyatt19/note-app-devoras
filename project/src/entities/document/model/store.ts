import { create } from 'zustand';
import { FileEntry, fileSystemRepository } from '@/shared/api/fs';
import { MindNode, parseMarkdown } from '@/entities/document/lib/parser';
import { isSameOrInside, rebasePath } from '@/shared/lib/path';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useBlockStore } from '@/entities/block/model/store';

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

  // ── 활성 파일 기반 에디터 데이터 ──────────────────────────────────
  rawContent: string;
  nodes: MindNode[];
  spatialData: Record<string, { x: number; y: number }>;
  isDirty: boolean;
  viewMode: 'write' | 'read';

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
  updateContent: (content: string) => void;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
  setDirty: (isDirty: boolean) => void;
  saveFile: (paneId?: string, tabId?: string) => Promise<void>;
  setViewMode: (mode: 'write' | 'read') => void;
  toggleViewMode: () => void;

  // ── File System Sync 액션 ────────────────────────────────────────
  handleFileRenamed: (oldPath: string, newPath: string, newName: string) => void;
  handleFileDeleted: (path: string, isDir: boolean) => void;
}

let openSeq = 0;

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

  rawContent: '',
  nodes: [],
  spatialData: {},
  isDirty: false,
  viewMode: 'write',

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

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'write' ? 'read' : 'write' })),
  setDirty: (isDirty) => set({ isDirty }),

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

    const existingTab = activePane.tabs.find((t) => t.id === tabId);

    // 캐시 우선 복원
    if (existingTab?.cache) {
      set({
        panes: panesWithSnapshot.map(p => p.id === activePane.id ? { ...p, activeTabId: tabId } : p),
        rawContent: existingTab.cache.rawContent,
        nodes: existingTab.cache.nodes,
        spatialData: existingTab.cache.spatialData,
        isDirty: existingTab.isDirty ?? false,
        viewMode: get().viewMode,
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

      const alignedNodes = parsedNodes.map((node) => {
        if (spatialData[node.id]) {
          return { ...node, x: spatialData[node.id].x, y: spatialData[node.id].y };
        }
        const baseId = node.id.replace(/_\d+$/, '');
        if (baseId !== node.id && spatialData[baseId]) {
          return { ...node, x: spatialData[baseId].x, y: spatialData[baseId].y };
        }
        return node;
      });

      let updatedTabs = [...currentActivePane.tabs];
      const stillExistingTab = currentActivePane.tabs.find((t) => t.id === tabId);
      
      if (!stillExistingTab) {
        updatedTabs.push({
          id: tabId,
          type: isErd ? 'erd' : 'markdown',
          title: file.name,
          filePath: file.path,
          fileEntry: file,
          isDirty: false,
          savedContent: content,
        });
      }

      set({
        panes: currentPanes.map((p) =>
          p.id === activePane.id
            ? { ...p, tabs: updatedTabs, activeTabId: tabId }
            : p
        ),
        rawContent: content,
        nodes: alignedNodes,
        spatialData,
        isDirty: false,
        viewMode: get().viewMode, // 유지
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
      // 캐시가 있으면 디스크 I/O 없이 즉시 복원
      if (targetTab.cache) {
        set({
          panes: panesBase,
          activePaneId: paneId,
          rawContent: targetTab.cache.rawContent,
          nodes: targetTab.cache.nodes,
          spatialData: targetTab.cache.spatialData,
          isDirty: targetTab.isDirty || false,
        });
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

        const currentPanes = get().panes;
        const currentUpdatedPanes = currentPanes.map((p) =>
          p.id === paneId ? { ...p, activeTabId: tabId } : p
        );

        const loadedSpatialData = allMetadata[targetTab.fileEntry.path] || {};
        const parsedNodes = isErd ? [] : parseMarkdown(content);

        const alignedNodes = parsedNodes.map((node) => {
          if (loadedSpatialData[node.id]) return { ...node, x: loadedSpatialData[node.id].x, y: loadedSpatialData[node.id].y };
          return node;
        });

        set({
          panes: currentUpdatedPanes,
          activePaneId: paneId,
          rawContent: content,
          nodes: alignedNodes,
          spatialData: loadedSpatialData,
          isDirty: targetTab.isDirty || false,
        });
        return;
      }
    }

    set({ panes: panesBase, activePaneId: paneId });
  },

  resetDocumentState: () => {
    set({
      panes: [{ id: 'pane-main', tabs: [], activeTabId: '' }],
      activePaneId: 'pane-main',
      rawContent: '',
      nodes: [],
      spatialData: {},
      isDirty: false,
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
      set({
        panes: finalPanes,
        activePaneId: newActivePaneId,
        rawContent: '',
        nodes: [],
        spatialData: {},
        isDirty: false
      });
      // Also clear blockStore content to avoid ghost text
      useBlockStore.getState().setBlocksFromContent('', undefined);
    } else if (wasActiveTabClosed && paneId === newActivePaneId) {
      // 닫힌 탭이 (전역으로 보이는) 활성 탭이었고 새 활성 탭으로 자동 전환됐다면,
      // 그 탭의 콘텐츠를 캐시/디스크에서 복원해야 화면이 activeTabId 와 일치한다.
      // 예전에는 activeTabId 만 갱신하고 rawContent/nodes/spatialData 는 그대로
      // 둬서, 탭을 닫으면 화면이 방금 닫힌 탭 내용을 계속 보여주다가 이후 그
      // 탭을 다시 클릭해도 setActiveTab 의 "이미 활성 탭" 가드에 걸려 아무
      // 반응이 없는 것처럼 보였다.
      await get()._activateTabContent(newActivePaneId, newActivePane.activeTabId, finalPanes);
    } else {
      set({ panes: finalPanes, activePaneId: newActivePaneId });
    }
  },

  // REF-20260810-01: 특정 패널 닫기 — 탭은 인접 패널로 병합
  closePane: (paneId) => {
    const { panes, activePaneId } = get();
    if (panes.length <= 1) return; // 최소 1개 패널 보장

    const targetIndex = panes.findIndex((p) => p.id === paneId);
    if (targetIndex === -1) return;

    const targetPane = panes[targetIndex];

    // 병합 대상: 왼쪽 패널 우선, 없으면 오른쪽 패널
    const mergeTarget = panes[targetIndex - 1] ?? panes[targetIndex + 1];

    // 닫히는 패널의 탭을 병합 대상으로 이동 (중복 탭 제거)
    const existingIds = new Set(mergeTarget.tabs.map((t) => t.id));
    const tabsToMerge = targetPane.tabs.filter((t) => !existingIds.has(t.id));
    const mergedTabs = [...mergeTarget.tabs, ...tabsToMerge];
    const mergedActiveTabId = mergeTarget.activeTabId || (mergedTabs[0]?.id ?? '');

    const remaining = panes
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

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  splitPane: (sourcePaneId, direction) => {
    const { panes } = get();
    const sourcePane = panes.find((p) => p.id === sourcePaneId);
    if (!sourcePane) return;

    const newPaneId = `pane-${Date.now()}`;
    const newPane: SplitPane = {
      id: newPaneId,
      tabs: [...sourcePane.tabs],
      activeTabId: sourcePane.activeTabId,
    };

    set({
      panes: [...panes, newPane],
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
  _snapshotActiveTab: () => {
    const { panes, activePaneId, rawContent, nodes, spatialData, isDirty } = get();
    const activePane = panes.find((p) => p.id === activePaneId);
    if (!activePane || !activePane.activeTabId) return panes;

    const activeTab = activePane.tabs.find((t) => t.id === activePane.activeTabId);
    if (!activeTab) return panes;

    let contentToSave = rawContent;
    if (activeTab.type === 'markdown' && useBlockStore.getState().ownerTabId === activeTab.id) {
      const merged = useBlockStore.getState().getMergedContent();
      if (useBlockStore.getState().blocks.length > 0) {
        contentToSave = merged;
      }
    }

    return panes.map((p) => {
      if (p.id !== activePaneId) return p;
      return {
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === activePane.activeTabId
            ? { ...t, cache: { rawContent: contentToSave, nodes, spatialData }, isDirty }
            : t
        ),
      };
    });
  },

  updateContentForTab: (tabId, content) => {
    const { panes, activePaneId, rawContent, spatialData } = get();
    
    let tabFound = false;
    let isActiveTab = false;

    for (const p of panes) {
      for (const t of p.tabs) {
        if (t.id === tabId) {
          tabFound = true;
          if (p.id === activePaneId && p.activeTabId === tabId) {
            isActiveTab = true;
          }
          break;
        }
      }
      if (tabFound) break;
    }

    if (!tabFound) return;

    const parsedNodes = parseMarkdown(content);
    const alignedNodes = parsedNodes.map((node) => {
      if (spatialData[node.id]) {
        return { ...node, x: spatialData[node.id].x, y: spatialData[node.id].y };
      }
      return node;
    });

    if (isActiveTab) {
      const activeTab = panes.find(p => p.id === activePaneId)?.tabs.find(t => t.id === tabId);
      const hasChanged = content !== (activeTab?.savedContent ?? rawContent);
      const updatedPanes = panes.map((p) => {
        if (p.id !== activePaneId) return p;
        return {
          ...p,
          tabs: p.tabs.map((t) => (t.id === tabId ? { ...t, isDirty: hasChanged } : t)),
        };
      });
      set({
        panes: updatedPanes,
        rawContent: content,
        nodes: alignedNodes,
        isDirty: hasChanged,
      });
    } else {
      const updatedPanes = panes.map(p => ({
        ...p,
        tabs: p.tabs.map(t => {
          if (t.id === tabId) {
            const hasChanged = content !== (t.savedContent ?? t.cache?.rawContent ?? '');
            return {
              ...t,
              isDirty: hasChanged,
              cache: t.cache ? { ...t.cache, rawContent: content, nodes: alignedNodes } : { rawContent: content, nodes: alignedNodes, spatialData: {} }
            };
          }
          return t;
        })
      }));
      set({ panes: updatedPanes });
    }
  },

  updateContent: (content) => {
    const currentFile = get().getCurrentFile();
    const { spatialData, rawContent } = get();
    if (!currentFile) return;

    const parsedNodes = parseMarkdown(content);
    const alignedNodes = parsedNodes.map((node) => {
      if (spatialData[node.id]) {
        return { ...node, x: spatialData[node.id].x, y: spatialData[node.id].y };
      }
      return node;
    });

    const { panes, activePaneId } = get();
    const activeTab = panes.find(p => p.id === activePaneId)?.tabs.find(t => t.id === panes.find(p => p.id === activePaneId)?.activeTabId);
    const hasChanged = content !== (activeTab?.savedContent ?? rawContent);

    // 현재 활성 탭의 isDirty 상태 업데이트
    const updatedPanes = panes.map((p) => {
      if (p.id !== activePaneId) return p;
      return {
        ...p,
        tabs: p.tabs.map((t) => (t.id === p.activeTabId ? { ...t, isDirty: hasChanged } : t)),
      };
    });

    set({
      panes: updatedPanes,
      rawContent: content,
      nodes: alignedNodes,
      isDirty: hasChanged,
    });
  },

  updateNodeCoordinate: (nodeId, x, y) => {
    const { spatialData, panes, activePaneId } = get();
    const currentFile = get().getCurrentFile();
    if (!currentFile) return;

    const updatedSpatial = { ...spatialData, [nodeId]: { x, y } };
    const updatedNodes = get().nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node));

    const updatedPanes = panes.map((p) => {
      if (p.id !== activePaneId) return p;
      return {
        ...p,
        tabs: p.tabs.map((t) => (t.id === p.activeTabId ? { ...t, isDirty: true } : t)),
      };
    });

    set({
      spatialData: updatedSpatial,
      nodes: updatedNodes,
      panes: updatedPanes,
      isDirty: true,
    });
  },

  saveFile: async (paneId?: string, tabId?: string) => {
    // 1. 대상 탭 찾기
    const { panes, spatialData, activePaneId } = get();
    const targetPaneId = paneId ?? activePaneId;
    const targetPane = panes.find(p => p.id === targetPaneId);
    if (!targetPane) return;
    
    const targetTabId = tabId ?? targetPane.activeTabId;
    const targetTab = targetPane.tabs.find(t => t.id === targetTabId);
    if (!targetTab || (targetTab.type !== 'markdown' && targetTab.type !== 'erd')) return;
    if (!targetTab.fileEntry) return;
    
    const workspacePath = useWorkspaceStore.getState().workspacePath;
    if (!workspacePath) return;

    let latestContent = '';
    const isActiveTab = targetPaneId === activePaneId && targetTabId === targetPane.activeTabId;

    if (targetTab.type === 'erd') {
       latestContent = isActiveTab ? get().rawContent : (targetTab.cache?.rawContent ?? '');
    } else {
       if (useBlockStore.getState().ownerTabId === targetTab.id) {
         latestContent = useBlockStore.getState().getMergedContent();
       } else {
         latestContent = targetTab.cache?.rawContent ?? '';
       }
    }

    if (isActiveTab) {
       get().updateContentForTab(targetTabId, latestContent); // 정합성 맞추기
    }

    try {
      await fileSystemRepository.writeFile(targetTab.fileEntry.path, latestContent);

      try {
        const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
        const updatedMetadata = { ...allMetadata, [targetTab.fileEntry.path]: spatialData };
        await fileSystemRepository.writeSpatialMetadata(workspacePath, updatedMetadata);
      } catch (e) {
        console.warn('Failed to update spatial metadata (ignoring):', e);
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

      if (isActiveTab) {
        set({ panes: updatedPanes, isDirty: false, rawContent: latestContent });
      } else {
        set({ panes: updatedPanes });
      }
    } catch (e) {
      console.error(`Failed to save file ${targetTab.fileEntry.path}:`, e);
    }
  },
}));