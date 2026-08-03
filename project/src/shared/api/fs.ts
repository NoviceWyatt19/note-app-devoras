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

  async saveImageAsset(
    basePath: string,
    data: Uint8Array,
    fileName: string,
    subDir: string,
  ): Promise<string> {
    try {
      const { writeFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');

      // subDir이 비어 있으면 basePath에 직접 저장, 그렇지 않으면 subDir의 각 세그먼트를 순차적으로 생성
      const targetDir = subDir ? `${basePath}/${subDir}` : basePath;

      // 중간 디렉터리 세그먼트를 순서대로 생성 (mkdir -p 역할)
      if (subDir) {
        const segments = subDir.split('/');
        let accumulated = basePath;
        for (const seg of segments) {
          if (!seg) continue;
          accumulated = `${accumulated}/${seg}`;
          if (!await exists(accumulated)) await mkdir(accumulated);
        }
      } else {
        if (!await exists(targetDir)) await mkdir(targetDir);
      }

      const filePath = `${targetDir}/${fileName}`;
      await writeFile(filePath, data);

      // 마크다운에 삽입할 상대 경로 반환
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
