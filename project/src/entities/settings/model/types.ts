export interface EditorSettings {
  fontSize: number;           // 12~24, 기본값 15
  fontFamily: string;         // 기본값 'ui-monospace, monospace'
  autosaveDelay: number;      // ms 단위. 0 = 즉시, 1000~10000, 기본값 3000
  lineWrapping: boolean;      // 기본값 true
  contentMaxWidth: number;    // 에디터 중앙 정렬 최대 너비 (0이면 전체 너비 사용). 기본값 900
}

export interface MindmapSettings {
  edgeStyle: 'bezier' | 'straight' | 'smoothstep';  // 기본값 'bezier'
  nodeColorScheme: 'default' | 'warm' | 'cool' | 'mono';
}

export interface GeneralSettings {
  autoOpenLastWorkspace: boolean;  // 기본값 true
  language: 'ko' | 'en';          // 기본값 'ko'
  themeMode: 'system' | 'dark' | 'light';  // 기본값 'system'. R5-a T6
}

export interface AppSettings {
  version: 1;
  editor: EditorSettings;
  mindmap: MindmapSettings;
  general: GeneralSettings;
  activeThemeFile: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  editor: {
    fontSize: 15,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    autosaveDelay: 3000,
    lineWrapping: true,
    contentMaxWidth: 900,
  },
  mindmap: {
    edgeStyle: 'bezier',
    nodeColorScheme: 'default',
  },
  general: {
    autoOpenLastWorkspace: true,
    language: 'ko',
    themeMode: 'system',
  },
  activeThemeFile: null,
};
