import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { create } from 'zustand';
import { AppSettings, DEFAULT_SETTINGS, EditorSettings, MindmapSettings, GeneralSettings } from './types';
import { createDebouncedWriter } from '@/shared/lib/debouncedWriter';

interface SettingsState {
  settings: AppSettings;
  isLoaded: boolean;
  isOpen: boolean;

  setIsOpen: (isOpen: boolean) => void;
  updateEditor: (patch: Partial<EditorSettings>) => void;
  updateMindmap: (patch: Partial<MindmapSettings>) => void;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  setActiveThemeFile: (fileName: string | null) => void;
  resetToDefaults: () => void;

  loadSettings: () => Promise<void>;
  _writeSettings: () => Promise<void>;
}

const scheduleSave = createDebouncedWriter(500);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  isOpen: false,

  setIsOpen: (isOpen: boolean) => set({ isOpen }),

  updateEditor: (patch) => {
    set((s) => ({
      settings: { ...s.settings, editor: { ...s.settings.editor, ...patch } },
    }));
    scheduleSave(() => get()._writeSettings());
  },

  updateMindmap: (patch) => {
    set((s) => ({
      settings: { ...s.settings, mindmap: { ...s.settings.mindmap, ...patch } },
    }));
    scheduleSave(() => get()._writeSettings());
  },

  updateGeneral: (patch) => {
    set((s) => ({
      settings: { ...s.settings, general: { ...s.settings.general, ...patch } },
    }));
    scheduleSave(() => get()._writeSettings());
  },

  setActiveThemeFile: (fileName) => {
    set((s) => ({ settings: { ...s.settings, activeThemeFile: fileName } }));
    scheduleSave(() => get()._writeSettings());
  },

  resetToDefaults: () => {
    set({ settings: DEFAULT_SETTINGS });
    scheduleSave(() => get()._writeSettings());
  },

  loadSettings: async () => {
    try {
      const dir = await appDataDir();
      const filePath = await join(dir, 'settings.json');
      const text = await readTextFile(filePath);
      const parsed = JSON.parse(text) as Partial<AppSettings>;

      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        editor: { ...DEFAULT_SETTINGS.editor, ...parsed.editor },
        mindmap: { ...DEFAULT_SETTINGS.mindmap, ...parsed.mindmap },
        general: { ...DEFAULT_SETTINGS.general, ...parsed.general },
      };

      set({ settings: merged, isLoaded: true });
    } catch {
      set({ settings: DEFAULT_SETTINGS, isLoaded: true });
    }
  },

  _writeSettings: async () => {
    try {
      const dir = await appDataDir();
      await mkdir(dir, { recursive: true }).catch(() => {});
      const filePath = await join(dir, 'settings.json');
      await writeTextFile(filePath, JSON.stringify(get().settings, null, 2));
    } catch (err) {
      console.error('[SettingsStore] 저장 실패:', err);
    }
  },
}));
