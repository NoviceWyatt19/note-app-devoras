# Phase 3.5: 핵심 UX 확장 — 상세 구현 계획

> **프로젝트**: Devoras Design (Tauri 2 + React 18 + Zustand + CodeMirror 6)
> **현재 버전**: `0.8.26` (본 계획 작성 시점 `0.6.4`)
> **기준 문서**: `function_roadmap.md`, `architecture_stages.md`, `FUNCTIONS_RELATIONSHIP.md`, Phase 3.5 기획서 5건
> **선행 완료**: Tier 1 버그 전량 수정, Tier 2 구조 정비 (parser 분리, splitPane 방향, O(N) 최적화, ERD useEffect 제거)
>
> ⚠️ **2026-08-27 갱신** — `claude-history/debug/DEBUG_PLAN_20260831_204000.md` 의 **편집 표면 상시화(Option B)** 로 CodeMirror 인스턴스가 "패널당 1개"에서 **"블록당 1개"** 로 바뀝니다. 이 전제에 의존하는 **§2.5(Compartment)**, **§4A.5(파일 내 검색)**, **§4A.6(EditorViewRegistry)** 에 정정 주석을 삽입했습니다. 해당 절을 구현하기 전에 주석을 먼저 읽으세요.
>
> ⚠️ **2026-08-27 추가 갱신** — 커스텀 문법(`->`/`=>`) 선구현 스파이크를 진행하며 Stage 5 「커스텀 심볼 파싱 격리」 가정이 반증되었습니다. 새 절 **「스파이크: 커스텀 문법 선구현 및 파생 과제」** 를 추가했고, `SyntaxDecorator` 중재 인프라가 신규 파생 과제로 열렸습니다 (`Open Questions` #5, #6).
>
> 🔴 **2026-08-29 갱신 — Sprint 3(렌더링/메모리 최적화)의 전제가 실측으로 바뀌었습니다.**
> 「블록당 CodeMirror 1개」 구조의 비용을 처음으로 실측한 결과 **자체 예산을 20~58배 초과**합니다.
> Sprint 3 에 착수하기 전에 [`ARCHITECTURE_FINDINGS.md`](ARCHITECTURE_FINDINGS.md) **A6** 를 먼저 읽으세요.
>
> | N (블록) | 스토어 로직 | 마운트 완료 | 블록당 |
> |---|---|---|---|
> | 25 | 0.4 ms | 1,015 ms | 40.6 ms |
> | 100 | 1.6 ms | 5,677 ms | 56.8 ms |
> | **200** | **1.6 ms** | **7.0~17.4 초** (예산 300ms) | 35~87 ms |
>
> 두 가지가 계획을 바꿉니다.
> 1. **스토어/파싱 최적화는 의미가 없습니다** — N=200 에서 스토어 로직은 1.6ms 로 사실상 공짜이고,
>    비용의 거의 전부가 `EditorView` 생성입니다.
> 2. **비용이 초선형입니다**(성장 지수 ≈ 1.37, 블록당 40→87ms). 각 인스턴스 생성이 이미 마운트된
>    문서 전체에 비례하는 일을 하고 있다는 뜻이며, 레이아웃 스래싱이 의심됩니다(추정 — 프로파일 필요).
>
> **권고**: 가상화(E7)에 바로 착수하지 말고 **레이아웃 스래싱을 먼저 프로파일**하십시오.
> 선형으로만 되돌려도 N=200 이 8초 → 1초대가 됩니다. 가상화에 착수한다면 **높이 캐시가 필수**입니다 —
> 높이 캐시 없는 가상화는 BUG-20260828-01(수직 방향키 줄 스킵)과 **같은 계열의 결함을 재생산**합니다.
>
> ⚠️ **2026-08-29 추가** — 검증 인프라가 이 사이클에서 바뀌었습니다.
> T1 하네스 티어는 이전까지 **한 번도 실행 가능한 적이 없었고**(Node 20 에 없는 플래그) 지금은 복구됐습니다(`pnpm test:t1`).
> 런타임은 **Node 24 LTS** 로 고정(`.nvmrc`, `engines`)되었으므로 새 환경에서는 `nvm use` 로 시작하십시오.
> 신규 구현에는 T1(로직) / T2(레이아웃, Chromium) / T3(실기, 콘솔 한 줄) 세 티어를 그대로 쓸 수 있습니다.

---

## 전체 개요

Phase 3.5는 최근 식별된 메모리 점유(300~400MB) 이슈 해결을 최우선으로 하여, 렌더링 최적화 후 UX 기능 확장을 진행하는 **5단계(Sprint)**로 재편되었습니다.

```mermaid
graph LR
    S1["Sprint 1\n시작 런처 (완료)"]
    S2["Sprint 2\n앱 설정 시스템 (완료)"]
    S3["Sprint 3\n렌더링/메모리 최적화"]
    S4["Sprint 4\nYAML 테마"]
    S5["Sprint 5\n전역 검색 / 다중 탭"]

    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5

    style S1 fill:#4ade80,stroke:#166534
    style S2 fill:#4ade80,stroke:#166534
    style S3 fill:#f87171,stroke:#991b1b,color:#fff
    style S4 fill:#c084fc,stroke:#6b21a8
    style S5 fill:#facc15,stroke:#854d0e
```

> [!IMPORTANT]
> **의존성 변경 핵심**: 다중 탭과 테마 주입을 진행하기 전에, 반드시 CodeMirror 인스턴스 단일화(혹은 가상화) 및 Base64 이미지 로딩 로직 제거(Sprint 3)가 선행되어야 DOM 폭발과 크래시를 막을 수 있습니다.

---

## Sprint 1: 시작 런처 (Startup Workspace Launcher)

> **참조**: `functions/8_launcher_on_startup.md` · 난이도: ★★☆ · 예상 소요: 2~3일
> **다른 기능 의존성 없음** — 독립적으로 먼저 구현 가능

### 1.1 목표

앱 실행 시 워크스페이스가 선택되지 않은 상태(`workspacePath === null`)이면, 빈 에디터 대신 **시작 런처 화면**을 표시합니다. 최근 워크스페이스 목록, 즐겨찾기 핀, 폴더 열기 버튼을 제공합니다.

### 1.2 신규 파일 목록

| 파일 경로 | 역할 |
|-----------|------|
| `src/entities/workspace/model/recentStore.ts` | 최근 워크스페이스 영구 저장 Zustand Store |
| `src/pages/LauncherPage/LauncherPage.tsx` | 시작 런처 페이지 컴포넌트 |

### 1.3 데이터 모델 설계

```typescript
// src/entities/workspace/model/recentStore.ts

interface RecentWorkspaceItem {
  path: string;        // 워크스페이스 절대 경로
  name: string;        // 폴더명 (path의 마지막 세그먼트)
  lastOpened: number;  // Unix timestamp (ms)
  isPinned: boolean;   // 즐겨찾기 여부
}

interface RecentWorkspaceState {
  recentList: RecentWorkspaceItem[];
  autoOpenLast: boolean;  // 앱 시작 시 마지막 워크스페이스 자동 열기

  // 액션
  addRecent: (path: string) => void;
  removeRecent: (path: string) => void;
  togglePin: (path: string) => void;
  setAutoOpenLast: (value: boolean) => void;
  loadFromDisk: () => Promise<void>;
  saveToDisk: () => Promise<void>;
}
```

### 1.4 저장 전략

최근 워크스페이스 목록은 Tauri의 **App Data Directory**에 `recent_workspaces.json`으로 영구 저장합니다.

```typescript
// 저장 경로 결정 (Tauri 2 API)
import { appDataDir } from '@tauri-apps/api/path';

const CONFIG_DIR = await appDataDir();
// macOS: ~/Library/Application Support/com.devoras.dev/
// 파일: recent_workspaces.json
```

> [!TIP]
> **왜 `localStorage`가 아닌 파일 시스템인가?**
> `localStorage`는 WebView 컨텍스트에 묶여 있어 Tauri 업데이트 시 사라질 수 있습니다.
> App Data Directory는 OS 표준 경로이므로 앱 업데이트 후에도 데이터가 보존됩니다.

### 1.5 구현 순서 (Step-by-Step)

#### Step 0 (공통): `debouncedWriter` 유틸리티 생성

> [!IMPORTANT]
> **Race Condition 방지**: 설정/최근 목록 등의 `saveToDisk` 호출이 연속으로 발생할 때(슬라이더 드래그, 빠른 핀 토글 등) 파일 시스템 동시 쓰기 충돌을 방지하기 위해 모든 디스크 저장에 **500ms debounce**를 적용합니다.

```typescript
// src/shared/lib/debouncedWriter.ts

/**
 * 디스크 저장 전용 debounce 팩토리.
 * 동일 키에 대해 500ms 내 중복 호출을 병합하여 마지막 1회만 실행합니다.
 */
export function createDebouncedWriter(delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (writeFn: () => Promise<void>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      try {
        await writeFn();
      } catch (err) {
        console.error('[DebouncedWriter] 저장 실패:', err);
      }
    }, delayMs);
  };
}
```

이 유틸리티를 `recentStore`, `settingsStore`, `themeStore` 등 모든 영구 저장 Store에서 공유합니다.

#### Step 1: `recentStore.ts` 생성

```typescript
// src/entities/workspace/model/recentStore.ts
import { create } from 'zustand';
import { createDebouncedWriter } from '@/shared/lib/debouncedWriter';

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
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
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
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true }).catch(() => {});
    const filePath = await join(dir, 'recent_workspaces.json');
    const { recentList, autoOpenLast } = get();
    await writeTextFile(filePath, JSON.stringify({ recentList, autoOpenLast }, null, 2));
  },
}));
```

#### Step 2: `LauncherPage.tsx` 생성

```
src/pages/LauncherPage/LauncherPage.tsx

레이아웃 구성:
┌─────────────────────────────────────────────────┐
│  data-tauri-drag-region (드래그 영역)            │
│                                                 │
│           DEVORAS 로고 + 슬로건                  │
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │  📁 워크스페이스 열기 (큰 버튼)           │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
│   ── 최근 워크스페이스 ────────────────────────   │
│   │ 📌 MyProject     ~/Desktop/MyProject  2h│   │
│   │    Notes          ~/Documents/Notes   1d│   │
│   │    Archive        ~/Archive          5d│   │
│   │                                     ✕ │   │
│   ──────────────────────────────────────────────   │
│                                                 │
│   ☐ 시작 시 마지막 워크스페이스 자동 열기         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**핵심 렌더링 로직**:
```tsx
// 각 항목의 렌더링
{sortedList.map((item) => (
  <div key={item.path} onClick={() => handleOpen(item.path)}
       className="flex items-center gap-3 px-4 py-3 rounded-lg
                  hover:bg-white/5 cursor-pointer transition-colors group">
    <button onClick={(e) => { e.stopPropagation(); togglePin(item.path); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity">
      {item.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
    </button>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-slate-200 truncate">{item.name}</div>
      <div className="text-xs text-mutedText truncate">{item.path}</div>
    </div>
    <span className="text-xs text-mutedText/60">{formatTimeAgo(item.lastOpened)}</span>
    <button onClick={(e) => { e.stopPropagation(); removeRecent(item.path); }}
            className="opacity-0 group-hover:opacity-100 text-mutedText hover:text-red-400">
      <X size={14} />
    </button>
  </div>
))}
```

**정렬 규칙**: 핀된 항목을 상단에, 그 외는 `lastOpened` 내림차순.

#### Step 3: `App.tsx` 수정 — 조건부 라우팅

```tsx
// src/app/App.tsx 수정

function App() {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);

  useEffect(() => {
    // 최근 워크스페이스 목록 로드 + autoOpenLast 처리
    const init = async () => {
      await useRecentWorkspaceStore.getState().loadFromDisk();
      const { autoOpenLast, recentList } = useRecentWorkspaceStore.getState();
      if (autoOpenLast && recentList.length > 0) {
        // 마지막 워크스페이스 자동 열기 시도
        try {
          await openWorkspaceByPath(recentList[0].path);
        } catch {
          // 폴더가 삭제/이동된 경우 런처로 폴백
        }
      }
      setTimeout(revealWindow, 100);
    };
    init();
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-darkBg text-slate-100 flex flex-col">
      <header ... /> {/* 기존 헤더 유지 */}
      <main className="flex-1 min-h-0 relative">
        {workspacePath ? <WorkspacePage /> : <LauncherPage />}
      </main>
    </div>
  );
}
```

#### Step 4: `workspaceStore.openWorkspace` 연동

기존 `openWorkspace` 호출 성공 시 `useRecentWorkspaceStore.getState().addRecent(path)` 호출을 추가합니다.

```typescript
// src/entities/workspace/model/store.ts — openWorkspace 내부
openWorkspace: async () => {
  const selectedPath = await fileSystemRepository.openDirectory();
  if (selectedPath && selectedPath !== get().workspacePath) {
    set({ isLoading: true, files: [], workspacePath: selectedPath });
    useDocumentStore.getState().resetDocumentState();
    
    // ✅ 최근 워크스페이스에 추가
    useRecentWorkspaceStore.getState().addRecent(selectedPath);
    
    await get().scanWorkspace();
  }
},
```

### 1.6 에지 케이스 처리

| 케이스 | 처리 방법 |
|--------|-----------|
| 최근 목록의 폴더가 삭제/이동됨 | `handleOpen` 시 `readDirectory` 호출. 실패 시 alert("이 폴더를 찾을 수 없습니다. 목록에서 제거하시겠습니까?") → 확인 시 `removeRecent` |
| 첫 실행 (recent_workspaces.json 없음) | `loadFromDisk`의 catch에서 빈 배열 유지. 런처에 "워크스페이스를 열어 시작하세요" 안내 표시 |
| 자동 열기 실패 | 워크스페이스 경로가 유효하지 않으면 `workspacePath`를 `null`로 유지 → 런처 표시 |

### 1.7 검증 체크리스트

- [ ] 첫 실행 시 런처 화면이 표시되는가
- [ ] "워크스페이스 열기" 클릭 시 OS 폴더 선택 다이얼로그가 열리는가
- [ ] 열기 완료 후 `WorkspacePage`로 전환되는가
- [ ] 앱 재실행 시 최근 목록이 유지되는가
- [ ] 핀 토글이 정상 작동하고 상단 정렬되는가
- [ ] 삭제된 폴더 클릭 시 에러 처리되는가
- [ ] `pnpm tsc --noEmit` 통과 (미사용 변수 없음)

---

## Sprint 2: 앱 설정 시스템 (App Settings)

> **참조**: `functions/5_app_settings.md` · 난이도: ★★☆ · 예상 소요: 3~4일
> **선행 조건**: Sprint 1의 저장 인프라(App Data Dir 패턴)

### 2.1 목표

에디터 폰트, 자동 저장, 줄 바꿈, 마인드맵 스타일 등의 설정을 영구 저장하고, 변경 즉시 UI에 실시간 반영합니다.

### 2.2 신규 파일 목록

| 파일 경로 | 역할 |
|-----------|------|
| `src/entities/settings/model/store.ts` | 설정 Zustand Store + 영구 저장 |
| `src/entities/settings/model/types.ts` | 설정 스키마 타입 정의 |
| `src/widgets/SettingsModal/ui/SettingsModal.tsx` | 설정 모달 UI 컴포넌트 |

### 2.3 데이터 모델 설계

```typescript
// src/entities/settings/model/types.ts

export interface EditorSettings {
  fontSize: number;           // 12~24, 기본값 15
  fontFamily: string;         // 기본값 'ui-monospace, monospace'
  autosaveDelay: number;      // ms 단위. 0 = 즉시, 1000~10000, 기본값 3000
  lineWrapping: boolean;      // 기본값 true
}

export interface MindmapSettings {
  edgeStyle: 'bezier' | 'straight' | 'smoothstep';  // 기본값 'bezier'
  nodeColorScheme: 'default' | 'warm' | 'cool' | 'mono';
}

export interface GeneralSettings {
  autoOpenLastWorkspace: boolean;  // 기본값 true (Sprint 1의 autoOpenLast를 여기로 통합)
  language: 'ko' | 'en';          // 기본값 'ko'
}

export interface AppSettings {
  version: 1;  // 스키마 버전 (향후 마이그레이션용)
  editor: EditorSettings;
  mindmap: MindmapSettings;
  general: GeneralSettings;
  /** 현재 활성화된 테마 파일명 (워크스페이스 내 `.devoras/themes/` 기준, null이면 빌트인) */
  activeThemeFile: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  editor: {
    fontSize: 15,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    autosaveDelay: 3000,
    lineWrapping: true,
  },
  mindmap: {
    edgeStyle: 'bezier',
    nodeColorScheme: 'default',
  },
  general: {
    autoOpenLastWorkspace: true,
    language: 'ko',
  },
  activeThemeFile: null,
};
```

> [!IMPORTANT]
> **`version` 필드의 중요성**: `architecture_stages.md`에서 "설정 파일의 스키마 버저닝"을 요구합니다.
> 향후 설정 필드가 추가/변경될 때 `version`을 올리고 마이그레이션 함수를 작성하여 기존 사용자의 `settings.json`을 안전하게 업그레이드합니다.

### 2.4 설정 Store 구현

```typescript
// src/entities/settings/model/store.ts
import { create } from 'zustand';
import { AppSettings, DEFAULT_SETTINGS } from './types';
import { createDebouncedWriter } from '@/shared/lib/debouncedWriter';

interface SettingsState {
  settings: AppSettings;
  isLoaded: boolean;

  // 부분 업데이트 (deep merge)
  updateEditor: (patch: Partial<EditorSettings>) => void;
  updateMindmap: (patch: Partial<MindmapSettings>) => void;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  setActiveThemeFile: (fileName: string | null) => void;
  resetToDefaults: () => void;

  // I/O
  loadSettings: () => Promise<void>;
  _writeSettings: () => Promise<void>;
}

const scheduleSave = createDebouncedWriter(500);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

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
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const dir = await appDataDir();
      const filePath = await join(dir, 'settings.json');
      const text = await readTextFile(filePath);
      const parsed = JSON.parse(text) as Partial<AppSettings>;

      // Deep merge: 새 필드가 추가되어도 기본값으로 폴백
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

  // 실제 디스크 쓰기 (debounce를 거쳐 호출됨)
  _writeSettings: async () => {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true }).catch(() => {});
    const filePath = await join(dir, 'settings.json');
    await writeTextFile(filePath, JSON.stringify(get().settings, null, 2));
  },
}));
```

### 2.5 CodeMirror 실시간 반영 — Compartment 패턴

CodeMirror 6는 `Compartment`을 통해 에디터를 리마운트하지 않고도 설정을 동적으로 교체할 수 있습니다. 이 방식이 **핵심적으로 중요**합니다.

```typescript
// src/widgets/BlockEditor/ui/BlockEditor.tsx (기존 파일 수정)

import { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// 1. 모듈 스코프에 Compartment 인스턴스 생성 (한 번만)
const fontSizeCompartment = new Compartment();
const lineWrapCompartment = new Compartment();

// 2. 에디터 초기 생성 시 Compartment을 Extension으로 등록
const initialExtensions = [
  fontSizeCompartment.of(
    EditorView.theme({ '&': { fontSize: `${settings.editor.fontSize}px` } })
  ),
  lineWrapCompartment.of(
    settings.editor.lineWrapping ? EditorView.lineWrapping : []
  ),
  // ... 기존 Extension들
];

// 3. 설정 변경 시 dispatch로 동적 교체
useEffect(() => {
  if (!editorView) return;
  editorView.dispatch({
    effects: fontSizeCompartment.reconfigure(
      EditorView.theme({ '&': { fontSize: `${settings.editor.fontSize}px` } })
    ),
  });
}, [settings.editor.fontSize]);

useEffect(() => {
  if (!editorView) return;
  editorView.dispatch({
    effects: lineWrapCompartment.reconfigure(
      settings.editor.lineWrapping ? EditorView.lineWrapping : []
    ),
  });
}, [settings.editor.lineWrapping]);
```

> [!WARNING]
> **`editorView`를 직접 재생성하지 마세요!** CodeMirror를 remount하면 스크롤 위치, 커서, undo 히스토리가 모두 사라집니다.
> 반드시 `Compartment.reconfigure()` + `dispatch({ effects })` 패턴을 사용하세요.

> [!IMPORTANT]
> **다중 인스턴스 대응 (2026-08-27 갱신 — `DEBUG_PLAN.md` 편집 표면 상시화)**
>
> 이 절은 "패널당 EditorView 1개"를 전제로 작성되었습니다. **편집 표면 상시화 이후 인스턴스는 블록 수(N)만큼 존재합니다.**
>
> - `lineWrappingCompartment` / `editorThemeCompartment` 는 현재 `BlockEditor.tsx` **모듈 레벨 싱글턴**입니다. `Compartment` 객체 자체는 여러 `EditorState` 에서 재사용해도 무방하지만, **`reconfigure` 이펙트는 뷰마다 개별 dispatch 해야 합니다.**
> - 따라서 설정 변경 1회 = **N회 dispatch** 입니다. 블록이 많은 문서에서 폰트 크기 슬라이더를 드래그하면 프레임 드랍이 발생할 수 있으므로, **설정 변경에 디바운스를 걸거나 가상화 윈도 내 인스턴스에만 즉시 적용**하고 나머지는 마운트 시점에 반영하는 전략을 검토하세요.
> - 언마운트된(가상화로 내려간) 블록은 마운트 시 **최신 설정으로 `EditorState.create`** 되므로 별도 동기화가 필요 없습니다.

### 2.6 설정 모달 UI 구성

```
┌──────────────────────────────────────────────────────┐
│ ⚙️ 설정                                        ✕   │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ 에디터   │  폰트 크기     [━━━━━○━━━] 15px          │
│          │  폰트          [JetBrains Mono       ▾]  │
│ 마인드맵 │  자동 저장     [━━○━━━━━━] 3초           │
│          │  줄 바꿈       [■ 활성화됨]               │
│ 일반     │                                           │
│          │  ─────────────────────────────────────     │
│          │  [↺ 기본값으로 초기화]                     │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

**카테고리 탭**: 좌측 사이드에 `에디터`, `마인드맵`, `일반` 세 카테고리 배치.

**입력 컨트롤별 컴포넌트**:
- 슬라이더: `<input type="range" min={12} max={24} step={1} />` + 실시간 수치 표시
- 드롭다운: `<select>` + Tailwind 스타일링
- 토글 스위치: 커스텀 `<button>` + `bg-primary` 전환 애니메이션

**트리거 방식**: `WorkspacePage.tsx`의 헤더 영역에 `⚙️` 아이콘 버튼 추가, 클릭 시 모달 오버레이.

### 2.7 기존 `documentStore.fontSize` 마이그레이션

현재 `documentStore`에 있는 `fontSize`와 `adjustFontSize`를 `settingsStore`로 이관합니다.

```diff
// src/entities/document/model/store.ts
- fontSize: number;
- adjustFontSize: (delta: number) => void;

// 대신 사용처에서:
// const fontSize = useSettingsStore((s) => s.settings.editor.fontSize);
```

> [!CAUTION]
> **파괴적 변경**: `useDocumentStore`를 구독하던 컴포넌트에서 `fontSize`를 참조하는 곳을 전부 `useSettingsStore`로 교체해야 합니다.
> `grep -r 'fontSize' src/` 로 모든 사용처를 찾아 일괄 교체하세요.

### 2.8 검증 체크리스트

- [ ] 설정 모달이 열리고 닫히는가
- [ ] 폰트 크기 슬라이더 조작 시 에디터 폰트가 즉시 변경되는가 (리마운트 없이)
- [ ] 줄 바꿈 토글 시 에디터가 즉시 반영하는가
- [ ] 앱 재실행 후 설정이 유지되는가
- [ ] `settings.json`이 손상되었을 때 기본값으로 폴백하는가
- [ ] "기본값으로 초기화" 버튼이 정상 동작하는가
- [ ] `pnpm tsc --noEmit` 통과 (미사용 변수 없음)

---

## Sprint 3: YAML 커스텀 테마 및 다크/라이트 모드

> **참조**: `functions/6_theme_yaml_custom.md` · 난이도: ★★☆ · 예상 소요: 3~4일
> **선행 조건**: Sprint 2 (설정 스토어에 `activeThemeFile` 저장)

> ### ➕ 편입 (2026-09-02, 사용자 결정 D-4) — **R-6 / `BUG-20260831-02` StyleModule 누수**
>
> `@codemirror/view` 의 `EditorView.theme()` 은 **호출마다** 새 `StyleModule` 을 만들고
> `EditorView.destroy()` 에 제거 경로가 없다. `BlockEditor.tsx:229` 가 이를 **EditorView 생성 이펙트
> 안**에서 호출하므로 **블록 하나당 StyleModule 하나**가 생겨 단조 증가한다(인스턴스당 `<style>` +525자,
> 파괴 후에도 감소 없음, 360 사이클까지 확인). 마운트 절대 비용도 **약 50%** 올린다.
>
> **이 Sprint 가 그 해법을 이미 짓는다.** `createEditorTheme()` 의 설정 의존값은
> **`fontFamily` · `fontSize` 둘뿐**이므로(`BlockEditor.tsx:86-105`), 아래 §3.4 의 CSS 변수 토큰에
> 그 둘을 포함시키면 **테마 자체가 모듈 레벨 상수가 된다.** 부수 효과로 `BlockEditor.tsx:144` 의
> 설정 변경 `reconfigure` 경로까지 불필요해진다.
>
> **DoD 에 추가할 것**:
> - [ ] N 개 블록 마운트 후 `<style>` 총 바이트가 N 에 비례해 증가하지 않는다
> - [ ] create-destroy 반복 후 `<style>` 바이트가 증가하지 않는다
> - [ ] 폰트 크기·패밀리 변경이 여전히 실시간 반영된다 (회귀 0건)
>
> 티켓: [`ticket/debug/20260831_2030_stylemodule_leak_per_editorview.yml`](ticket/debug/20260831_2030_stylemodule_leak_per_editorview.yml)

### 3.1 목표

CSS 변수 기반 디자인 토큰 시스템을 도입하여 **다크/라이트 모드 원클릭 전환**, **워크스페이스별 다중 YAML 테마 관리**, **테마 선택 영구 저장**을 지원합니다.

**테마 저장 위치 결정**: 테마 파일은 **워크스페이스 내 `.devoras/themes/`**에 위치합니다.
- Git으로 팀원과 테마 공유 가능
- 워크스페이스마다 다른 테마 사용 가능
- `settings.json`(전역)에는 "어떤 테마 파일을 쓰는지(`activeThemeFile: 'tokyonight.yml'`)"만 저장
- 워크스페이스 없을 때는 빌트인 다크/라이트 테마 사용

### 3.2 신규 파일 목록

| 파일 경로 | 역할 |
|-----------|------|
| `src/entities/theme/model/store.ts` | 테마 Zustand Store (테마 목록 스캔 + 적용) |
| `src/entities/theme/model/types.ts` | ThemeTokens 타입 + 빌트인 다크/라이트 프리셋 |
| `src/entities/theme/lib/parser.ts` | YAML → ThemeTokens 파서 (`mode` 필드 처리) |
| `src/entities/theme/lib/injector.ts` | CSS 변수 주입 유틸리티 |

### 3.3 새 의존성 추가

```bash
pnpm add js-yaml
pnpm add -D @types/js-yaml
```

### 3.4 디자인 토큰 스키마

```typescript
// src/entities/theme/model/types.ts

/** YAML 파일에서 선언하는 기반 모드. 빌트인 토큰을 베이스로 삼습니다. */
export type ThemeBaseMode = 'dark' | 'light';

export interface ThemeTokens {
  // 배경
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;

  // 테두리
  borderDefault: string;
  borderActive: string;

  // 텍스트
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // 강조
  accentPrimary: string;
  accentSecondary: string;

  // 에디터 전용
  editorBg: string;
  editorCursor: string;
  editorSelection: string;

  // 마인드맵 노드
  nodeLevel1: string;
  nodeLevel2: string;
  nodeLevel3: string;
  nodeLevel4: string;
}

// 빌트인 다크 테마 (현재 앱의 하드코딩 값을 추출)
export const DARK_TOKENS: ThemeTokens = {
  bgPrimary: '#0d0e12',
  bgSecondary: '#161821',
  bgTertiary: '#1e2028',
  borderDefault: '#272a37',
  borderActive: '#6366f1',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  accentPrimary: '#6366f1',
  accentSecondary: '#14b8a6',
  editorBg: '#0d0e12',
  editorCursor: '#6366f1',
  editorSelection: 'rgba(99,102,241,0.2)',
  nodeLevel1: '#818cf8',
  nodeLevel2: '#34d399',
  nodeLevel3: '#fbbf24',
  nodeLevel4: '#f87171',
};

// 빌트인 라이트 테마
export const LIGHT_TOKENS: ThemeTokens = {
  bgPrimary: '#ffffff',
  bgSecondary: '#f8fafc',
  bgTertiary: '#f1f5f9',
  borderDefault: '#e2e8f0',
  borderActive: '#6366f1',
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  accentPrimary: '#4f46e5',
  accentSecondary: '#0d9488',
  editorBg: '#ffffff',
  editorCursor: '#4f46e5',
  editorSelection: 'rgba(79,70,229,0.15)',
  nodeLevel1: '#6366f1',
  nodeLevel2: '#059669',
  nodeLevel3: '#d97706',
  nodeLevel4: '#dc2626',
};

/** 스캔된 YAML 테마 파일의 메타데이터 */
export interface ThemeFileInfo {
  fileName: string;     // 'tokyonight.yml'
  displayName: string;  // YAML의 name 필드, 없으면 파일명
  baseMode: ThemeBaseMode;
}
```

### 3.5 YAML 테마 파일 스키마

**YAML 필드 설명**:
- `mode`: **필수**. `dark` 또는 `light`. 누락된 토큰을 어떤 빌트인 프리셋으로 채울지 결정합니다.
- `name`: 선택. UI에서 표시할 테마 이름.
- 나머지 필드: 모두 선택. 미입력 시 `mode`의 기본값으로 폴백.

```yaml
# .devoras/themes/tokyonight.yml
name: Tokyo Night
mode: dark          # ← 필수: 'dark' | 'light'

bgPrimary: '#1a1b26'
bgSecondary: '#24283b'
bgTertiary: '#292e42'
borderDefault: '#3b4261'
accentPrimary: '#7aa2f7'
accentSecondary: '#9ece6a'
textPrimary: '#c0caf5'
textSecondary: '#a9b1d6'
textMuted: '#565f89'
editorBg: '#1a1b26'
editorCursor: '#7aa2f7'
editorSelection: 'rgba(122,162,247,0.2)'
```

```yaml
# .devoras/themes/solarized-light.yml
name: Solarized Light
mode: light          # ← 라이트 모드 베이스

bgPrimary: '#fdf6e3'
bgSecondary: '#eee8d5'
accentPrimary: '#268bd2'
textPrimary: '#657b83'
# 나머지 미입력 → LIGHT_TOKENS 기본값으로 자동 채움
```

### 3.6 YAML 파서

```typescript
// src/entities/theme/lib/parser.ts
import yaml from 'js-yaml';
import { ThemeTokens, ThemeBaseMode, DARK_TOKENS, LIGHT_TOKENS, ThemeFileInfo } from '../model/types';

interface RawThemeYaml extends Partial<ThemeTokens> {
  mode?: ThemeBaseMode;
  name?: string;
}

/**
 * YAML 내용을 파싱하여 ThemeTokens를 반환합니다.
 * mode: 'dark'이면 DARK_TOKENS를 베이스로, 'light'이면 LIGHT_TOKENS를 베이스로 삼아
 * YAML에서 제공된 값을 덮어씁니다.
 */
export function parseThemeYaml(yamlContent: string): {
  tokens: ThemeTokens;
  info: Pick<ThemeFileInfo, 'displayName' | 'baseMode'>;
} {
  try {
    const parsed = yaml.load(yamlContent) as RawThemeYaml;
    const baseMode: ThemeBaseMode = parsed.mode === 'light' ? 'light' : 'dark';
    const baseTokens = baseMode === 'light' ? LIGHT_TOKENS : DARK_TOKENS;

    const { mode: _mode, name: _name, ...tokenOverrides } = parsed;

    return {
      tokens: { ...baseTokens, ...tokenOverrides },
      info: {
        displayName: parsed.name ?? '사용자 정의 테마',
        baseMode,
      },
    };
  } catch (err) {
    console.error('[ThemeParser] YAML 파싱 실패:', err);
    return {
      tokens: DARK_TOKENS,
      info: { displayName: '오류 테마', baseMode: 'dark' },
    };
  }
}
```

### 3.7 테마 Store

```typescript
// src/entities/theme/model/store.ts
import { create } from 'zustand';
import { ThemeTokens, ThemeFileInfo, DARK_TOKENS, LIGHT_TOKENS } from './types';
import { injectThemeTokens } from '../lib/injector';
import { parseThemeYaml } from '../lib/parser';

interface ThemeState {
  /** 현재 적용된 토큰 */
  activeTokens: ThemeTokens;
  /** 워크스페이스 내 스캔된 테마 파일 목록 */
  availableThemes: ThemeFileInfo[];
  /** 현재 선택된 파일명 (null = 빌트인) */
  activeThemeFile: string | null;

  // 빌트인 전환
  applyBuiltinDark: () => void;
  applyBuiltinLight: () => void;

  // 워크스페이스 테마 관리
  scanThemes: (workspacePath: string) => Promise<void>;
  applyThemeFile: (workspacePath: string, fileName: string) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  activeTokens: DARK_TOKENS,
  availableThemes: [],
  activeThemeFile: null,

  applyBuiltinDark: () => {
    injectThemeTokens(DARK_TOKENS);
    document.documentElement.setAttribute('data-theme', 'dark');
    set({ activeTokens: DARK_TOKENS, activeThemeFile: null });
    useSettingsStore.getState().setActiveThemeFile(null);
  },

  applyBuiltinLight: () => {
    injectThemeTokens(LIGHT_TOKENS);
    document.documentElement.setAttribute('data-theme', 'light');
    set({ activeTokens: LIGHT_TOKENS, activeThemeFile: null });
    useSettingsStore.getState().setActiveThemeFile(null);
  },

  scanThemes: async (workspacePath: string) => {
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');
      const themesDir = await join(workspacePath, '.devoras', 'themes');

      const entries = await readDir(themesDir).catch(() => []);
      const infos: ThemeFileInfo[] = [];

      for (const entry of entries) {
        if (!entry.name?.endsWith('.yml') && !entry.name?.endsWith('.yaml')) continue;
        try {
          const { readTextFile } = await import('@tauri-apps/plugin-fs');
          const content = await readTextFile(await join(themesDir, entry.name));
          const { info } = parseThemeYaml(content);
          infos.push({ fileName: entry.name, ...info });
        } catch {
          // 파싱 실패한 파일은 목록에서 제외
        }
      }

      set({ availableThemes: infos });
    } catch {
      set({ availableThemes: [] });
    }
  },

  applyThemeFile: async (workspacePath: string, fileName: string) => {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');
      const filePath = await join(workspacePath, '.devoras', 'themes', fileName);
      const content = await readTextFile(filePath);
      const { tokens, info } = parseThemeYaml(content);

      injectThemeTokens(tokens);
      document.documentElement.setAttribute('data-theme', info.baseMode);
      set({ activeTokens: tokens, activeThemeFile: fileName });
      useSettingsStore.getState().setActiveThemeFile(fileName);
    } catch (err) {
      console.error('[ThemeStore] 테마 파일 적용 실패:', err);
    }
  },
}));
```

### 3.8 CSS 변수 주입

```typescript
// src/entities/theme/lib/injector.ts
import { ThemeTokens } from '../model/types';

const TOKEN_TO_CSS: Record<keyof ThemeTokens, string> = {
  bgPrimary: '--bg-primary',
  bgSecondary: '--bg-secondary',
  bgTertiary: '--bg-tertiary',
  borderDefault: '--border-default',
  borderActive: '--border-active',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  accentPrimary: '--accent-primary',
  accentSecondary: '--accent-secondary',
  editorBg: '--editor-bg',
  editorCursor: '--editor-cursor',
  editorSelection: '--editor-selection',
  nodeLevel1: '--node-level-1',
  nodeLevel2: '--node-level-2',
  nodeLevel3: '--node-level-3',
  nodeLevel4: '--node-level-4',
};

export function injectThemeTokens(tokens: ThemeTokens): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS)) {
    root.style.setProperty(cssVar, tokens[key as keyof ThemeTokens]);
  }
}
```

### 3.9 Tailwind 연동

```javascript
// tailwind.config.js 수정
colors: {
  darkBg:     'var(--bg-primary)',
  darkPanel:  'var(--bg-secondary)',
  darkHover:  'var(--bg-tertiary)',
  darkBorder: 'var(--border-default)',
  primary:    'var(--accent-primary)',
  accent:     'var(--accent-secondary)',
  mutedText:  'var(--text-muted)',
},
```

> [!WARNING]
> **Tailwind의 opacity modifier와 CSS 변수**: `bg-primary/50` 같은 Tailwind 문법은 hex 값에서만 정상 동작합니다.
> CSS 변수를 사용하면 `bg-[var(--accent-primary)]/50`이 작동하지 않을 수 있습니다.
> **해결책**: opacity가 필요한 곳에서는 `bg-[var(--accent-primary)]` + `opacity-50` 클래스를 분리하거나, Tailwind 대신 인라인 `style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 50%, transparent)' }}`를 사용하세요.

### 3.10 테마 선택 UI

```
설정 모달 > 일반 탭:

  테마
  ┌───────────────────────────────────────────────────┐
  │  빌트인                                           │
  │  [● 다크 (기본)]  [  라이트  ]                    │
  │                                                   │
  │  워크스페이스 테마 (.devoras/themes/)              │
  │  ┌─────────────────────────────────────────────┐  │
  │  │ 🌙 Tokyo Night            dark  [적용]       │  │
  │  │ ☀️ Solarized Light        light [적용]       │  │
  │  │ + 새 테마 파일 만들기                         │  │
  │  └─────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────┘
```

"+ 새 테마 파일 만들기"는 `.devoras/themes/my-theme.yml` 파일을 빌트인 다크 YAML 내용으로 생성하고 파일 탐색기에서 열어줍니다.

### 3.11 App 초기화 흐름

```typescript
// App.tsx 또는 WorkspacePage.tsx — 워크스페이스 로드 시

useEffect(() => {
  if (!workspacePath) return;

  const themeStore = useThemeStore.getState();
  const settingsStore = useSettingsStore.getState();

  // 1. 워크스페이스 내 테마 파일 목록 스캔
  themeStore.scanThemes(workspacePath);

  // 2. 마지막으로 사용한 테마 복원
  const { activeThemeFile } = settingsStore.settings;
  if (activeThemeFile) {
    themeStore.applyThemeFile(workspacePath, activeThemeFile);
  }
  // null이면 빌트인 다크 유지 (이미 기본 적용 상태)
}, [workspacePath]);
```

### 3.12 index.css 마이그레이션 순서

1. `index.css`의 `@layer base`에서 `bg-[#0d0e12]` → `bg-[var(--bg-primary)]`로 교체
2. `erd.css`의 `:root` 하드코딩 변수를 ThemeTokens와 통합 (중복 제거)
3. 모든 컴포넌트의 하드코딩 hex를 Tailwind 변수명 또는 CSS 변수로 교체
4. `body`에 `transition: background-color 0.2s, color 0.2s` 추가 (전환 시 깜빡임 방지)
5. `data-theme="light"` 시 스크롤바, 코드블록 등 별도 스타일 오버라이드 필요 항목을 `[data-theme="light"] .xxx` 선택자로 추가

### 3.13 검증 체크리스트

- [ ] 다크 ↔ 라이트 빌트인 전환이 즉시 부드럽게 동작하는가
- [ ] `.devoras/themes/` 에 YAML 파일 추가 후 설정 모달에 목록이 표시되는가
- [ ] YAML 파일의 `mode: dark` / `mode: light` 에 따라 올바른 베이스 토큰이 사용되는가
- [ ] 누락된 토큰이 있는 부분 YAML도 안전하게 폴백되는가
- [ ] 잘못된 YAML 파일 선택 시 에러 표시 후 이전 테마 유지되는가
- [ ] 앱 재실행 후 마지막 테마 선택이 복원되는가
- [ ] 워크스페이스 변경 시 새 워크스페이스의 테마 목록으로 갱신되는가
- [ ] `pnpm tsc --noEmit` 통과

---

## Sprint 4A: 검색 시스템 (전역 검색 + 파일 내 검색)

> **⚠️ 이 절은 두 벌 중 「첫 번째 벌」이다 (2026-09-04 계획 세션 추가).**
>
> 같은 번호(`### 4A.2`~`### 4A.8`)의 **두 번째 사양이 이 문서 아래쪽에 또 있다.** 기존 경고는
> 두 번째 벌이 시작하는 지점에만 붙어 있어서, **이 문서를 위에서부터 읽는 사람에게는 보이지 않았다.**
> 그 경고를 여기로 끌어올린다.
>
> - **두 벌은 같지 않다.** 어느 한쪽을 기계적으로 지우면 내용이 소실된다
> - 두 번째 벌에만 있는 것: **「아키텍처 결정: Rust vs JS」**
> - **해소는 사용자 판단 대기 중이다.** 그 전까지 이 절을 근거로 사양을 쓸 때는
>   **반드시 두 벌을 모두 읽고 어느 쪽을 채택했는지 명시할 것**
>
> 상세 비교는 두 번째 벌 시작 지점의 원 경고를 참고한다.


> **참조**: `functions/4_global_search.md` · 난이도: ★★★ · 예상 소요: 4~5일
> **선행 조건**: Sprint 2 (설정에서 검색 관련 옵션 저장)

### 4A.1 목표 및 검색 범위 분리

두 종류의 검색을 **완전히 분리**하여 구현합니다. 이는 UX 관례(VS Code, Obsidian)와 일치하고, 각각의 성격이 다르기 때문입니다.

| | 전역 검색 | 파일 내 검색 |
|---|---|---|
| **단축키** | `Cmd+Shift+F` | `Cmd+F` |
| **범위** | 워크스페이스 전체 파일 | 현재 활성 에디터 |
| **데이터 소스** | 디스크 (저장된 파일) + 인메모리 dirty 탭 병합 | 에디터 CodeMirror 상태 (인메모리) |
| **검색 엔진** | Rust `devoras_search_workspace` IPC | CodeMirror `SearchCursor` API |
| **UI 위치** | 좌측 사이드바 패널 또는 상단 모달 | 에디터 내 인라인 바 (상단 고정) |
| **미저장 반영** | dirty 탭만 JS에서 병합 | 항상 최신 인메모리 반영 |

> [!IMPORTANT]
> **`architecture_stages.md` 준수**: Stage 2에서 "파일 검색 인덱싱을 Rust로 구현"이 명시되어 있습니다.
> 전역 검색의 디스크 부분을 Rust로 구현하면 Stage 2 진입 비용을 크게 절감합니다.

### 4A.2 신규 파일 목록

| 파일 경로 | 역할 |
|-----------|------|
| `src-tauri/src/search.rs` | Rust 네이티브 전역 파일 검색 엔진 |
| `src/features/globalSearch/model/store.ts` | 전역 검색 Zustand Store |
| `src/features/globalSearch/model/types.ts` | SearchResult 타입 |
| `src/widgets/GlobalSearch/ui/GlobalSearch.tsx` | 전역 검색 패널 UI |
| `src/features/inFileSearch/ui/InFileSearchBar.tsx` | 파일 내 검색 인라인 바 UI |

### 4A.3 전역 검색 — Rust 검색 엔진 (BufReader 기반)

> **⛔ D9 정정 (2026-09-04, `PM-20260904-01` §scope_revision_r5_r6) — 이 절의 Rust 기본 설계는 뒤집혔다.**
>
> **R6(전역 검색)은 JS 우선으로 짓는다. Rust 이관은 실측으로 성능이 문제가 될 때 한다.**
>
> 근거: Rust 검색은 `architecture_stages.md:81` **Stage 2(Tier 1)** 항목이고 **출시 후로 미뤄져 있다.**
> 전역 검색을 Rust 로 지으면 **Stage 2 를 출시 앞으로 당기는 것**이다.
> 그리고 이 절의 1번 이유(「JS 로 수백 개 파일을 읽으면 UI 스레드가 멈춤」)는 **재지 않은 성능 우려**다 —
> **A6 선례를 반복하지 않는다**(재지 않은 성능 우려로 아키텍처를 먼저 골랐고, 실측에서 예산 대비
> 27배 여유가 나왔다. `DEBUG_PLAN.md` §5.11).

> **주의**: 이 절은 **사양 두 벌 중 첫 번째 벌**에 속한다. 두 번째 벌의 `4A.3`(아키텍처 결정)·`4A.4`(Rust 구현)에도 같은 정정이 붙어 있다.

**새 의존성 (Cargo.toml)**:
```toml
ignore = "0.4"    # .gitignore 존중 + 재귀 파일 워킹
```

```rust
// src-tauri/src/search.rs

use serde::Serialize;
use ignore::WalkBuilder;
use std::io::{BufRead, BufReader};

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub file_path: String,
    pub file_name: String,
    pub line: usize,        // 1-indexed (파일명 매칭은 0)
    pub column: usize,      // 0-indexed
    pub context_text: String,
    pub match_type: String, // "filename" | "content"
}

#[tauri::command]
pub async fn devoras_search_workspace(
    workspace_path: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }

    let max = max_results.unwrap_or(200);
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    let walker = WalkBuilder::new(&workspace_path)
        .hidden(true)        // '.'으로 시작하는 파일/폴더 건너뜀
        .git_ignore(true)    // .gitignore 존중
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            name != "node_modules" && name != ".git" && name != ".devoras"
        })
        .build();

    'outer: for entry in walker.flatten() {
        if results.len() >= max { break; }

        let path = entry.path();
        if !path.is_file() { continue; }

        let file_name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // 1. 파일명 매칭
        if file_name.to_lowercase().contains(&query_lower) {
            results.push(SearchResult {
                file_path: path.to_string_lossy().to_string(),
                file_name: file_name.clone(),
                line: 0,
                column: 0,
                context_text: String::new(),
                match_type: "filename".to_string(),
            });
        }

        // 2. 본문 매칭 — BufReader로 스트리밍 읽기
        let ext = path.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        if !matches!(ext.as_str(), "md" | "txt" | "erd" | "json" | "yml" | "yaml") {
            continue;
        }

        let file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let reader = BufReader::new(file);
        for (line_idx, line_result) in reader.lines().enumerate() {
            if results.len() >= max { break 'outer; }

            // 읽기 실패 = 바이너리 파일 → 이 파일 건너뜀
            let line = match line_result {
                Ok(l) => l,
                Err(_) => break,
            };

            if let Some(col) = line.to_lowercase().find(&query_lower) {
                results.push(SearchResult {
                    file_path: path.to_string_lossy().to_string(),
                    file_name: file_name.clone(),
                    line: line_idx + 1,
                    column: col,
                    context_text: line,
                    match_type: "content".to_string(),
                });
            }
        }
    }

    Ok(results)
}
```

> [!TIP]
> **BufReader를 쓰는 이유**: `read_to_string`은 전체 파일을 힙에 올립니다. BufReader + `lines()`는 라인 단위로 스트리밍하므로 메모리 사용이 일정합니다. 또한 `max` 도달 시 루프를 즉시 탈출(`break 'outer`)하여 불필요한 I/O를 건너뜁니다. 바이너리 파일은 UTF-8 파싱 실패 시 `Err(_)` → `break`로 자동 건너뜁니다.

**`lib.rs` 등록**:
```rust
mod search;

.invoke_handler(tauri::generate_handler![
    devoras_image_save, devoras_set_workspace_root, show_main_window, close_splashscreen,
    search::devoras_search_workspace,  // ✅ 추가
])
```

### 4A.4 전역 검색 Store (dirty 탭 병합 포함)

```typescript
// src/features/globalSearch/model/types.ts

export interface SearchResult {
  filePath: string;
  fileName: string;
  line: number;
  column: number;
  contextText: string;
  matchType: 'filename' | 'content';
  isUnsaved?: boolean;  // dirty 탭에서 온 인메모리 결과
}
```

```typescript
// src/features/globalSearch/model/store.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { SearchResult } from './types';
import { useDocumentStore } from '@/entities/document/model/store';

interface GlobalSearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  isOpen: boolean;

  setQuery: (query: string) => void;
  executeSearch: (workspacePath: string) => Promise<void>;
  toggleOpen: () => void;
  close: () => void;
}

export const useGlobalSearchStore = create<GlobalSearchState>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  isOpen: false,

  setQuery: (query) => set({ query }),

  executeSearch: async (workspacePath: string) => {
    const { query } = get();
    if (!query.trim()) {
      set({ results: [] });
      return;
    }

    set({ isSearching: true });
    const queryLower = query.trim().toLowerCase();

    try {
      // ── 1단계: Rust 디스크 검색 ──────────────────────────────
      const rawResults = await invoke<any[]>('devoras_search_workspace', {
        workspacePath,
        query: query.trim(),
        maxResults: 200,
      });

      const diskResults: SearchResult[] = rawResults.map((r) => ({
        filePath: r.file_path,
        fileName: r.file_name,
        line: r.line,
        column: r.column,
        contextText: r.context_text,
        matchType: r.match_type,
        isUnsaved: false,
      }));

      // ── 2단계: 인메모리 dirty 탭 검색 ──────────────────────────
      // 아직 저장되지 않은 변경사항은 Rust가 볼 수 없으므로 JS에서 처리
      const { panes } = useDocumentStore.getState();
      const memoryResults: SearchResult[] = [];

      for (const pane of panes) {
        for (const tab of pane.tabs) {
          // dirty이고 캐시에 텍스트가 있는 탭만 대상
          if (!tab.isDirty || !tab.cache?.rawContent) continue;

          const lines = tab.cache.rawContent.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const col = lines[i].toLowerCase().indexOf(queryLower);
            if (col >= 0) {
              memoryResults.push({
                filePath: tab.filePath ?? tab.id,
                fileName: tab.title,
                line: i + 1,
                column: col,
                contextText: lines[i],
                matchType: 'content',
                isUnsaved: true,  // UI에서 "(미저장)" 뱃지 표시
              });
            }
          }
        }
      }

      // ── 3단계: 병합 — 같은 파일+라인이 disk에도 있으면 인메모리 버전으로 교체 ──
      const diskDeduped = diskResults.filter(
        (dr) =>
          !memoryResults.some(
            (mr) => mr.filePath === dr.filePath && mr.line === dr.line
          )
      );

      set({ results: [...memoryResults, ...diskDeduped] });
    } catch (err) {
      console.error('[GlobalSearch] 검색 실패:', err);
      set({ results: [] });
    } finally {
      set({ isSearching: false });
    }
  },

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false, query: '', results: [] }),
}));
```

### 4A.5 파일 내 검색 — CodeMirror SearchCursor

> [!CAUTION]
> **설계 결함 정정 (2026-08-27)**
>
> 아래 코드는 `view.state.doc` 이 **문서 전체**를 담는다고 가정하지만, Devoras 의 `BlockEditor` 는 문서를 **블록 단위로 분할**하므로 각 `EditorView` 는 **블록 하나의 텍스트만** 보유합니다. 즉 이 구현은 **현재 아키텍처에서 이미 오작동**합니다(포커스된 블록 하나만 검색됨). 편집 표면 상시화 이후에는 인스턴스가 N개가 되어 문제가 더 명확해질 뿐, 새로 생기는 결함이 아닙니다.
>
> **올바른 설계 — 검색은 뷰가 아니라 모델 위에서 수행한다:**
>
> 1. `useBlockStore.getState().getMergedContent()` 로 **문서 전체 문자열**을 얻는다 (저장 여부와 무관한 인메모리 상태라는 원래 요구사항을 그대로 만족).
> 2. 그 위에서 매칭을 수집하고, 각 히트의 절대 오프셋을 **`(blockId, blockOffset)`** 으로 변환한다. `flattenTree` 순회로 누적 길이를 더해가며 매핑하며, 블록 경계의 `\n` 1자를 반드시 계상할 것 (`getMergedContent` 가 `join('\n')` 이므로).
> 3. 점프 시 **해당 블록의 `EditorView` 를 레지스트리에서 조회**(§4A.6)하여 그 뷰에만 `dispatch` 한다. 블록이 가상화로 언마운트된 상태면 **먼저 스크롤하여 마운트시킨 뒤** dispatch 한다.
> 4. `scrollIntoView: true` 는 이 경로에서는 **의도된 동작**이다(검색 점프는 사용자가 요청한 이동). BUG-20260827-13 의 클릭 경로와 혼동하지 말 것.
>
> 아래 코드는 **단일 뷰 전제의 참고용**으로만 남겨둡니다. 그대로 구현하지 마세요.

파일 내 검색(`Cmd+F`)은 **저장 여부와 무관하게** 에디터의 현재 인메모리 상태를 검색합니다. CodeMirror의 내장 `SearchCursor`를 사용합니다.

```typescript
// src/features/inFileSearch/ui/InFileSearchBar.tsx

import { SearchCursor } from '@codemirror/search';
import { getActiveEditorView } from '@/shared/lib/editorViewRegistry';

function InFileSearchBar() {
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);

  const doSearch = (q: string) => {
    const view = getActiveEditorView();
    if (!view || !q) return;

    const cursor = new SearchCursor(view.state.doc, q);
    let count = 0;
    while (!cursor.next().done) count++;
    setMatchCount(count);

    // 첫 번째 매칭으로 스크롤
    navigateToMatch(view, q, 0);
  };

  const navigateToMatch = (view: EditorView, q: string, targetIndex: number) => {
    const cursor = new SearchCursor(view.state.doc, q);
    let i = 0;
    while (!cursor.next().done) {
      if (i === targetIndex) {
        view.dispatch({
          selection: { anchor: cursor.value.from, head: cursor.value.to },
          scrollIntoView: true,
        });
        break;
      }
      i++;
    }
  };

  // ...렌더링: 입력, n건 중 m번째, ▲▼ 네비게이션, ✕ 닫기
}
```

**단축키 처리**:
```typescript
// WorkspacePage.tsx
if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
  e.preventDefault();
  useGlobalSearchStore.getState().toggleOpen();  // 전역 검색
}
if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
  e.preventDefault();
  setIsInFileSearchOpen(true);  // 파일 내 검색
}
```

### 4A.6 EditorViewRegistry (Sprint 4B 선행 인프라) — **✅ 이미 구현됨 (2026-08-30 확인)**

> [!NOTE]
> **본 절은 계획이 아니라 기존 구현의 설명으로 읽을 것.** `project/src/shared/lib/editorViewRegistry.ts` 가 **디버깅 사이클 중 이미 착지했다**(편집 표면 상시화 / Option B). 아래 「키 구조 변경」 경고대로 **패널당 N개** 형태로 구현돼 있으며, 부수적으로 `code_review.md` §P1-6(전역 활성 뷰 null 처리)을 구조적으로 소멸시켰다.
> Sprint 4B 착수 시 **새로 만들지 말고 기존 구현을 확인**할 것.

> [!IMPORTANT]
> **키 구조 변경 (2026-08-27 — `DEBUG_PLAN.md` §5 E3 과 동일 지점)**
>
> 아래 설계는 `paneId → EditorView` 로 **패널당 1개**를 전제합니다. 편집 표면 상시화 이후에는 **패널당 N개(블록 수)** 가 되므로 키를 확장해야 합니다.
>
> ```typescript
> // 레지스트리 키: `${paneId}::${blockId}`
> const registry = new Map<string, EditorView>();
> // 캐럿을 보유한 블록을 패널별로 별도 추적 (렌더링 트리거가 아닌 파생 상태)
> const caretHolder = new Map<string, string>();  // paneId -> blockId
>
> export function getActiveEditorView(): EditorView | null {
>   const { activePaneId } = useDocumentStore.getState();
>   const blockId = caretHolder.get(activePaneId);
>   return blockId ? registry.get(`${activePaneId}::${blockId}`) ?? null : null;
> }
> export function getEditorViewForBlock(paneId: string, blockId: string): EditorView | null {
>   return registry.get(`${paneId}::${blockId}`) ?? null;
> }
> ```
>
> - 등록/해제는 `BlockEditor` 가 아니라 **`CodeMirrorBlock` 의 마운트/언마운트**에서 수행합니다. 가상화로 블록이 내려가면 자동으로 해제되어야 합니다.
> - `caretHolder` 는 `updateListener` 의 `focusChanged` 에서 갱신합니다. **이 값이 렌더링을 트리거해서는 안 됩니다** — 트리거화가 곧 BUG-20260827-13 의 재발입니다.
> - 이 전환으로 기존 **BUG-20260826-10**(언마운트 시 전역 활성 뷰가 무조건 `null` 이 되는 결함)은 **구조적으로 소멸**합니다. 해당 티켓은 본 작업에 흡수됩니다.
> - `shared/lib/activeEditorView.ts` 의 단일 싱글턴은 이 레지스트리로 **대체 후 삭제**합니다.

전역 검색 결과 점프와 파일 내 검색 모두 "어느 패널의 에디터에 dispatch할 것인가"를 알아야 합니다. 현재 `getActiveEditorView()`는 단일 전역 참조이므로 멀티 패널 환경에서 부정확합니다.

```typescript
// src/shared/lib/editorViewRegistry.ts
import { EditorView } from '@codemirror/view';
import { useDocumentStore } from '@/entities/document/model/store';

const registry = new Map<string, EditorView>();

/** BlockEditor 마운트 시 호출 */
export function registerEditorView(paneId: string, view: EditorView): void {
  registry.set(paneId, view);
}

/** BlockEditor 언마운트 시 반드시 호출 */
export function unregisterEditorView(paneId: string): void {
  registry.delete(paneId);
}

/** 특정 paneId의 EditorView 반환 */
export function getEditorView(paneId: string): EditorView | null {
  return registry.get(paneId) ?? null;
}

/** 현재 활성 패널의 EditorView 반환 */
export function getActiveEditorView(): EditorView | null {
  const { activePaneId } = useDocumentStore.getState();
  return registry.get(activePaneId) ?? null;
}
```

**BlockEditor에서 등록**:
```typescript
// BlockEditor.tsx

useEffect(() => {
  if (!editorView || !paneId) return;
  registerEditorView(paneId, editorView);
  return () => unregisterEditorView(paneId);
}, [editorView, paneId]);
```

> [!NOTE]
> `BlockEditor`가 `paneId` prop을 받아야 합니다. `WorkspacePage`의 `PaneContainer`에서 `<BlockEditor paneId={pane.id} />` 형태로 전달합니다.

### 4A.7 전역 검색 패널 UI

```
Cmd+Shift+F → 좌측 사이드바에 패널 표시

┌──────────────────────────────────────┐
│ 🔍 [검색어 입력_________________] ✕ │
│ ● 3건 미저장 포함                    │
│ ────────────────────────────────────  │
│ 📄 파일명 일치 (2건)                  │
│   notes.md                           │
│   release-notes.md                   │
│ ────────────────────────────────────  │
│ 📝 본문 일치 (10건)                   │
│  ⚡ todo.md:5    [미저장] ...[검색어]  │  ← isUnsaved
│   design.md:42  ...기능 [검색어] 의... │
│   todo.md:15    ...[검색어] 추가 필...  │
└──────────────────────────────────────┘
```

**결과 점프**:
```typescript
const handleResultClick = async (result: SearchResult) => {
  // 1. 해당 파일 열기 (이미 열려 있으면 탭으로 포커스)
  const fileEntry = useWorkspaceStore.getState().files
    .flatMap(flattenFiles)
    .find((f) => f.path === result.filePath);
  if (fileEntry) {
    await useDocumentStore.getState().openTab(fileEntry);
  }

  // 2. 에디터 커서 이동 (DOM 업데이트 후)
  if (result.matchType === 'content' && result.line > 0) {
    requestAnimationFrame(() => {
      const view = getActiveEditorView();
      if (!view) return;
      const line = view.state.doc.line(result.line);
      const pos = line.from + result.column;
      view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
      });
      view.focus();
    });
  }

  useGlobalSearchStore.getState().close();
};
```

### 4A.8 디바운스

```typescript
// GlobalSearch.tsx 내부
useEffect(() => {
  const timer = setTimeout(() => {
    if (query.trim() && workspacePath) {
      executeSearch(workspacePath);
    }
  }, 250);
  return () => clearTimeout(timer);
}, [query]);
```

### 4A.9 검증 체크리스트

- [ ] `Cmd+Shift+F`로 전역 검색 패널이 열리는가
- [ ] `Cmd+F`로 파일 내 검색 인라인 바가 열리는가
- [ ] 전역 검색: 250ms 디바운스 후 결과가 표시되는가
- [ ] 파일 내 검색: 현재 에디터의 미저장 내용도 즉시 검색되는가
- [ ] dirty 탭의 미저장 내용이 전역 검색 결과에 "(미저장)" 뱃지와 함께 표시되는가
- [ ] 결과 클릭 시 해당 파일이 열리고 커서가 해당 라인으로 이동하는가
- [ ] `.git`, `node_modules`, `.devoras` 폴더가 전역 검색에서 제외되는가
- [ ] 바이너리 파일 존재 시 크래시 없이 건너뛰는가
- [ ] `cargo build` 성공, `pnpm tsc --noEmit` 통과

---



> [!CAUTION]
> **⚠️ 문서 구조 결함 — Sprint 4A 사양이 두 벌 존재합니다 (2026-08-30 발견, 미해결)**
>
> 이 지점부터 아래 `### 4A.8 검증 체크리스트` 까지는 **바로 위 Sprint 4A 절(`### 4A.2`~`### 4A.9`)과 번호가 중복되는 두 번째 사양**입니다. `## Sprint 4A` 상위 헤딩 없이 `### 4A.2` 로 갑자기 시작하므로 편집 중 유입된 것으로 보입니다.
>
> **두 벌은 같지 않습니다** — 어느 한쪽을 기계적으로 지우면 내용이 소실됩니다:
> - **위쪽(먼저 나오는) 판**에만 있는 것: `4A.5 파일 내 검색 — CodeMirror SearchCursor`, `4A.6 EditorViewRegistry`, `4A.9 검증 체크리스트`
> - **아래쪽(이 판)**에만 있는 것: `4A.3 아키텍처 결정: Rust vs JavaScript 검색`
>
> 아래쪽이 더 이른 초안으로 보이나 **아키텍처 결정 근거는 아래쪽에만 남아 있습니다.** 정리 시 그 절을 위쪽으로 옮긴 뒤 아래쪽을 제거하는 것이 안전합니다. **사용자 확인 전까지 어느 쪽도 삭제하지 않았습니다.**

### 4A.2 신규 파일 목록

| 파일 경로 | 역할 |
|-----------|------|
| `src-tauri/src/search.rs` | Rust 네이티브 파일 검색 엔진 |
| `src/features/search/model/store.ts` | 검색 상태 Zustand Store |
| `src/features/search/model/types.ts` | SearchResult 타입 정의 |
| `src/widgets/GlobalSearch/ui/GlobalSearch.tsx` | 검색 패널 UI 컴포넌트 |

### 4A.3 아키텍처 결정: Rust vs JavaScript 검색

> **⛔ D9 정정 (2026-09-04, `PM-20260904-01` §scope_revision_r5_r6) — 이 절의 Rust 기본 설계는 뒤집혔다.**
>
> **R6(전역 검색)은 JS 우선으로 짓는다. Rust 이관은 실측으로 성능이 문제가 될 때 한다.**
>
> 근거: Rust 검색은 `architecture_stages.md:81` **Stage 2(Tier 1)** 항목이고 **출시 후로 미뤄져 있다.**
> 전역 검색을 Rust 로 지으면 **Stage 2 를 출시 앞으로 당기는 것**이다.
> 그리고 이 절의 1번 이유(「JS 로 수백 개 파일을 읽으면 UI 스레드가 멈춤」)는 **재지 않은 성능 우려**다 —
> **A6 선례를 반복하지 않는다**(재지 않은 성능 우려로 아키텍처를 먼저 골랐고, 실측에서 예산 대비
> 27배 여유가 나왔다. `DEBUG_PLAN.md` §5.11).

> **📌 계획 세션 확인 (2026-09-04)**: 이 절의 `architecture_stages.md 준수` 프레이밍은 **과장이다.**
> `architecture_stages.md:89` 의 Stage 2 항목은 「파일 검색 **인덱싱**을 Rust 로 구현(향후 전체 텍스트
> 검색 **대비**)」이며 **아직 체크되지 않은 향후 항목**이다 — Phase 3.5 의 전역 검색을 Rust 로 지으라고
> 요구하지 않는다. 이 절이 실제로 제시한 것은 준수 요구가 아니라 **「지금 Rust 로 지으면 Stage 2 가 싸진다」는
> 최적화 논거**다.
>
> 그리고 같은 문서 `:244` 는 **「Rust 이관은 Big Bang 이 아니라 도메인 하나씩 점진적으로」** 를 원칙으로
> 못 박는다. **따라서 D9 는 `architecture_stages.md` 와 충돌하지 않는다 — 오히려 그 점진 원칙에 부합한다.**

> [!IMPORTANT]
> **`architecture_stages.md` 준수**: Stage 2에서 "파일 검색 인덱싱을 Rust로 구현"이 명시되어 있으며, Stage 1에서 "IPC 인터페이스 설계"를 요구합니다.
> Phase 3.5의 전역 검색을 Rust로 구현하면, **Stage 2 진입 비용을 크게 절감**할 수 있습니다.

**결론**: 검색 로직은 **Rust 백엔드에서 수행**합니다.

이유:
1. JavaScript에서 수백 개 파일을 동기/비동기 읽기하면 UI 스레드가 멈춤
2. Rust의 `ignore` + `grep` crate는 `.gitignore` 자동 존중 + 멀티스레드 검색 지원
3. IPC 호출 1회로 결과를 받으므로 프론트엔드 복잡도가 대폭 감소
4. `architecture_stages.md`의 `devoras_{domain}_{action}` 네이밍 컨벤션 확립의 시작점

### 4A.4 Rust 검색 엔진 구현

> **⛔ D9 정정 (2026-09-04, `PM-20260904-01` §scope_revision_r5_r6) — 이 절의 Rust 기본 설계는 뒤집혔다.**
>
> **R6(전역 검색)은 JS 우선으로 짓는다. Rust 이관은 실측으로 성능이 문제가 될 때 한다.**
>
> 근거: Rust 검색은 `architecture_stages.md:81` **Stage 2(Tier 1)** 항목이고 **출시 후로 미뤄져 있다.**
> 전역 검색을 Rust 로 지으면 **Stage 2 를 출시 앞으로 당기는 것**이다.
> 그리고 이 절의 1번 이유(「JS 로 수백 개 파일을 읽으면 UI 스레드가 멈춤」)는 **재지 않은 성능 우려**다 —
> **A6 선례를 반복하지 않는다**(재지 않은 성능 우려로 아키텍처를 먼저 골랐고, 실측에서 예산 대비
> 27배 여유가 나왔다. `DEBUG_PLAN.md` §5.11).

**새 의존성 (Cargo.toml)**:
```toml
[dependencies]
# 기존 deps...
ignore = "0.4"    # .gitignore 존중 파일 워킹
```

```rust
// src-tauri/src/search.rs

use serde::Serialize;
use ignore::WalkBuilder;

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub file_path: String,
    pub file_name: String,
    pub line: usize,        // 1-indexed
    pub column: usize,      // 0-indexed
    pub context_text: String,
    pub match_type: String,  // "filename" | "content"
}

#[tauri::command]
pub async fn devoras_search_workspace(
    workspace_path: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }

    let max = max_results.unwrap_or(200);
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    let walker = WalkBuilder::new(&workspace_path)
        .hidden(true)        // .으로 시작하는 파일/폴더 건너뜀
        .git_ignore(true)    // .gitignore 존중
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            name != "node_modules" && name != ".git" && name != ".devoras"
        })
        .build();

    for entry in walker.flatten() {
        if results.len() >= max { break; }

        let path = entry.path();
        if !path.is_file() { continue; }

        let file_name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // 1. 파일명 매칭
        if file_name.to_lowercase().contains(&query_lower) {
            results.push(SearchResult {
                file_path: path.to_string_lossy().to_string(),
                file_name: file_name.clone(),
                line: 0,
                column: 0,
                context_text: String::new(),
                match_type: "filename".to_string(),
            });
        }

        // 2. 본문 매칭 (텍스트 파일만)
        let ext = path.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        if !matches!(ext.as_str(), "md" | "txt" | "erd" | "json" | "yml" | "yaml") {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(path) {
            for (line_idx, line) in content.lines().enumerate() {
                if results.len() >= max { break; }
                if let Some(col) = line.to_lowercase().find(&query_lower) {
                    results.push(SearchResult {
                        file_path: path.to_string_lossy().to_string(),
                        file_name: file_name.clone(),
                        line: line_idx + 1,
                        column: col,
                        context_text: line.to_string(),
                        match_type: "content".to_string(),
                    });
                }
            }
        }
    }

    Ok(results)
}
```

**`lib.rs` 등록**:
```rust
mod search;

// invoke_handler에 추가:
.invoke_handler(tauri::generate_handler![
    devoras_image_save, devoras_set_workspace_root, show_main_window, close_splashscreen,
    search::devoras_search_workspace,  // ✅ 추가
])
```

### 4A.5 프론트엔드 검색 Store

```typescript
// src/features/search/model/store.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  filePath: string;
  fileName: string;
  line: number;
  column: number;
  contextText: string;
  matchType: 'filename' | 'content';
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  isOpen: boolean;

  setQuery: (query: string) => void;
  executeSearch: (workspacePath: string) => Promise<void>;
  toggleOpen: () => void;
  close: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  isOpen: false,

  setQuery: (query) => set({ query }),

  executeSearch: async (workspacePath: string) => {
    const { query } = get();
    if (!query.trim()) {
      set({ results: [] });
      return;
    }

    set({ isSearching: true });
    try {
      const results = await invoke<SearchResult[]>('devoras_search_workspace', {
        workspacePath,
        query: query.trim(),
        maxResults: 200,
      });
      // camelCase 변환 (Rust의 snake_case → JS camelCase)
      set({
        results: results.map((r: any) => ({
          filePath: r.file_path,
          fileName: r.file_name,
          line: r.line,
          column: r.column,
          contextText: r.context_text,
          matchType: r.match_type,
        })),
      });
    } catch (err) {
      console.error('[Search] 검색 실패:', err);
      set({ results: [] });
    } finally {
      set({ isSearching: false });
    }
  },

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false, query: '', results: [] }),
}));
```

### 4A.6 검색 패널 UI

```
┌──────────────────────────────────────┐
│ 🔍 [검색어 입력_________________] ✕ │
│ ────────────────────────────────────  │
│ 📄 파일명 일치 (3건)                  │
│   notes.md                           │
│   meeting-notes.md                   │
│   release-notes.md                   │
│ ────────────────────────────────────  │
│ 📝 본문 일치 (12건)                   │
│   design.md:42  ...기능 [검색어] 의... │
│   todo.md:15    ...[검색어] 추가 필...  │
│   ...                                │
└──────────────────────────────────────┘
```

**결과 점프 구현**:
```typescript
const handleResultClick = async (result: SearchResult) => {
  // 1. 해당 파일 열기
  await useDocumentStore.getState().openTab(fileEntry);
  
  // 2. 에디터 커서 이동 (본문 매칭인 경우)
  if (result.matchType === 'content' && result.line > 0) {
    // CodeMirror 에디터 뷰 획득 후 커서 디스패치
    requestAnimationFrame(() => {
      const view = getActiveEditorView();
      if (!view) return;
      const line = view.state.doc.line(result.line);
      const pos = line.from + result.column;
      view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
      });
      view.focus();
    });
  }
  
  // 3. 검색 패널 닫기
  useSearchStore.getState().close();
};
```

### 4A.7 디바운스 및 키보드 단축키

```typescript
// WorkspacePage.tsx에 단축키 추가
if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
  e.preventDefault();
  useSearchStore.getState().toggleOpen();
}

// GlobalSearch.tsx 내부 — 입력 디바운스
useEffect(() => {
  const timer = setTimeout(() => {
    if (query.trim()) {
      executeSearch(workspacePath!);
    }
  }, 250); // 250ms 디바운스
  return () => clearTimeout(timer);
}, [query]);
```

### 4A.8 검증 체크리스트

- [ ] `Cmd+Shift+F`로 검색 패널이 열리는가
- [ ] 검색어 입력 시 250ms 디바운스 후 결과가 표시되는가
- [ ] 파일명 매칭과 본문 매칭이 분리 표시되는가
- [ ] 결과 클릭 시 해당 파일이 열리고 커서가 해당 라인으로 이동하는가
- [ ] `.git`, `node_modules`, `.devoras` 폴더가 검색에서 제외되는가
- [ ] 빈 쿼리 또는 특수문자 입력 시 크래시 없이 정상 동작하는가
- [ ] `cargo build` 성공, `pnpm tsc --noEmit` 통과

---

## Sprint 4B: 탭 & 스플릿 뷰 고도화

> **참조**: `functions/3_tabs_and_split_view.md` · 난이도: ★★★ · 예상 소요: 3~4일
> **선행 조건**: Sprint 2 완료 (설정과 통합), Tier 2 완료 (splitPane 방향 + TabCache)

### 4B.1 목표

기존에 구현된 탭/스플릿 뷰 기초 기반 위에, **탭 드래그 재정렬**, **탭 더티 인디케이터**, **리사이즈 핸들** 등 실사용 가능한 UX를 추가합니다.

### 4B.2 현재 상태 확인

이미 구현된 것:
- ✅ `SplitPane[]` + `TabItem[]` + `TabCache` 데이터 모델
- ✅ `splitPane(direction)` — 수평/수직 분할
- ✅ `closePane()` — 패널 병합
- ✅ `setActiveTab()` — 탭 전환 (캐시 기반)
- ✅ `closeTab()` — 빈 패널 자동 GC
- ✅ `layoutDirection` — CSS flex-row/flex-col 분기

미구현 (이번 Sprint에서 추가):
- ❌ 탭 드래그 재정렬 (같은 패널 내)
- ❌ 탭 드래그로 새 패널 분할 (패널 간 이동)
- ❌ 패널 간 리사이즈 핸들 (비율 조절)
- ❌ 더티 상태 시각적 인디케이터 (●)
- ❌ 탭 오른쪽 클릭 컨텍스트 메뉴

### 4B.3 탭 드래그 재정렬 구현

HTML5 Drag & Drop API를 사용합니다. 외부 라이브러리 없이 구현합니다.

**Store 액션 추가**:
```typescript
// src/entities/document/model/store.ts에 추가

reorderTab: (paneId: string, fromIndex: number, toIndex: number) => {
  const { panes } = get();
  set({
    panes: panes.map((p) => {
      if (p.id !== paneId) return p;
      const tabs = [...p.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { ...p, tabs };
    }),
  });
},

moveTabToPane: (sourcePaneId: string, targetPaneId: string, tabId: string) => {
  const { panes } = get();
  const sourcePane = panes.find(p => p.id === sourcePaneId);
  const tab = sourcePane?.tabs.find(t => t.id === tabId);
  if (!sourcePane || !tab) return;

  set({
    panes: panes.map((p) => {
      if (p.id === sourcePaneId) {
        const filtered = p.tabs.filter(t => t.id !== tabId);
        return {
          ...p,
          tabs: filtered,
          activeTabId: filtered[0]?.id ?? '',
        };
      }
      if (p.id === targetPaneId) {
        // 중복 방지
        if (p.tabs.some(t => t.id === tabId)) return p;
        return {
          ...p,
          tabs: [...p.tabs, tab],
          activeTabId: tab.id,
        };
      }
      return p;
    }).filter(p => p.tabs.length > 0 || panes.length <= 1),
  });
},
```

**탭 컴포넌트의 드래그 핸들**:
```tsx
// WorkspacePage.tsx — 탭 렌더링 부분

<div
  key={tab.id}
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      tabId: tab.id,
      paneId: pane.id,
      tabIndex: index,
    }));
    e.dataTransfer.effectAllowed = 'move';
  }}
  onDragOver={(e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }}
  onDrop={(e) => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    if (data.paneId === pane.id) {
      // 같은 패널 내 재정렬
      reorderTab(pane.id, data.tabIndex, index);
    } else {
      // 다른 패널로 이동
      moveTabToPane(data.paneId, pane.id, data.tabId);
    }
  }}
  className={`... ${tab.isDirty ? 'italic' : ''}`}
>
  {/* 탭 아이콘 */}
  {tab.type === 'erd' ? <Database size={12} /> : <FileText size={12} />}
  
  {/* 탭 제목 */}
  <span className="truncate max-w-[120px]">{tab.title}</span>
  
  {/* 더티 인디케이터 */}
  {tab.isDirty && (
    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
  )}
  
  {/* 닫기 버튼 */}
  <button onClick={(e) => { e.stopPropagation(); closeTab(pane.id, tab.id); }}>
    <X size={12} />
  </button>
</div>
```

### 4B.4 패널 리사이즈 핸들

```tsx
// WorkspacePage.tsx — 패널 사이 리사이즈 구터

{panes.map((pane, i) => (
  <React.Fragment key={pane.id}>
    <PaneContainer pane={pane} ... />
    {i < panes.length - 1 && (
      <div
        className={`
          ${layoutDirection === 'vertical' ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'}
          hover:bg-primary/40 active:bg-primary transition-colors flex-shrink-0
        `}
        onMouseDown={() => startPaneResize(i)}
      />
    )}
  </React.Fragment>
))}
```

리사이즈 로직은 사이드바/마인드뷰 리사이즈와 동일한 `onMouseMove` + `onMouseUp` 패턴을 사용합니다.

### 4B.5 검증 체크리스트

- [ ] 같은 패널 내에서 탭을 드래그하여 순서를 변경할 수 있는가
- [ ] 다른 패널로 탭을 드래그하여 이동할 수 있는가
- [ ] 마지막 탭이 이동된 원래 패널이 자동으로 닫히는가
- [ ] 패널 리사이즈 핸들이 작동하는가
- [ ] 더티 상태 인디케이터(●)가 표시되는가
- [ ] `pnpm tsc --noEmit` 통과

---

## 스파이크: 커스텀 문법 선구현 및 파생 과제

> **수행일**: 2026-08-27 · **상태**: 선구현 완료, 파생 과제 미착수
> **참조**: `architecture_stages.md` Stage 5 「선구현 검증 결과」 · `function_roadmap.md` Phase 6

### S.1 배경과 목적

Phase 6 「인라인 스마트 커스텀 심볼」은 사용자가 심볼을 직접 정의하는 기능이라 **데코레이터 개수가 열려 있습니다.** 본구현 전에 **문법을 하나 추가하면 실제로 무엇이 깨지는지**를 확인하기 위해, 화살표 심볼 `->`(단선) / `=>`(쌍선) 를 Read/Write 양쪽에 선구현했습니다.

목적은 기능 자체보다 **필요 변경점의 식별**이었고, 실제로 Stage 5 의 기존 가정 하나가 반증되었습니다.

### S.2 산출물

| 파일 경로 | 역할 |
|-----------|------|
| `src/shared/lib/markdown/customSymbols.ts` | 심볼 정의·글리프·매칭·SVG 생성의 단독 소유자 |
| `src/shared/lib/markdown/protectedRegions.ts` | 치환 금지 구간 계산 (순수 문자열 함수) — **임시 부채, §S.4 완료 시 삭제 대상** |
| `src/shared/lib/markdown/customSymbolMarked.ts` | Read Mode 어댑터 (marked 인라인 토크나이저) |
| `src/shared/lib/editor/decorators/impl/CustomSymbolDecorator.ts` | Write Mode 어댑터 (CodeMirror 위젯) |
| `src/shared/lib/markdown/__tests__/custom_symbol_harness.ts` | 하네스 17건 (`pnpm test:symbol`) |

### S.3 확인된 사실

> [!WARNING]
> **핵심 발견**: CodeMirror 는 **서로 겹치는 `Decoration.replace` 를 허용하지 않습니다.** 따라서 새 replace 계열 데코레이터는 **기존 replace 데코레이터 전부의 점유 범위를 알아야** 합니다. 현재 `protectedRegions.ts` 가 CodeBlock·Latex·Image·Hyperlink 의 점유 범위를 **복사해서** 들고 있으며, 이것이 이번 스파이크가 드러낸 최대 부채입니다.

| # | 확인 내용 | 근거 |
|---|-----------|------|
| 1 | 격리 기준은 "코드인가"가 아니라 **"이미 누가 replace 로 점유했는가"** | 수식 `$a -> b$`, 이미지 `![a -> b](x)`, 링크 목적지 모두 보호 필요 |
| 2 | 새 replace 데코레이터마다 기존 전부를 알아야 함 → **N² 결합** | `protectedRegions.ts` 의 4개 정규식이 전부 타 데코레이터 지식 |
| 3 | 결합 위치를 **문법 분류가 예측하지 못함** | `ListDecorator.ts:37` 의 `isCheckbox` 는 분류 *내부* 결합, Latex↔CustomSymbol 은 분류 *횡단* 결합 |
| 4 | 구분자 없는 토큰은 **인접 문자 가드**가 필수 | `-->`(HTML 주석), `==>`, `<->`, `->>` 오탐 |
| 5 | Read/Write 렌더 경로가 **비대칭** | Read 는 marked 토크나이저라 코드 격리 자동, Write 는 수동 계산 |
| 6 | Read Mode 에 KaTeX 경로가 없음 | 수식 보호가 Write Mode 에만 필요했던 이유. 모드 간 기능 격차 존재 |
| 7 | 보호 구간을 순수 함수로 분리하니 **CodeMirror 없이 검증 가능** | 하네스 17건이 DOM 없이 통과 |
| 8 | `buildAll` 은 데코레이터마다 문서를 **전수 재순회** (현재 12회) | `orchestrator.ts` — 상세는 `advanced_rendering_optimization.md` §3.4.2 |

### S.4 파생 과제: `SyntaxDecorator` 인터페이스 확장

> [!WARNING]
> **2026-08-30 — 이 과제의 우선도를 올릴 근거가 생겼다.**
> 디버깅 Step 6(A6 마운트 비용 판정)에서 **데코레이터 확장 계층이 인스턴스 수 축으로 초선형**임이 측정됐다 — `markdownDecorationPlugin` 과 `codeBlockInteractionPlugin` 이 각각 성장 지수 ≈1.2 인데 **동시 사용 시 ≈1.97** 로 치솟는다(N=200 에서 1,363ms, 순수 CodeMirror 대비 38배). 레이아웃과 무관하며(`display:none` 격리에서도 재현) **N=200 / 300ms 예산 미달의 유일한 원인**이다.
> 아래에서 다루는 `protectedRegions.ts` 의 N² 부채는 **문서 길이 축**이고 이번 측정은 **인스턴스 수 축**이라 서로 다른 현상이지만, **같은 뿌리(데코레이터 간 조정 부재)일 가능성이 있다 — 미확인.** 본 과제 착수 시 두 축을 함께 조사할 것.
> 측정 재현: `project/src/widgets/BlockEditor/__tests__/mount_cost_t2_harness.ts` · 판정 상세: [`code_review.md`](code_review.md) 「Step 1~6 사이클」 §A6

#### 세 가지 안 비교

| | A. 현행 유지 | B. 문법 타입별 그룹화 | **C. 플랫 + 중앙 중재 (권장)** |
|---|---|---|---|
| 방식 | 각 데코레이터가 방어 코드를 복사 | 인라인/블럭/리스트/프리랜더링 4분류로 레지스트리 분리 | 플랫 배열 유지 + `priority`/`claims` 선언 + 오케스트레이터 중재 |
| 유지보수 | 추가 시 기존 전부 학습 필요 (N²) | **다중 소속 문제로 악화** | 추가 시 `priority` 만 선언 |
| 안정성 | 불변식 강제 없음 — `RangeSet.join` 이 겹침을 통과시킴 | 그룹 내부만 보호, 그룹 간 관통 | 겹침을 한 곳에서 거부·로깅 |
| 효율성 | 12회 전수 스캔 + 펜스 판정 중복 | 그룹 배칭 가능 | 구조 사전 스캔 1회 공유 |

> [!NOTE]
> **B안을 반려한 이유**: 실제 데코레이터가 분류를 가로지릅니다. `LatexDecorator` 는 인라인(`INLINE_RE`) + 블럭(`DISPLAY_FENCE_RE`) + 프리랜더링(KaTeX) 3분류에 걸치고, `CodeBlockDecorator` 는 블럭 + 프리랜더링 + 인라인 코드, `CheckboxDecorator` 는 리스트 문법인데 동작은 인라인 replace 입니다. 분류를 실행 축으로 쓰면 어느 그룹에 넣을지 매번 판단해야 하고, S.3 #3 처럼 **분류 경계가 결합을 예측하지도 못합니다.**
> 분류는 **폴더 레이아웃·문서·뷰 모드별 on/off 태그**로는 유용하므로, 계층이 아니라 **라벨**로 남기는 것을 권장합니다.

#### C안 인터페이스 초안

```typescript
// src/shared/lib/editor/decorators/types.ts

/** 데코레이터가 선언하는 점유 종류. 오케스트레이터는 'replace' 끼리만 중재하면 된다. */
export type DecorationClaim = 'mark' | 'line' | 'replace';

/** 오케스트레이터가 1회 계산해 모든 데코레이터에 공유하는 구조 정보. */
export interface DecorationContext {
  /** 라인별 코드펜스/수식펜스 소속 상태 */
  readonly lineKinds: readonly LineKind[];
  /** 이번 패스에서 상위 우선순위가 이미 점유한 범위 (정렬됨) */
  readonly claimed: readonly TextSpan[];
}

export interface SyntaxDecorator {
  readonly name: string;

  /** 겹칠 때 승자를 정한다. 큰 값이 우선. 미선언 시 0. */
  readonly priority?: number;

  /** 이 데코레이터가 선언하는 점유 종류. 미선언 시 'mark' 취급(=중재 불필요). */
  readonly claims?: DecorationClaim;

  /** 문법 분류 — 실행에는 쓰이지 않는 라벨. 문서/뷰 모드 필터링용. */
  readonly kind?: 'inline' | 'block' | 'list' | 'prerender';

  createDecorations(state: EditorState, ctx: DecorationContext): DecorationSet;
}
```

권장 우선순위: `CodeBlock(100) > Latex(90) > Image(80) > Hyperlink(70) > Heading/List/Blockquote/HR(50) > BoldItalic/Strikethrough(30) > CustomSymbol(10)`

#### 기대 효과

- `protectedRegions.ts` 의 **타 데코레이터 지식이 소멸** → 각 데코레이터는 자기 문법만 앎
- 겹침 거부가 한 곳에 모여 **BUG-20260810-04/05 계열 결함의 재발 경로 차단**
- 기존 11개 데코레이터는 `priority` 기본값으로 **무수정 동작** (점진 이관 가능)

### S.5 단계별 작업

| # | 작업 | 비고 |
|---|------|------|
| 1 | `types.ts` 에 `priority`/`claims`/`kind`/`DecorationContext` 추가 (전부 옵셔널) | 기존 데코레이터 무수정 통과 확인 |
| 2 | `orchestrator.ts` `buildAll` 을 **정렬 → 점유 원장 누적 → 겹침 거부** 파이프라인으로 교체 | 거부 시 `console.warn` 으로 데코레이터명 로깅 |
| 3 | 구조 사전 스캔(라인 분류)을 `buildAll` 에서 1회 수행해 `ctx` 로 전달 | `protectedRegions.ts` 로직을 여기로 승격 |
| 4 | `CustomSymbolDecorator` 를 `ctx.claimed` 기반으로 전환하고 `protectedRegions.ts` **삭제** | 하네스는 승격된 함수를 대상으로 재작성 |
| 5 | `CodeBlock`/`Latex`/`Image`/`Hyperlink` 에 `claims: 'replace'` + `priority` 선언 | 나머지는 기본값 유지 |

### S.6 검증

```bash
pnpm tsc --noEmit
pnpm test:symbol          # 하네스 17건 (Node 22.6+ 필요)
pnpm lint
```

수동 검증 시나리오:

| # | 시나리오 | 확인 항목 |
|---|---------|-----------|
| 1 | `$x -> y$` 를 Write Mode 에서 편집 | KaTeX 위젯만 표시, 화살표 위젯 미생성, 콘솔 경고 없음 |
| 2 | `![a -> b](img.png)` | 이미지 위젯만 표시 |
| 3 | 코드펜스 안 `const f = (x) => x` | 원문 유지 (Read/Write 양쪽) |
| 4 | `<!-- 주석 -->` | 화살표로 변환되지 않음 |
| 5 | 심볼 위에 캐럿 진입 → 이탈 | 원문 노출 → 위젯 복귀, IME 조합 중 재빌드 없음 |


---

## 커밋 전략

각 Sprint 완료 시 AGENTS.md 규칙에 따라 커밋합니다.

> **2026-08-30 추가 규칙**: **문서만 변경한 커밋은 버전을 올리지 않습니다**(`.agents/AGENTS.md` 「버전업 예외」). 아래 표는 코드가 포함된 Sprint 커밋 기준입니다.


| Sprint | 커밋 메시지 예시 | 버전 |
|--------|-----------------|------|
| Sprint 1 | `feat(0.7.0): 시작 런처 구현 (최근 워크스페이스, 핀 고정, 자동 열기)` | 0.7.0 |
| Sprint 2 | `feat(0.8.0): 앱 설정 시스템 (에디터/마인드맵 설정 + 영구 저장 + CM Compartment)` | 0.8.0 |
| Sprint 3 | `feat(0.9.0): YAML 커스텀 테마 및 다크/라이트 모드 전환` | 0.9.0 |
| Sprint 4A | `feat(0.10.0): Rust 네이티브 전역 검색 (ignore crate + IPC)` | 0.10.0 |
| Sprint 4B | `feat(0.11.0): 탭 드래그 재정렬 및 패널 리사이즈 고도화` | 0.11.0 |

> [!NOTE]
> 마이너 버전을 올리는 이유: 각 Sprint는 **신규 기능 추가**이므로 패치가 아닌 마이너 버전 업입니다.

---

## 전체 검증 계획

### 자동화 테스트
```bash
# TypeScript 타입 검증 (매 Sprint 완료 시)
pnpm tsc --noEmit

# Rust 빌드 검증 (Sprint 4A 완료 시)
cd src-tauri && cargo build

# 전체 Tauri 빌드 검증 (최종)
pnpm tauri:build
```

### 수동 검증 시나리오

| # | 시나리오 | 확인 항목 |
|---|---------|-----------|
| 1 | 첫 실행 → 런처 → 폴더 열기 → 에디터 | 전체 플로우 정상 동작 |
| 2 | 에디터에서 파일 편집 → 설정 변경 → 저장 → 앱 재실행 | 설정 영구 보존 |
| 3 | 다크 → 라이트 → 커스텀 테마 → 앱 재실행 | 테마 전환 및 보존 |
| 4 | Cmd+Shift+F → 검색 → 결과 클릭 → 커서 이동 | 검색 + 점프 |
| 5 | 탭 드래그 → 패널 분할 → 리사이즈 → 패널 닫기 | 스플릿 뷰 전체 |
| 6 | ERD 파일 + MD 파일을 서로 다른 패널에서 동시 편집 | 멀티 탭 안정성 |

---

## Open Questions

> [!NOTE]
> 이전에 열려 있던 4개 질문이 모두 사용자 결정으로 해소되었습니다. 스파이크(§S)에서 새로 2건이 열렸습니다.

| # | 질문 | 결정 | 반영 위치 |
|---|------|------|-----------|
| 1 | 라이트 모드 우선순위 | ✅ Sprint 3에 라이트 모드 즉시 포함. YAML `mode` 필드로 다크/라이트 베이스 명시 | Sprint 3 전면 개편 |
| 2 | 검색 범위 | ✅ 전역 검색(디스크) + 파일 내 검색(인메모리) 완전 분리. dirty 탭은 JS에서 병합 | Sprint 4A 분리 설계 |
| 3 | 탭 Tear-off 고려 | ✅ `EditorViewRegistry` 도입으로 향후 tear-off 시 paneId 기반 EditorView 분리 확장 용이 | Sprint 4A.6 |
| 4 | 설정 저장 위치 | ✅ 앱 설정(`settings.json`)은 App Data Dir(전역), 테마(`.devoras/themes/*.yml`)는 워크스페이스별 | Sprint 2 + Sprint 3 |
| 5 | 데코레이터 중재를 언제 넣을까 | ⏳ **미결정.** Stage 1(에디터 안정화) 중이거나, Phase 6 커스텀 심볼 본구현 직전 중 택1. 전자는 안정화 스코프가 늘어나고, 후자는 그때까지 `protectedRegions.ts` 의 N² 부채를 유지 | §S.4/§S.5 — 착수 전 결정 필요 |
| 6 | 사용자 정의 심볼의 충돌 검사 시점 | ⏳ **미결정.** 심볼 등록 시(즉시 실패) vs 렌더 시(느슨하게 허용 후 무시) 중 정책 미정. 인접 문자 가드(S.3 #4)를 사용자 입력에도 적용할지가 걸려 있음 | 워크스페이스 전역 쿼리 시스템 설계와 함께 결정 |
