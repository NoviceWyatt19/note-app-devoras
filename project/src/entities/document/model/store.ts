import { create } from 'zustand';
import { FileEntry, fileSystemRepository } from '@/shared/api/fs';
import { MindNode, parseMarkdown } from '../lib/parser';
import { useWorkspaceStore } from '@/entities/workspace/model/store';

interface DocumentState {
  currentFile: FileEntry | null;
  rawContent: string;
  nodes: MindNode[];
  spatialData: Record<string, { x: number; y: number }>;
  isDirty: boolean;
  /** Current editor view mode. Resets to 'write' on every file load. */
  viewMode: 'write' | 'read';
  loadFile: (file: FileEntry) => Promise<void>;
  updateContent: (content: string) => void;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
  saveFile: () => Promise<void>;
  setViewMode: (mode: 'write' | 'read') => void;
  toggleViewMode: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentFile: null,
  rawContent: '',
  nodes: [],
  spatialData: {},
  isDirty: false,
  viewMode: 'write',

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'write' ? 'read' : 'write' })),

  loadFile: async (file) => {
    try {
      const workspacePath = useWorkspaceStore.getState().workspacePath;
      if (!workspacePath) return;

      // 1. Read Markdown content
      const content = await fileSystemRepository.readFile(file.path);

      // 2. Read separate layout metadata (.devoras/spatial.json)
      const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
      const spatialData = allMetadata[file.path] || {};

      // 3. Parse headings structure
      const parsedNodes = parseMarkdown(content);

      // 4. Align parsed nodes with layout metadata coordinates.
      //    Primary lookup: exact node ID.
      //    Fallback lookup: strip the _N sibling suffix (e.g. "Title_2" → "Title")
      //    so that when the first occurrence of a duplicate heading is deleted and
      //    the second becomes the canonical ID, its coordinates are not lost.
      const alignedNodes = parsedNodes.map((node) => {
        if (spatialData[node.id]) {
          return { ...node, x: spatialData[node.id].x, y: spatialData[node.id].y };
        }
        // Graceful fallback: try the base ID without sibling suffix
        const baseId = node.id.replace(/_\d+$/, '');
        if (baseId !== node.id && spatialData[baseId]) {
          return { ...node, x: spatialData[baseId].x, y: spatialData[baseId].y };
        }
        return node;
      });

      set({
        currentFile: file,
        rawContent: content,
        nodes: alignedNodes,
        spatialData,
        isDirty: false,
        viewMode: 'write', // Always start in write mode when opening a new file
      });
    } catch (e) {
      console.error(`Failed to load file ${file.path}:`, e);
    }
  },

  updateContent: (content) => {
    const { currentFile, spatialData, rawContent } = get();
    if (!currentFile) return;

    // Parse markdown structure (extract pure headings nodes)
    const parsedNodes = parseMarkdown(content);

    // Align parsed nodes with existing memory-spatial coordinates
    const alignedNodes = parsedNodes.map((node) => {
      if (spatialData[node.id]) {
        return {
          ...node,
          x: spatialData[node.id].x,
          y: spatialData[node.id].y,
        };
      }
      return node;
    });

    // Only mark as dirty when content has actually changed from the on-disk version.
    // This prevents CodeMirror's initialization-time docChanged event from
    // incorrectly signalling an unsaved edit the moment a file is opened.
    const hasChanged = content !== rawContent;

    set({
      rawContent: content,
      nodes: alignedNodes,
      isDirty: hasChanged,
    });
  },

  updateNodeCoordinate: (nodeId, x, y) => {
    const { spatialData, currentFile } = get();
    if (!currentFile) return;

    const updatedSpatial = {
      ...spatialData,
      [nodeId]: { x, y },
    };

    // Fast inline synchronization to prevent drag-stuttering
    const updatedNodes = get().nodes.map((node) => {
      if (node.id === nodeId) {
        return { ...node, x, y };
      }
      return node;
    });

    set({
      spatialData: updatedSpatial,
      nodes: updatedNodes,
      isDirty: true,
    });
  },

  saveFile: async () => {
    const { currentFile, rawContent, spatialData, isDirty } = get();
    if (!currentFile || !isDirty) return;

    const workspacePath = useWorkspaceStore.getState().workspacePath;
    if (!workspacePath) return;

    try {
      // 1. Write the clean markdown file (without comments)
      await fileSystemRepository.writeFile(currentFile.path, rawContent);

      // 2. Read all existing workspace metadata
      const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);

      // 3. Update metadata for the current file path
      const updatedMetadata = {
        ...allMetadata,
        [currentFile.path]: spatialData,
      };

      // 4. Save metadata file
      await fileSystemRepository.writeSpatialMetadata(workspacePath, updatedMetadata);

      set({
        isDirty: false,
      });
    } catch (e) {
      console.error(`Failed to save file ${currentFile.path}:`, e);
    }
  },
}));
