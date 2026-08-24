import { create } from 'zustand';
import { FileEntry, fileSystemRepository } from '@/shared/api/fs';
import { MindNode, parseMarkdown } from '@/entities/document/lib/parser';
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
  updateContent: (content: string) => void;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
  setDirty: (isDirty: boolean) => void;
  saveFile: () => Promise<void>;
  setViewMode: (mode: 'write' | 'read') => void;
  toggleViewMode: () => void;

  // ── File System Sync 액션 ────────────────────────────────────────
  handleFileRenamed: (oldPath: string, newPath: string, newName: string) => void;
  handleFileDeleted: (path: string, isDir: boolean) => void;
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
    const { panes, activePaneId } = get();
    const activePane = panes.find((p) => p.id === activePaneId) || panes[0];

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
        const updatedPanes = panes.map((p) =>
          p.id === activePane.id
            ? { ...p, tabs: [...p.tabs, newTab], activeTabId: tabId }
            : p
        );
        set({ panes: updatedPanes });
      } else {
        set({
          panes: panes.map((p) => (p.id === activePane.id ? { ...p, activeTabId: tabId } : p)),
        });
      }
      return;
    }

    // 2. 일반 마크다운 파일 오픈 요청
    const file = item as FileEntry;
    const tabId = file.path;

    // 이미 열려있는 탭인지 확인
    const existingTab = activePane.tabs.find((t) => t.id === tabId);

    // 파일 컨텐츠 및 메타데이터 읽기
    try {
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      if (!workspacePath) return;

      const content = await fileSystemRepository.readFile(file.path);
      const isErd = file.path.toLowerCase().endsWith('.erd');
      
      const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
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

      let updatedTabs = [...activePane.tabs];
      if (!existingTab) {
        updatedTabs.push({
          id: tabId,
          type: isErd ? 'erd' : 'markdown',
          title: file.name,
          filePath: file.path,
          fileEntry: file,
          isDirty: false,
        });
      }

      set({
        panes: panes.map((p) =>
          p.id === activePane.id
            ? { ...p, tabs: updatedTabs, activeTabId: tabId }
            : p
        ),
        rawContent: content,
        nodes: alignedNodes,
        spatialData,
        isDirty: false,
        viewMode: 'write',
      });
    } catch (e) {
      console.error(`Failed to load file ${file.path}:`, e);
    }
  },

  setActiveTab: async (paneId, tabId) => {
    const { panes, rawContent, nodes, spatialData, isDirty, activePaneId } = get();
    const pane = panes.find((p) => p.id === paneId);
    if (!pane) return;

    const targetTab = pane.tabs.find((t) => t.id === tabId);
    if (pane.activeTabId === tabId && paneId === activePaneId) return; // 이미 활성 탭

    // ── Step 1: 현재 활성 탭의 편집 상태를 캐시에 저장 ──
    const currentPane = panes.find((p) => p.id === activePaneId);
    let panesWithSavedCache = panes;
    if (currentPane && currentPane.activeTabId) {
      panesWithSavedCache = panes.map((p) => {
        if (p.id !== activePaneId) return p;
        return {
          ...p,
          tabs: p.tabs.map((t) =>
            t.id === currentPane.activeTabId
              ? { ...t, cache: { rawContent, nodes, spatialData }, isDirty }
              : t
          ),
        };
      });
    }

    // ── Step 2: 대상 탭 활성화 ──
    const updatedPanes = panesWithSavedCache.map((p) =>
      p.id === paneId ? { ...p, activeTabId: tabId } : p
    );

    // ── Step 3: 캐시에서 복원 또는 디스크에서 로드 ──
    if (targetTab && (targetTab.type === 'markdown' || targetTab.type === 'erd') && targetTab.fileEntry) {
      // 캐시가 있으면 디스크 I/O 없이 즉시 복원
      if (targetTab.cache) {
        set({
          panes: updatedPanes,
          activePaneId: paneId,
          rawContent: targetTab.cache.rawContent,
          nodes: targetTab.cache.nodes,
          spatialData: targetTab.cache.spatialData,
          isDirty: targetTab.isDirty || false,
        });
        return;
      }

      // 캐시가 없으면 디스크에서 읽기 (최초 로드 시)
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      if (workspacePath) {
        const content = await fileSystemRepository.readFile(targetTab.fileEntry.path);
        const isErd = targetTab.type === 'erd';

        const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
        const loadedSpatialData = allMetadata[targetTab.fileEntry.path] || {};
        const parsedNodes = isErd ? [] : parseMarkdown(content);

        const alignedNodes = parsedNodes.map((node) => {
          if (loadedSpatialData[node.id]) return { ...node, x: loadedSpatialData[node.id].x, y: loadedSpatialData[node.id].y };
          return node;
        });

        set({
          panes: updatedPanes,
          activePaneId: paneId,
          rawContent: content,
          nodes: alignedNodes,
          spatialData: loadedSpatialData,
          isDirty: targetTab.isDirty || false,
        });
        return;
      }
    }

    set({ panes: updatedPanes, activePaneId: paneId });
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

  closeTab: (paneId, tabId) => {
    const { panes, activePaneId } = get();

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

    set({ panes: finalPanes, activePaneId: newActivePaneId });
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
        if ((t.type === 'markdown' || t.type === 'erd') && t.filePath && t.filePath.startsWith(oldPath)) {
          // If the path exactly matches, or it's inside the renamed directory
          const newFilePath = t.filePath.replace(oldPath, newPath);
          const newTabId = t.id.replace(oldPath, newPath);
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

      const updatedActiveTabId = p.activeTabId.startsWith(oldPath) 
        ? p.activeTabId.replace(oldPath, newPath)
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
        if ((t.type === 'markdown' || t.type === 'erd') && t.filePath && t.filePath.startsWith(path)) {
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

    const hasChanged = content !== rawContent;

    // 현재 활성 탭의 isDirty 상태 업데이트
    const { panes, activePaneId } = get();
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
    const { spatialData } = get();
    const currentFile = get().getCurrentFile();
    if (!currentFile) return;

    const updatedSpatial = { ...spatialData, [nodeId]: { x, y } };
    const updatedNodes = get().nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node));

    set({
      spatialData: updatedSpatial,
      nodes: updatedNodes,
      isDirty: true,
    });
  },

  saveFile: async () => {
    const currentFile = get().getCurrentFile();
    const { spatialData } = get();
    if (!currentFile) return;

    const workspacePath = useWorkspaceStore.getState().workspacePath;
    if (!workspacePath) return;

    let latestContent = '';
    if (currentFile.path.endsWith('.erd')) {
      latestContent = get().rawContent;
    } else {
      latestContent = useBlockStore.getState().getMergedContent();
    }

    try {
      await fileSystemRepository.writeFile(currentFile.path, latestContent);

      try {
        const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
        const updatedMetadata = { ...allMetadata, [currentFile.path]: spatialData };
        await fileSystemRepository.writeSpatialMetadata(workspacePath, updatedMetadata);
      } catch (e) {
        console.warn('Failed to update spatial metadata (ignoring):', e);
      }

      // dirty 상태 해제
      const { panes, activePaneId } = get();
      const updatedPanes = panes.map((p) => {
        if (p.id !== activePaneId) return p;
        return {
          ...p,
          tabs: p.tabs.map((t) => (t.id === p.activeTabId ? { ...t, isDirty: false } : t)),
        };
      });

      set({
        panes: updatedPanes,
        isDirty: false,
        rawContent: latestContent,
      });
    } catch (e) {
      console.error(`Failed to save file ${currentFile.path}:`, e);
    }
  },
}));