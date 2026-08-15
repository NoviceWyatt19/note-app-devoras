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
  moveEntry: (oldPath: string, targetDirPath: string) => Promise<void>;
  copyEntry: (srcPath: string, targetDirPath: string) => Promise<void>;
  deleteEntry: (path: string, isDir: boolean) => Promise<void>;
}

const initialPath = localStorage.getItem('devoras_workspace_path') || null;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: initialPath,
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
      if (selectedPath && selectedPath !== get().workspacePath) {
        localStorage.setItem('devoras_workspace_path', selectedPath);
        window.location.reload(); // Refresh the app to clear all stale states
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
          } else {
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
    // 만약 이미 .erd 또는 .md 확장자가 있으면 그대로 사용, 없으면 기본적으로 .md 추가
    if (!sanitizedName.endsWith('.md') && !sanitizedName.endsWith('.erd')) {
      sanitizedName += '.md';
    }
    const fullPath = `${parentPath}/${sanitizedName}`;
    
    // 확장자에 따라 초기 내용 분기
    let initialContent = '';
    if (sanitizedName.endsWith('.md')) {
      initialContent = `# ${sanitizedName.replace('.md', '')}\n\n`;
    } else if (sanitizedName.endsWith('.erd')) {
      const { createEmptyErdDocument } = await import('../../erd/model/erd');
      initialContent = JSON.stringify(createEmptyErdDocument(), null, 2);
    }
    
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

  moveEntry: async (oldPath: string, targetDirPath: string) => {
    // Guard 1: Cannot move into itself or its own subdirectories
    if (targetDirPath === oldPath || targetDirPath.startsWith(oldPath + '/')) {
      alert('자기 자신 또는 하위 디렉터리로 이동할 수 없습니다.');
      return;
    }

    const name = oldPath.split('/').pop();
    if (!name) return;

    const newPath = `${targetDirPath}/${name}`;

    // Guard 2: If the destination is exactly the same, do nothing
    if (oldPath === newPath) return;

    try {
      await fileSystemRepository.moveEntry(oldPath, newPath);
      useDocumentStore.getState().handleFileRenamed(oldPath, newPath, name);
      await get().scanWorkspace();
    } catch (e) {
      console.error('Failed to move entry:', e);
      alert('이동에 실패했습니다. 대상 폴더에 동일한 이름이 이미 존재할 수 있습니다.');
    }
  },

  copyEntry: async (srcPath: string, targetDirPath: string) => {
    const name = srcPath.split('/').pop();
    if (!name) return;

    // Generate a unique name: insert "_copy" before the extension
    const dotIdx = name.lastIndexOf('.');
    const baseName = dotIdx > 0 ? name.substring(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.substring(dotIdx) : '';
    const destName = `${baseName}_copy${ext}`;
    const destPath = `${targetDirPath}/${destName}`;

    try {
      await fileSystemRepository.copyEntry(srcPath, destPath);
      await get().scanWorkspace();
    } catch (e) {
      console.error('Failed to copy entry:', e);
      alert('복사에 실패했습니다.');
    }
  },

  deleteEntry: async (path: string, isDir: boolean) => {
    await fileSystemRepository.deleteEntry(path, isDir);
    // Tell DocumentStore to close tabs related to this file/folder
    useDocumentStore.getState().handleFileDeleted(path, isDir);
    await get().scanWorkspace();
  },
}));
