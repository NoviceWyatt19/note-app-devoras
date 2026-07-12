import { create } from 'zustand';
import { fileSystemRepository, FileEntry } from '@/shared/api/fs';

interface WorkspaceState {
  workspacePath: string | null;
  files: FileEntry[];
  isLoading: boolean;
  setWorkspacePath: (path: string | null) => void;
  openWorkspace: () => Promise<void>;
  scanWorkspace: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: null,
  files: [],
  isLoading: false,

  setWorkspacePath: (path) => set({ workspacePath: path }),

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
      const entries = await fileSystemRepository.readDirectory(workspacePath);
      // Filter out non-markdown files and directories for simplicity in MVP, but keep directories
      const filtered = entries.filter(
        entry => entry.isDir || entry.name.endsWith('.md')
      );
      set({ files: filtered });
    } catch (e) {
      console.error('Failed to scan workspace files:', e);
    } finally {
      set({ isLoading: false });
    }
  },
}));
