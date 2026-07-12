import { create } from 'zustand';
import { FileEntry, fileSystemRepository } from '@/shared/api/fs';
import { MindNode, SpatialData, parseMarkdown, serializeSpatialData } from '../lib/parser';

interface DocumentState {
  currentFile: FileEntry | null;
  rawContent: string;
  nodes: MindNode[];
  spatialData: SpatialData;
  isDirty: boolean;
  loadFile: (file: FileEntry) => Promise<void>;
  updateContent: (content: string) => void;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
  saveFile: () => Promise<void>;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentFile: null,
  rawContent: '',
  nodes: [],
  spatialData: {},
  isDirty: false,

  loadFile: async (file) => {
    try {
      const content = await fileSystemRepository.readFile(file.path);
      const { nodes, spatialData } = parseMarkdown(content, file.path);
      set({
        currentFile: file,
        rawContent: content,
        nodes,
        spatialData,
        isDirty: false,
      });
    } catch (e) {
      console.error(`Failed to load file ${file.path}:`, e);
    }
  },

  updateContent: (content) => {
    const { currentFile, spatialData } = get();
    if (!currentFile) return;

    const { nodes, spatialData: parsedSpatial } = parseMarkdown(content, currentFile.path);

    // Merge existing memory-spatialData (unsaved coordinates) with newly parsed spatial data (from text)
    const mergedSpatial = { ...spatialData, ...parsedSpatial };

    // Align newly parsed nodes with the merged spatial coordinates to maintain existing node positions
    const alignedNodes = nodes.map((node) => {
      if (mergedSpatial[node.id]) {
        return {
          ...node,
          x: mergedSpatial[node.id].x,
          y: mergedSpatial[node.id].y,
        };
      }
      return node;
    });

    set({
      rawContent: content,
      nodes: alignedNodes,
      spatialData: mergedSpatial,
      isDirty: true,
    });
  },

  updateNodeCoordinate: (nodeId, x, y) => {
    const { spatialData, currentFile } = get();
    if (!currentFile) return;

    const updatedSpatial = {
      ...spatialData,
      [nodeId]: { x, y },
    };

    // Update coordinates in nodes list directly to keep visual drag-effects fluid
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

    try {
      const finalizedContent = serializeSpatialData(rawContent, currentFile.path, spatialData);
      await fileSystemRepository.writeFile(currentFile.path, finalizedContent);
      set({
        rawContent: finalizedContent,
        isDirty: false,
      });
    } catch (e) {
      console.error(`Failed to save file ${currentFile.path}:`, e);
    }
  },
}));
