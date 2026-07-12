export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FileSystemRepository {
  openDirectory(): Promise<string | null>;
  readDirectory(dirPath: string): Promise<FileEntry[]>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  readSpatialMetadata(workspacePath: string): Promise<Record<string, any>>;
  writeSpatialMetadata(workspacePath: string, metadata: Record<string, any>): Promise<void>;
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
    const metaPath = `${workspacePath}/.devoras/spatial.json`;
    this.virtualFs[metaPath] = { content: JSON.stringify(metadata) };
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

  async readSpatialMetadata(workspacePath: string): Promise<Record<string, any>> {
    try {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const metaPath = `${workspacePath}/.devoras/spatial.json`;
      const hasMeta = await exists(metaPath);
      if (!hasMeta) return {};
      const content = await readTextFile(metaPath);
      return JSON.parse(content);
    } catch (e) {
      console.error('Tauri readSpatialMetadata error:', e);
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
    } catch (e) {
      console.error('Tauri writeSpatialMetadata error:', e);
    }
  }
}

// ----------------------------------------------------
// 3. Auto-selecting factory instance
// ----------------------------------------------------
const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;

export const fileSystemRepository: FileSystemRepository = isTauri
  ? new TauriFileSystem()
  : new MockFileSystem();
