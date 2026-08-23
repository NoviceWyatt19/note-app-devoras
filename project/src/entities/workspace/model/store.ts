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
  openWorkspace: () => Promise<void>;
  openWorkspaceByPath: (path: string) => Promise<void>;
  scanWorkspace: () => Promise<void>;
  createFile: (parentPath: string, name: string) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
  renameEntry: (oldPath: string, newPath: string, newName: string) => Promise<void>;
  moveEntry: (oldPath: string, targetDirPath: string) => Promise<void>;
  copyEntry: (srcPath: string, targetDirPath: string) => Promise<void>;
  deleteEntry: (path: string, isDir: boolean) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: null,
  files: [],
  isLoading: false,
  config: DEFAULT_WORKSPACE_CONFIG,

  openWorkspace: async () => {
    try {
      const selectedPath = await fileSystemRepository.openDirectory();
      if (selectedPath && selectedPath !== get().workspacePath) {
        set({ isLoading: true, files: [], workspacePath: selectedPath });
        useDocumentStore.getState().resetDocumentState();
        await get().scanWorkspace();
      }
    } catch (e) {
      console.error('Failed to open workspace directory:', e);
      set({ isLoading: false });
    }
  },

  openWorkspaceByPath: async (path: string) => {
    if (path === get().workspacePath) return;
    try {
      // path의 유효성을 검사하기 위해 얉은 스캔을 먼저 해볼 수도 있지만, 
      // 실패시 catch로 넘어가도록 fileSystemRepository.readDirectory를 체크할 수 있음.
      await fileSystemRepository.readDirectory(path); // 폴더가 존재하는지 확인
      set({ isLoading: true, files: [], workspacePath: path });
      useDocumentStore.getState().resetDocumentState();
      await get().scanWorkspace();
    } catch (e) {
      console.error('Failed to open workspace path:', e);
      set({ isLoading: false });
      throw e; // 호출자(Launcher)에게 에러 전달
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
