import { create } from 'zustand';
import { fileSystemRepository, FileEntry } from '@/shared/api/fs';
import { WorkspaceConfig, DEFAULT_WORKSPACE_CONFIG } from '@/entities/workspace/model/types';
import { useDocumentStore } from '@/entities/document/model/store';

interface WorkspaceState {
  workspacePath: string | null;
  files: FileEntry[];
  isLoading: boolean;
  /** 워크스페이스 전역 설정 (이미지 저장 정책 등) */
  config: WorkspaceConfig;
  setWorkspacePath: (path: string | null) => void;
  setConfig: (config: Partial<WorkspaceConfig>) => void;
  openWorkspace: () => Promise<void>;
  scanWorkspace: () => Promise<void>;
  createFile: (parentPath: string, name: string) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
  renameEntry: (oldPath: string, newPath: string, newName: string) => Promise<void>;
  deleteEntry: (path: string, isDir: boolean) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: null,
  files: [],
  isLoading: false,
  config: DEFAULT_WORKSPACE_CONFIG,

  setWorkspacePath: (path) => set({ workspacePath: path }),

  setConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),

  openWorkspace: async () => {
    set({ isLoading: true });
    try {
      const selectedPath = await fileSystemRepository.openDirectory();
      if (selectedPath) {
        set({ workspacePath: selectedPath });
        await get().scanWorkspace();
      }
    } catch (e) {
      console.error('Failed to open workspace directory:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  scanWorkspace: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;

    set({ isLoading: true });
    try {
      const buildTree = async (dirPath: string): Promise<FileEntry[]> => {
        const entries = await fileSystemRepository.readDirectory(dirPath);
        const result: FileEntry[] = [];
        
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          
          if (entry.isDir) {
            const children = await buildTree(entry.path);
            result.push({ ...entry, children });
          } else if (entry.name.endsWith('.md')) {
            result.push(entry);
          }
        }
        
        return result.sort((a, b) => {
          if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
          return a.isDir ? -1 : 1;
        });
      };

      const tree = await buildTree(workspacePath);
      set({ files: tree });
    } catch (e) {
      console.error('Failed to scan workspace files:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  createFile: async (parentPath: string, name: string) => {
    let sanitizedName = name.trim();
    if (!sanitizedName.endsWith('.md')) {
      sanitizedName += '.md';
    }
    const fullPath = `${parentPath}/${sanitizedName}`;
    const initialContent = `# ${sanitizedName.replace('.md', '')}\n\n`;
    await fileSystemRepository.writeFile(fullPath, initialContent);
    await get().scanWorkspace();
  },

  createFolder: async (parentPath: string, name: string) => {
    const fullPath = `${parentPath}/${name.trim()}`;
    await fileSystemRepository.createDirectory(fullPath);
    await get().scanWorkspace();
  },

  renameEntry: async (oldPath: string, newPath: string, newName: string) => {
    await fileSystemRepository.renameEntry(oldPath, newPath);
    // Tell DocumentStore to update opened tabs
    useDocumentStore.getState().handleFileRenamed(oldPath, newPath, newName);
    await get().scanWorkspace();
  },

  deleteEntry: async (path: string, isDir: boolean) => {
    await fileSystemRepository.deleteEntry(path, isDir);
    // Tell DocumentStore to close tabs related to this file/folder
    useDocumentStore.getState().handleFileDeleted(path, isDir);
    await get().scanWorkspace();
  },
}));
