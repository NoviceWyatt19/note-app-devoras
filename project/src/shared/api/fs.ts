export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

export interface FileSystemRepository {
  openDirectory(): Promise<string | null>;
  readDirectory(dirPath: string): Promise<FileEntry[]>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  createDirectory(dirPath: string): Promise<void>;
  renameEntry(oldPath: string, newPath: string): Promise<void>;
  moveEntry(oldPath: string, newPath: string): Promise<void>;
  deleteEntry(path: string, isDir: boolean): Promise<void>;
  readSpatialMetadata(workspacePath: string): Promise<Record<string, any>>;
  writeSpatialMetadata(workspacePath: string, metadata: Record<string, any>): Promise<void>;
  /**
   * Saves a binary image blob to `{basePath}/{subDir}/{fileName}`,
   * auto-creating all intermediate directories if absent.
   *
   * @param basePath  루트 경로 (워크스페이스 루트, 현재 파일 디렉터리, 또는 커스텀 절대 경로)
   * @param data      저장할 이미지 바이너리
   * @param fileName  저장할 파일명 (확장자 포함)
   * @param subDir    basePath 아래의 하위 디렉터리 경로 (예: 'assets/images', '.devoras/images', '_assets', '')
   * @returns         마크다운에 삽입할 상대 경로 (`{subDir}/{fileName}` 또는 `{fileName}`)
   */
  saveImageAsset(basePath: string, data: Uint8Array, fileName: string, subDir: string): Promise<string>;
}

// ----------------------------------------------------
// 1. Mock FileSystem Implementation (for Web Browser)
// ----------------------------------------------------
export class MockFileSystem implements FileSystemRepository {
  private virtualFs: Record<string, { content?: string; entries?: FileEntry[] }> = {
    '/mock-workspace': {
      entries: [
        { name: 'README.md', path: '/mock-workspace/README.md', isDir: false },
        { name: '기획안.md', path: '/mock-workspace/기획안.md', isDir: false },
        { name: 'assets', path: '/mock-workspace/assets', isDir: true },
      ],
    },
    '/mock-workspace/README.md': {
      content: '# Devoras MVP\n\n이것은 마크다운 파일입니다.\n\n## H2 노드 1\n이 노드의 내용입니다.\n\n### H3 서브노드\n서브노드 설명\n\n## H2 노드 2\n두 번째 노드 내용.',
    },
    '/mock-workspace/기획안.md': {
      content: '# Devoras 기획안\n\n- 극강의 가벼움\n- 마우스 프리',
    },
    '/mock-workspace/assets': {
      entries: [],
    },
    '/mock-workspace/.devoras/spatial.json': {
      content: JSON.stringify({
        '/mock-workspace/README.md': {
          'README/H2 노드 1': { x: 150, y: 120 },
          'README/H2 노드 2': { x: 400, y: 300 }
        }
      })
    }
  };

  async openDirectory(): Promise<string | null> {
    return '/mock-workspace';
  }

  async readDirectory(dirPath: string): Promise<FileEntry[]> {
    const dir = this.virtualFs[dirPath];
    if (dir && dir.entries) {
      return dir.entries;
    }
    return [];
  }

  async readFile(filePath: string): Promise<string> {
    const file = this.virtualFs[filePath];
    if (file && file.content !== undefined) {
      return file.content;
    }
    throw new Error(`File not found: ${filePath}`);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.virtualFs[filePath] = { content };
    // 부모 디렉토리에 항목 추가
    const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
    const parentDir = this.virtualFs[parentPath];
    if (parentDir && parentDir.entries) {
      const exists = parentDir.entries.some(e => e.path === filePath);
      if (!exists) {
        parentDir.entries.push({
          name: fileName,
          path: filePath,
          isDir: false,
        });
      }
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    this.virtualFs[dirPath] = { entries: [] };
    const parentPath = dirPath.substring(0, dirPath.lastIndexOf('/'));
    const dirName = dirPath.substring(dirPath.lastIndexOf('/') + 1);
    const parentDir = this.virtualFs[parentPath];
    if (parentDir && parentDir.entries) {
      const exists = parentDir.entries.some(e => e.path === dirPath);
      if (!exists) {
        parentDir.entries.push({
          name: dirName,
          path: dirPath,
          isDir: true,
        });
      }
    }
  }

  async renameEntry(oldPath: string, newPath: string): Promise<void> {
    const entry = this.virtualFs[oldPath];
    if (!entry) throw new Error(`Entry not found: ${oldPath}`);
    
    // 이사
    this.virtualFs[newPath] = entry;
    delete this.virtualFs[oldPath];

    // 부모 디렉토리 수정 (간단히 처리)
    const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const oldParentDir = this.virtualFs[oldParentPath];
    if (oldParentDir && oldParentDir.entries) {
      oldParentDir.entries = oldParentDir.entries.filter(e => e.path !== oldPath);
    }

    const newParentPath = newPath.substring(0, newPath.lastIndexOf('/'));
    const newName = newPath.substring(newPath.lastIndexOf('/') + 1);
    const newParentDir = this.virtualFs[newParentPath];
    if (newParentDir && newParentDir.entries) {
      const isDir = entry.entries !== undefined;
      newParentDir.entries.push({
        name: newName,
        path: newPath,
        isDir,
      });
    }
  }

  async moveEntry(oldPath: string, newPath: string): Promise<void> {
    return this.renameEntry(oldPath, newPath);
  }

  async deleteEntry(path: string, _isDir: boolean): Promise<void> {
    delete this.virtualFs[path];
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const parentDir = this.virtualFs[parentPath];
    if (parentDir && parentDir.entries) {
      parentDir.entries = parentDir.entries.filter(e => e.path !== path);
    }
  }

  async readSpatialMetadata(workspacePath: string): Promise<Record<string, any>> {
    const metaPath = `${workspacePath}/.devoras/spatial.json`;
    const file = this.virtualFs[metaPath];
    if (file && file.content) {
      try {
        return JSON.parse(file.content);
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  async writeSpatialMetadata(workspacePath: string, metadata: Record<string, any>): Promise<void> {
    try {
      const metaPath = `${workspacePath}/.devoras/spatial.json`;
      this.virtualFs[metaPath] = { content: JSON.stringify(metadata) };
    } catch (e) {
      console.error('Node readSpatialMetadata error:', e);
    }
  }

  async saveImageAsset(
    _basePath: string,
    _data: Uint8Array,
    fileName: string,
    subDir: string,
  ): Promise<string> {
    // Browser mock: no real file I/O — return the relative path so the
    // markdown link is still syntactically correct for testing.
    const relativePath = subDir ? `${subDir}/${fileName}` : fileName;
    console.info(`[Mock] Image save skipped for: ${relativePath}`);
    return relativePath;
  }
}

// ----------------------------------------------------
// 2. Tauri FileSystem Implementation (for Tauri 2 App)
// ----------------------------------------------------
export class TauriFileSystem implements FileSystemRepository {
  async openDirectory(): Promise<string | null> {
    try {
      // Dynamic import to prevent browser-load crash
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '워크스페이스 폴더 선택',
      });
      return selected as string | null;
    } catch (e) {
      console.error('Tauri openDirectory error:', e);
      return null;
    }
  }

  async readDirectory(dirPath: string): Promise<FileEntry[]> {
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const entries = await readDir(dirPath);
      return entries.map((entry: any) => ({
        name: entry.name || '',
        path: `${dirPath}/${entry.name}`,
        isDir: entry.isDirectory,
      }));
    } catch (e) {
      console.error('Tauri readDirectory error:', e);
      return [];
    }
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      return await readTextFile(filePath);
    } catch (e) {
      console.error('Tauri readFile error:', e);
      throw e;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(filePath, content);
    } catch (e) {
      console.error('Tauri writeFile error:', e);
      throw e;
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    try {
      const { mkdir } = await import('@tauri-apps/plugin-fs');
      await mkdir(dirPath, { recursive: true });
    } catch (e) {
      console.error('Tauri createDirectory error:', e);
      throw e;
    }
  }

  async renameEntry(oldPath: string, newPath: string): Promise<void> {
    try {
      const { rename } = await import('@tauri-apps/plugin-fs');
      await rename(oldPath, newPath);
    } catch (e) {
      console.error('Tauri renameEntry error:', e);
      throw e;
    }
  }

  async moveEntry(oldPath: string, newPath: string): Promise<void> {
    try {
      const { rename } = await import('@tauri-apps/plugin-fs');
      await rename(oldPath, newPath);
    } catch (e) {
      console.error('Tauri moveEntry error:', e);
      throw e;
    }
  }

  async deleteEntry(path: string, isDir: boolean): Promise<void> {
    try {
      const { remove } = await import('@tauri-apps/plugin-fs');
      await remove(path, { recursive: isDir });
    } catch (e) {
      console.error('Tauri deleteEntry error:', e);
      throw e;
    }
  }

  async readSpatialMetadata(workspacePath: string): Promise<Record<string, any>> {
    try {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const metaPath = `${workspacePath}/.devoras/spatial.json`;
      const hasMeta = await exists(metaPath);
      if (!hasMeta) return {};
      const content = await readTextFile(metaPath);
      return JSON.parse(content);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e));
      if (!msg.includes('forbidden path')) {
        console.error('Tauri readSpatialMetadata error:', e);
      }
      return {};
    }
  }

  async writeSpatialMetadata(workspacePath: string, metadata: Record<string, any>): Promise<void> {
    try {
      const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
      const devorasDir = `${workspacePath}/.devoras`;
      const hasDir = await exists(devorasDir);
      if (!hasDir) {
        await mkdir(devorasDir);
      }
      const metaPath = `${devorasDir}/spatial.json`;
      await writeTextFile(metaPath, JSON.stringify(metadata, null, 2));
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e));
      if (!msg.includes('forbidden path')) {
        console.error('Tauri writeSpatialMetadata error:', e);
      }
    }
  }

  async saveImageAsset(
    basePath: string,
    data: Uint8Array,
    fileName: string,
    subDir: string,
  ): Promise<string> {
    try {
      // ── Rust 네이티브 커맨드로 직접 파일 저장 ──────────────────────────
      // Tauri plugin-fs는 WebView 샌드박스 scope 제한으로 인해 사용자가
      // 선택한 임의 경로에 파일을 쓸 수 없는 문제(forbidden path)가 있음.
      // save_image_file Rust 커맨드(std::fs)는 OS 레벨 접근이라 제한 없음.
      const { invoke } = await import('@tauri-apps/api/core');
      const targetDir = subDir ? `${basePath}/${subDir}` : basePath;
      const filePath = `${targetDir}/${fileName}`;

      console.log('[TauriFS] save_image_file invoking:', filePath);
      await invoke('save_image_file', {
        path: filePath,
        data: Array.from(data),   // Uint8Array → number[] (Rust Vec<u8>)
      });
      console.log('[TauriFS] save_image_file OK:', filePath);

      return subDir ? `${subDir}/${fileName}` : fileName;
    } catch (e) {
      console.error('Tauri saveImageAsset error:', e);
      throw e;
    }
  }
}

// ----------------------------------------------------
// 3. Auto-selecting factory instance
// ----------------------------------------------------
// Tauri 1: window.__TAURI__ (withGlobalTauri: true 설정 필요)
// Tauri 2: window.__TAURI_INTERNALS__ (웹뷰에 항상 주입되는 IPC 포트 객체)
// 두 조건을 OR로 결합하여 양쪽 버전 모두 안전하게 감지한다.
const isTauri =
  typeof window !== 'undefined' &&
  ((window as any).__TAURI__ !== undefined ||
    (window as any).__TAURI_INTERNALS__ !== undefined);

export const fileSystemRepository: FileSystemRepository = isTauri
  ? new TauriFileSystem()
  : new MockFileSystem();
