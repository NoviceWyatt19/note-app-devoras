import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { create } from 'zustand';
import { createDebouncedWriter } from '@/shared/lib/debouncedWriter';

export interface RecentWorkspaceItem {
  path: string;
  name: string;
  lastOpened: number;
  isPinned: boolean;
}

export interface RecentWorkspaceState {
  recentList: RecentWorkspaceItem[];
  autoOpenLast: boolean;

  addRecent: (path: string) => void;
  removeRecent: (path: string) => void;
  togglePin: (path: string) => void;
  setAutoOpenLast: (value: boolean) => void;
  loadFromDisk: () => Promise<void>;
  _writeToDisk: () => Promise<void>;
}

const MAX_RECENT = 10;
const scheduleSave = createDebouncedWriter(500);

export const useRecentWorkspaceStore = create<RecentWorkspaceState>((set, get) => ({
  recentList: [],
  autoOpenLast: true,

  addRecent: (path: string) => {
    const name = path.split('/').pop() || path;
    set((state) => {
      const filtered = state.recentList.filter((item) => item.path !== path);
      const newItem: RecentWorkspaceItem = {
        path,
        name,
        lastOpened: Date.now(),
        isPinned: false,
      };
      const next = [newItem, ...filtered].slice(0, MAX_RECENT);
      return { recentList: next };
    });
    scheduleSave(() => get()._writeToDisk());
  },

  removeRecent: (path: string) => {
    set((state) => ({
      recentList: state.recentList.filter((item) => item.path !== path),
    }));
    scheduleSave(() => get()._writeToDisk());
  },

  togglePin: (path: string) => {
    set((state) => ({
      recentList: state.recentList.map((item) =>
        item.path === path ? { ...item, isPinned: !item.isPinned } : item
      ),
    }));
    scheduleSave(() => get()._writeToDisk());
  },

  setAutoOpenLast: (value: boolean) => {
    set({ autoOpenLast: value });
    scheduleSave(() => get()._writeToDisk());
  },

  loadFromDisk: async () => {
    try {
      const dir = await appDataDir();
      const filePath = await join(dir, 'recent_workspaces.json');
      const text = await readTextFile(filePath);
      const data = JSON.parse(text);
      set({
        recentList: data.recentList ?? [],
        autoOpenLast: data.autoOpenLast ?? true,
      });
    } catch {
      // 파일 없으면 빈 상태 유지 (첫 실행)
    }
  },

  // 실제 디스크 쓰기 (debounce를 거쳐 호출됨)
  _writeToDisk: async () => {
    try {
      const dir = await appDataDir();
      await mkdir(dir, { recursive: true }).catch(() => {});
      const filePath = await join(dir, 'recent_workspaces.json');
      const { recentList, autoOpenLast } = get();
      await writeTextFile(filePath, JSON.stringify({ recentList, autoOpenLast }, null, 2));
    } catch (err) {
      console.error('[RecentStore] 디스크 쓰기 실패:', err);
    }
  },
}));
