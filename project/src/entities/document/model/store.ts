import { create } from 'zustand';
import { FileEntry, fileSystemRepository } from '@/shared/api/fs';
import { MindNode, parseMarkdown } from '@/entities/document/lib/parser';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useBlockStore } from '@/entities/block/model/store';

export type TabType = 'markdown' | 'mindmap-global';

export interface TabItem {
  id: string;            // filePath 혹은 'global-mindmap'
  type: TabType;
  title: string;
  filePath?: string;     // markdown 일 때 파일 경로
  fileEntry?: FileEntry; // markdown 일 때 FileEntry 저장
  isDirty?: boolean;
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

  // ── 활성 파일 기반 에디터 데이터 ──────────────────────────────────
  rawContent: string;
  nodes: MindNode[];
  spatialData: Record<string, { x: number; y: number }>;
  isDirty: boolean;
  viewMode: 'write' | 'read';
  fontSize: number;

  // ── Helper Getters ──────────────────────────────────────────────
  getActivePane: () => SplitPane | undefined;
  getActiveTab: () => TabItem | undefined;
  getCurrentFile: () => FileEntry | null;

  // ── Tab & Pane 액션 ─────────────────────────────────────────────
  loadFile: (file: FileEntry) => Promise<void>;
  openTab: (file: FileEntry | { type: 'mindmap-global' }) => Promise<void>;
  closeTab: (paneId: string, tabId: string) => void;
  setActiveTab: (paneId: string, tabId: string) => void;
  setActivePane: (paneId: string) => void;
  splitPane: (sourcePaneId: string, direction: 'horizontal' | 'vertical') => void;

  // ── Document/Editor 액션 ─────────────────────────────────────────
  updateContent: (content: string) => void;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
  setDirty: (isDirty: boolean) => void;
  saveFile: () => Promise<void>;
  setViewMode: (mode: 'write' | 'read') => void;
  toggleViewMode: () => void;
  adjustFontSize: (delta: number) => void;
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

  rawContent: '',
  nodes: [],
  spatialData: {},
  isDirty: false,
  viewMode: 'write',
  fontSize: 13,

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
    if (activeTab && activeTab.type === 'markdown') {
      return activeTab.fileEntry || null;
    }
    return null;
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'write' ? 'read' : 'write' })),
  adjustFontSize: (delta) => set((s) => ({ fontSize: Math.min(22, Math.max(11, s.fontSize + delta)) })),
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
      const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
      const spatialData = allMetadata[file.path] || {};
      const parsedNodes = parseMarkdown(content);

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
          type: 'markdown',
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
    const { panes } = get();
    const pane = panes.find((p) => p.id === paneId);
    if (!pane) return;

    const targetTab = pane.tabs.find((t) => t.id === tabId);
    const updatedPanes = panes.map((p) => (p.id === paneId ? { ...p, activeTabId: tabId } : p));

    // 마크다운 탭인 경우 해당 파일 내용으로 로드 동기화
    if (targetTab && targetTab.type === 'markdown' && targetTab.fileEntry) {
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      if (workspacePath) {
        const content = await fileSystemRepository.readFile(targetTab.fileEntry.path);
        const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
        const spatialData = allMetadata[targetTab.fileEntry.path] || {};
        const parsedNodes = parseMarkdown(content);

        const alignedNodes = parsedNodes.map((node) => {
          if (spatialData[node.id]) return { ...node, x: spatialData[node.id].x, y: spatialData[node.id].y };
          return node;
        });

        set({
          panes: updatedPanes,
          activePaneId: paneId,
          rawContent: content,
          nodes: alignedNodes,
          spatialData,
          isDirty: targetTab.isDirty || false,
        });
        return;
      }
    }

    set({ panes: updatedPanes, activePaneId: paneId });
  },

  closeTab: (paneId, tabId) => {
    const { panes } = get();
    const updatedPanes = panes.map((p) => {
      if (p.id !== paneId) return p;

      const filteredTabs = p.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = p.activeTabId;

      if (p.activeTabId === tabId) {
        const closedIndex = p.tabs.findIndex((t) => t.id === tabId);
        const nextTab = filteredTabs[closedIndex] || filteredTabs[closedIndex - 1];
        newActiveTabId = nextTab ? nextTab.id : '';
      }

      return {
        ...p,
        tabs: filteredTabs,
        activeTabId: newActiveTabId,
      };
    });

    set({ panes: updatedPanes });
  },

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  splitPane: (sourcePaneId, _direction) => {
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
    });
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

    const latestContent = useBlockStore.getState().getMergedContent();

    try {
      await fileSystemRepository.writeFile(currentFile.path, latestContent);

      const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
      const updatedMetadata = { ...allMetadata, [currentFile.path]: spatialData };
      await fileSystemRepository.writeSpatialMetadata(workspacePath, updatedMetadata);

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