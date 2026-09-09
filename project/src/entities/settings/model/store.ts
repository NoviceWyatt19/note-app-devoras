import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { create } from 'zustand';
import { AppSettings, AutosaveLevel, DEFAULT_SETTINGS, EditorSettings, MindmapSettings, GeneralSettings } from './types';
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

/**
 * FEAT-20260904-01 마이그레이션 — 옛 `autosaveDelay: number`(ms) 를 새
 * `autosaveLevel` 3단계로 옮긴다. 값이 없거나 파싱 실패면(예: 옛 필드 자체가
 * 없는 최초 실행, 또는 손상된 값) 새 기본값('high')으로 보낸다 — 옛 기본값
 * 3000ms 도 이 규칙(< 5000 → 'high')에 자연히 들어맞아 별도 특례가 필요 없다.
 */
function migrateAutosaveLevel(parsedEditor: unknown): AutosaveLevel | undefined {
  if (typeof parsedEditor !== 'object' || parsedEditor === null) return undefined;
  const e = parsedEditor as Record<string, unknown>;

  if (e.autosaveLevel === 'off' || e.autosaveLevel === 'low' || e.autosaveLevel === 'high') {
    return e.autosaveLevel;
  }
  if (typeof e.autosaveDelay === 'number' && Number.isFinite(e.autosaveDelay)) {
    return e.autosaveDelay < 5000 ? 'high' : 'low';
  }
  return undefined; // DEFAULT_SETTINGS.editor.autosaveLevel('high')로 폴백
}

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

      // 옛 autosaveDelay 키는 마이그레이션에만 쓰고 결과 객체엔 남기지 않는다 —
      // 그대로 두면 다음 저장 때 죽은 필드가 settings.json 에 영구히 남는다.
      const { autosaveDelay: _legacyAutosaveDelay, ...restEditor } = (parsed.editor ?? {}) as Record<string, unknown>;
      void _legacyAutosaveDelay;

      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        editor: {
          ...DEFAULT_SETTINGS.editor,
          ...restEditor,
          autosaveLevel: migrateAutosaveLevel(parsed.editor) ?? DEFAULT_SETTINGS.editor.autosaveLevel,
        },
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
