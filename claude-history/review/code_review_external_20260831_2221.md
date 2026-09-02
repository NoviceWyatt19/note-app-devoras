# Devoras 프로젝트 코드 리뷰 — 새로운 관점

> **리뷰 일시**: 2026-08-31  
> **대상 범위**: `project/` 하위 전체 소스 코드 (Frontend, Backend, Config)  
> **분석 방식**: FSD 레이어별 병렬 전수조사 (App · Entities · Widgets · Shared · Pages · Tauri Backend · Config)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [아키텍처 총평](#2-아키텍처-총평)
3. [레이어별 심층 분석](#3-레이어별-심층-분석)
   - [3.1 App Layer](#31-app-layer)
   - [3.2 Entities Layer](#32-entities-layer)
   - [3.3 Widgets Layer](#33-widgets-layer)
   - [3.4 Shared Layer](#34-shared-layer)
   - [3.5 Pages Layer](#35-pages-layer)
   - [3.6 Tauri Backend (Rust)](#36-tauri-backend-rust)
   - [3.7 Config & Toolchain](#37-config--toolchain)
4. [횡단 관심사 (Cross-Cutting Concerns)](#4-횡단-관심사-cross-cutting-concerns)
5. [우수 사례 (Highlights)](#5-우수-사례-highlights)
6. [개선 제안 종합](#6-개선-제안-종합)
7. [위험도별 Action Items](#7-위험도별-action-items)

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|-----|
| **앱 이름** | Devoras |
| **버전** | 0.8.50 |
| **프레임워크** | Tauri v2 (Rust 백엔드) + React 18 + TypeScript |
| **번들러** | Vite 7 |
| **상태 관리** | Zustand 4 |
| **에디터 엔진** | CodeMirror 6 (블록 에디터) + ReactFlow (ERD/MindView) |
| **스타일링** | Tailwind CSS 3 |
| **아키텍처** | Feature-Sliced Design (FSD) |
| **주요 기능** | 마크다운 노트 편집, ERD 디자이너, 마인드맵 뷰, 파일 탐색기, 멀티 탭/패널 |

---

## 2. 아키텍처 총평

### ✅ 잘 된 점

- **FSD 아키텍처 강제화**: ESLint `no-restricted-imports` 룰로 상대 경로(`../`) 임포트를 에러로 차단하고, `tsconfig.json`의 `@/*` 절대 경로 매핑으로 레이어 간 의존성 규칙을 도구 레벨에서 강제합니다.
- **탭 스코프 상태 격리**: 전역 싱글턴 스토어의 소유권 충돌 문제를 `TabDocumentProvider` + 다중 인스턴스 스토어 패턴으로 해결한 것은 매우 정교한 설계입니다.
- **신뢰 경계(Trust Boundary) 설계**: 프론트엔드-백엔드 간 보안 경계에 대한 이해도가 높으며, XSS가 발생하더라도 네이티브 시스템이 탈취되지 않도록 깊이 있게 고민한 아키텍처입니다.

### ⚠️ 주의가 필요한 점

- **Entities 간 Cross-Slice 의존성**: `entities/document` → `entities/workspace` 직접 참조가 FSD 규칙을 위반합니다.
- **에러 처리 일관성 부재**: 레이어마다 에러 처리 전략이 다르며, Silent Fail 패턴이 곳곳에 산재합니다.
- **컴포넌트 비대화**: Widgets 레이어의 일부 파일이 700~1000줄에 육박하며 책임 분리가 부족합니다.

---

## 3. 레이어별 심층 분석

### 3.1 App Layer

**대상 파일**: `src/app/App.tsx`, `src/app/main.tsx`, `src/app/styles/`

#### 구조

- `App.tsx`가 라우팅 역할을 수행하며, `LauncherPage`와 `WorkspacePage` 사이의 화면 전환을 관리합니다.
- `window.__TAURI__` 존재 여부로 Tauri 환경을 감지하여 네이티브 기능을 조건부로 활성화합니다.

#### 발견 사항

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟡 중간 | `App.tsx` L19-21 | `(window as any).__TAURI__` — `global.d.ts`에 Tauri window 타입을 선언하여 any 캐스팅을 제거해야 합니다. |

---

### 3.2 Entities Layer

**대상 슬라이스**: `block`, `document`, `erd`, `settings`, `workspace`

이 레이어가 프로젝트의 **핵심 도메인 로직**을 담당하며, 가장 복잡도가 높고 분석 포인트가 많습니다.

#### 3.2.1 Block (`entities/block`)

**핵심 역할**: 마크다운 문서를 "블록" 단위로 파싱하고 트리 구조로 관리

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟡 중간 | `block/model/store.ts` | `flattenTree(get().blocks)`가 매 키 입력(또는 디바운스 주기)마다 호출됩니다. 문서가 수천 줄일 경우 재귀적 트리 탐색 + 배열 재생성이 반복되어 **성능 병목**이 됩니다. |
| 🟢 낮음 | `block/model/store.ts` | `flattenTree` 기반의 `join('\n')` 로직이 여러 곳에 산재 — Memoization 적용 여지가 있습니다. |

#### 3.2.2 Document (`entities/document`)

**핵심 역할**: 멀티 탭/패널 레이아웃 관리 + 탭 스코프 편집 상태

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🔴 높음 | `document/model/store.ts` L5, L200 | `entities/workspace` 스토어를 직접 import하여 **FSD Cross-Slice Dependency** 위반. 상위 레이어에서 주입하거나 `shared`로 이동 필요. |
| 🟡 중간 | `document/model/store.ts` | `panes.map(p => ({ ...p, tabs: p.tabs.map(...) }))` 패턴이 빈번 — 중첩 객체 상태가 커지면 리듀서가 무거워집니다. `immer` 결합 또는 상태 정규화(`Record<string, Pane>`)를 권장합니다. |
| 🟢 긍정 | `document/model/tabStore.ts` | 탭 전환 시 디스크 I/O를 발생시키지 않기 위해 `tab.cache`에 스냅샷을 덤프하는 인메모리 캐싱 최적화가 돋보입니다. |
| 🟢 긍정 | `TabDocumentProvider.tsx` | Strict Mode 대응 등록/해제 처리로 메모리 누수를 정확히 방지한 구현입니다. |

#### 3.2.3 ERD (`entities/erd`)

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟢 긍정 | `erd/model/erd.ts` | `parseErdDocument`에서 `unknown` 타입에 대해 수동 타입 가드를 씌운 런타임 검증이 견고합니다. 다만 Zod/Valibot 같은 스키마 라이브러리를 쓰면 ~100줄의 보일러플레이트를 대폭 줄일 수 있습니다. |

#### 3.2.4 Settings (`entities/settings`)

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🔴 높음 | `settings/model/store.ts` L79 | `loadFromDisk`에서 빈 `catch {}` 블록으로 에러를 삼킵니다. `settings.json` 파싱 에러 시 `DEFAULT_SETTINGS`로 초기화되면서 **사용자의 기존 설정이 영구 유실**될 수 있습니다. |

#### 3.2.5 Workspace (`entities/workspace`)

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟡 중간 | `workspace/model/recentStore.ts` L79 | `loadFromDisk`에서 역시 빈 `catch {}` 블록. 최소한 `console.error` 로깅과 `.bak` 백업 파일 생성이 필요합니다. |

---

### 3.3 Widgets Layer

**대상 위젯**: `BlockEditor`, `ErdDesigner`, `FileExplorer`, `MindView`, `SettingsModal`

#### 3.3.1 BlockEditor

**핵심**: CodeMirror 6 기반 블록 단위 마크다운 에디터

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟢 긍정 | `BlockEditor.tsx` | `computeMinimalChange`를 이용한 최소 diff 패치 — 전체 텍스트 교체 없이 CodeMirror 성능과 캐럿 위치 보존을 해결한 뛰어난 기법입니다. |
| 🟢 긍정 | `BlockEditor.tsx` | `consumedFocusTokenRef`를 활용한 단일 진입점(A1/A2 조정자) 패턴으로 React ↔ CodeMirror 상태를 정교하게 양방향 동기화합니다. |
| 🟡 중간 | `BlockEditor.tsx` | 700줄 이상의 단일 파일. 트리 렌더링 로직이 UI와 결합되어 있어 **책임 분리**가 필요합니다. |
| 🟡 중간 | `BlockEditor.tsx`, `ReadView.tsx` | `getLevelStyles(level: number)` 함수가 **양쪽에 동일하게 중복** 정의되어 있습니다. Shared 유틸리티로 추출해야 합니다. |

#### 3.3.2 ErdDesigner

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🔴 높음 | `ErdDesignerMainView.tsx` | JSON 파싱 에러 시 `createEmptyErdDocument()`로 빈 문서 생성 후 `setRawContent`로 덮어씁니다. 사용자가 JSON 문법을 틀리면 **기존 데이터가 영구 유실(Silent Data Loss)**되는 치명적 버그입니다. |
| 🟡 중간 | `ErdDesigner.tsx` | 1000줄에 육박하는 단일 파일에 ERD 캔버스, 테이블 노드, 관계선, 인스펙터, 컬럼 에디터가 모두 포함. `Inspector`, `TableNode`, `RelationEdge` 등으로 분리해야 합니다. |
| 🟡 중간 | `ErdDesignerMainView.tsx` | `useState<any>(null)`, `onChange: (newDoc: any) => void` — `ErdDocumentV1` 타입이 Entity에 존재하므로 활용하여 **any 사용을 근절**해야 합니다. |

#### 3.3.3 FileExplorer

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟡 중간 | `FileExplorer.tsx` | `expandedFolders` Set이 매번 새로운 참조를 생성하여 하위 노드 전체 리렌더링을 유발. 각 `TreeNode`에 `React.memo` 적용이 필요합니다. |
| 🟡 중간 | `FileExplorer.tsx` | 파일 생성/이름 변경 실패 시 `alert('생성 실패')` 등 단순 브라우저 얼럿 사용. **Toast 형태의 에러 알림**으로 교체 필요. |
| 🟡 중간 | `FileExplorer.tsx` | 모든 인터랙션이 `<div onClick=...>` 기반. `button` 태그나 `tabIndex={0}` + `onKeyDown` 추가로 **키보드 접근성** 확보 필요. |

#### 3.3.4 MindView

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟡 중간 | `MindView.tsx` | `updateNodeCoordinate`를 MouseMove 이벤트마다 호출 — 로컬 상태에서 렌더링 후 드래그 종료 시에만 스토어에 반영하도록 변경 권장. |
| 🟢 낮음 | `MindView.tsx` | `computePopupPos`, Canvas pan/zoom 계산 등 수학적 로직이 UI 파일에 하드코딩 — Shared lib으로 추출하면 테스트가 용이해집니다. |

#### 3.3.5 공통 — Error Boundary 부재

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🔴 높음 | Widgets 전체 | React Error Boundary가 없습니다. `ReactFlow` 기반 ERD/MindView나 `CodeMirror` 기반 BlockEditor 내부에서 크래시가 발생하면 **전체 탭이 흰 화면**으로 죽습니다. 각 Widget 최상단에 ErrorBoundary를 감싸 폴백 UI를 제공해야 합니다. |

---

### 3.4 Shared Layer

**대상**: `shared/api/fs.ts`, `shared/lib/` 하위 유틸리티

#### API 추상화

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟢 긍정 | `shared/api/fs.ts` | `MockFileSystem`(웹) / `TauriFileSystem`(데스크톱)을 `FileSystemRepository` 인터페이스로 추상화한 **Port-Adapter 패턴**이 훌륭합니다. `window.__TAURI__` 유무에 따라 구현체를 동적 주입합니다. |
| 🟡 중간 | `shared/api/fs.ts` L246, L327, L345 | `entries.map((entry: any) => ...)`, `catch (e: any)` 등 **any 타입이 잔존**합니다. Tauri API 반환 타입의 인터페이스를 정의하여 타입 안전성을 높여야 합니다. |
| 🟡 중간 | `shared/api/fs.ts` L252-253, L327-333 | Tauri IPC 호출 실패 시 `console.error` 후 기본값(`[]`, `{}`) 반환. 에러가 상위로 전파되지 않아 **사용자에게 명확한 피드백**을 줄 수 없습니다. 커스텀 Result 타입이나 에러 throw 방식을 권장합니다. |

#### 유틸리티/라이브러리

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟢 낮음 | `MockFileSystem` | 경로 계산에 `indexOf`/`substring`을 수동 사용 — `shared/lib/path.ts` 유틸리티를 활용하여 추상화하면 버그를 줄일 수 있습니다. |

---

### 3.5 Pages Layer

**대상**: `LauncherPage`, `WorkspacePage`

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟢 긍정 | `WorkspacePage.tsx` | 키보드 단축키(Cmd+S, Cmd+W 등)를 `useEffect` 내에서 중앙 집중식으로 처리하는 흐름이 깔끔합니다. |
| 🟡 중간 | `WorkspacePage.tsx` L100-125 | `isResizingSidebar`와 `isResizingMindView`의 리사이저 로직이 **구조적으로 거의 동일**합니다. `useResizer` 커스텀 훅으로 추출하면 코드를 단축하고 가독성을 높일 수 있습니다. |
| 🟡 중간 | `WorkspacePage.tsx` | 리사이즈 `mousemove` 이벤트에서 직접 `setSidebarWidth` 상태를 업데이트 — React 렌더링을 매우 빈번하게 유발합니다. `useRef`로 DOM을 직접 조작하거나 **쓰로틀링(Throttling)** 적용을 권장합니다. |

---

### 3.6 Tauri Backend (Rust)

**대상**: `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`

#### 보안 — 매우 우수

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟢 긍정 | `lib.rs` L33 | `ensure_inside` 함수에서 `std::fs::canonicalize`를 사용하여 **경로 순회 공격(Path Traversal)**을 원천 차단합니다. 심볼릭 링크나 `../`를 이용한 샌드박스 탈출 공격을 완벽히 방어합니다. |
| 🟢 긍정 | `lib.rs` L313 | `devoras_read_dropped_file`에서 프론트엔드가 전달한 경로를 무조건 신뢰하지 않고, Rust 레벨의 OS 드래그 앤 드롭 이벤트 핸들러가 기록한 경로 셋(`DroppedPaths`)과 대조하여 **출처 검증(Provenance)**을 수행합니다. XSS → LFI 공격을 차단하는 강력한 방어 기제입니다. |
| 🟢 긍정 | `lib.rs` L275 | Start Hidden & Reveal 패턴 — `visible: false`로 시작 후 React 렌더링 완료 시 `close_splashscreen`으로 노출하여 White Flash 방지. |

#### 개선점

| 심각도 | 위치 | 내용 |
|--------|------|------|
| 🟡 중간 | `lib.rs` L286, L290 | `close_splashscreen` 커맨드에서 `unwrap()` 호출. "splashscreen"/"main" 윈도우가 존재하지 않거나 이미 닫힌 상태면 **애플리케이션 전체가 패닉(Crash)**합니다. `if let Some(w) = ...` 패턴으로 안전하게 처리해야 합니다. |
| 🟢 낮음 | `capabilities/default.json` | `fs:allow-app-write-recursive` 등 포괄적 권한 부여. Rust 코드가 자체적으로 안전하게 제어하고 있어 당장 위험하진 않으나, Tauri v2 Permission 스키마를 더 타이트하게 좁히는 것도 검토할 수 있습니다. |

---

### 3.7 Config & Toolchain

| 항목 | 평가 | 비고 |
|------|------|------|
| **TypeScript Strict Mode** | ✅ 우수 | `strict: true`, `noImplicitAny`, `strictNullChecks` 등 모든 엄격한 타입 체크 활성화 |
| **ESLint** | ✅ 우수 | `@typescript-eslint/no-explicit-any` 및 `no-unused-vars`를 `error` 레벨로 설정 |
| **Vite 설정** | ✅ 적절 | Tauri 개발 서버를 위해 `clearScreen: false`, `strictPort: true` 적용. OS별 빌드 타겟 분기(`chrome105`/`safari13`) |
| **CSP** | ✅ 적절 | `asset:` 및 `ipc:` 프로토콜만 명시적 허용 |
| **Deny List** | ✅ 우수 | `$HOME/.ssh/**`, `.aws`, `.gnupg` 등 민감 폴더를 deny list에 등록하여 심층 방어 |
| **의존성 관리** | ℹ️ 참고 | `_compatibility_notes`에 메이저 마이그레이션 보류 목록(React 18→19, TW 3→4, ESLint 8→9 등)을 명시적으로 관리하는 점이 좋습니다. |

---

## 4. 횡단 관심사 (Cross-Cutting Concerns)

### 4.1 에러 처리 전략의 불일치

프로젝트 전반에 걸쳐 에러 처리 방식이 통일되어 있지 않습니다:

| 레이어 | 현재 방식 | 문제점 |
|--------|-----------|--------|
| **Rust 백엔드** | `Result<T, E>` 반환 | ✅ 적절 |
| **Shared API** | `try-catch` → `console.error` → 기본값 반환 | 에러 삼킴, UI 피드백 불가 |
| **Entities 스토어** | 빈 `catch {}` 블록 | 에러 무시, 디버깅 불가 |
| **Widgets** | `alert()` | 사용자 경험 저하 |

**제안**: 통합 에러 처리 전략을 수립하세요.
1. `shared/lib`에 `AppResult<T>` 타입을 정의하여 성공/실패를 명시적으로 표현
2. Toast/Notification 시스템을 `shared`에 구현
3. 디스크 I/O 실패 시 `.bak` 백업 파일을 자동 생성하는 전략 적용

### 4.2 `any` 타입 잔존

ESLint에서 `no-explicit-any`를 `error`로 설정했음에도, 런타임 바인딩 코드(`window.__TAURI__`, Tauri API 반환값, `catch (e)` 등)에 `any`가 잔존합니다. `global.d.ts` 타입 선언, Tauri 반환 타입 인터페이스 정의, `unknown` + 타입 가드 패턴으로 체계적으로 제거해야 합니다.

### 4.3 접근성(a11y)

전반적으로 마우스 기반 인터랙션에 치중되어 있습니다. 특히 `FileExplorer`의 파일 클릭/우클릭 기능이 모두 `<div onClick>` 기반으로, 키보드 내비게이션이 불가능합니다. 시맨틱 HTML 태그(`button`, `nav` 등)와 ARIA 속성 도입이 필요합니다.

### 4.4 Error Boundary 부재

React Error Boundary가 프로젝트 어디에도 존재하지 않습니다. `ReactFlow`(ErdDesigner, MindView)와 `CodeMirror`(BlockEditor) 같은 서드파티 라이브러리 기반 위젯에서 런타임 에러가 발생하면 **전체 앱이 흰 화면으로 죽습니다.** 최소한 각 Widget 최상단에 ErrorBoundary를 감싸 "이 탭에서 문제가 발생했습니다" 같은 폴백 UI를 제공해야 합니다.

---

## 5. 우수 사례 (Highlights)

이 프로젝트에서 특히 인상적인 설계 결정들입니다:

### 🏆 1. TabDocumentProvider를 통한 상태 격리
전역 싱글턴 스토어의 소유권 충돌 문제를 "탭 스코프 단위의 인스턴스 격리"로 해결한 아키텍처. 탭 전환 시 `tab.cache`에 스냅샷 덤프를 하는 인메모리 캐싱까지 적용.

### 🏆 2. 경로 순회 공격 방어 (ensure_inside)
`std::fs::canonicalize`를 사용한 완벽한 경로 검증과, 드래그 앤 드롭 경로의 출처 검증(Provenance) 기법으로 XSS → LFI 공격을 원천 차단.

### 🏆 3. 최소 Diff 패치 (computeMinimalChange)
CodeMirror 에디터에서 전체 텍스트를 교체하지 않고 최소 변경 범위만 패치하여 캐럿 위치를 보존하는 기법.

### 🏆 4. 티켓 기반 코드 주석
`BUG-20260826-02`, `REF-20260831-01` 등 이슈 번호와 함께 자세한 맥락을 코드 내부에 기록하여 유지보수의 추적성을 극대화.

### 🏆 5. 목적 지향 테스트 전략 (Harness)
단순 스냅샷 테스트가 아닌, "과거 발견된 버그(A7, K4 등)가 재발하지 않음을 증명"하는 회귀 테스트. Node.js 내장 `test` 모듈로 컴포넌트 의존 없이 스토어 로직만 순수하게 격리하여 테스트.

### 🏆 6. Port-Adapter 패턴의 FS 추상화
`FileSystemRepository` 인터페이스로 웹/데스크톱 환경을 분리하여 플랫폼 독립적인 개발과 테스트가 가능한 구조.

---

## 6. 개선 제안 종합

### 6.1 아키텍처 개선

| # | 제안 | 관련 파일 | 우선순위 |
|---|------|-----------|----------|
| A1 | **Cross-Slice Dependency 해소**: `entities/document` → `entities/workspace` 의존을 상위 레이어로 승격하거나, 공유 필요한 값만 `shared`로 이동 | `document/model/store.ts` | 높음 |
| A2 | **상태 정규화**: 중첩 객체 상태를 `Record<string, Pane>` 형태로 정규화하거나 `immer` 미들웨어 도입 | `document/model/store.ts` | 중간 |
| A3 | **ErrorBoundary 도입**: 각 Widget 최상단에 React Error Boundary 적용 | Widgets 전체 | 높음 |

### 6.2 안정성 개선

| # | 제안 | 관련 파일 | 우선순위 |
|---|------|-----------|----------|
| S1 | **에러 삼킴 근절**: 빈 `catch {}` 블록 제거, 최소한 `console.error` 로깅 + `.bak` 백업 | `settings/store.ts`, `recentStore.ts` | 높음 |
| S2 | **ERD 데이터 유실 방지**: JSON 파싱 에러 시 빈 문서로 덮어쓰지 않고 에러 UI 표시 | `ErdDesignerMainView.tsx` | 높음 |
| S3 | **Rust unwrap() 제거**: `close_splashscreen`의 `unwrap()` → `if let Some()` 패턴 | `lib.rs` L286, L290 | 중간 |
| S4 | **통합 에러 처리 전략**: `AppResult<T>` 타입 + Toast 알림 시스템 도입 | 전체 | 중간 |

### 6.3 성능 개선

| # | 제안 | 관련 파일 | 우선순위 |
|---|------|-----------|----------|
| P1 | **flattenTree Memoization**: 변경된 블록만 재계산하는 증분 업데이트 방식 도입 | `block/model/store.ts` | 중간 |
| P2 | **리사이저 최적화**: `mousemove` 이벤트에서 `useRef` DOM 직접 조작 또는 쓰로틀링 적용 | `WorkspacePage.tsx` | 중간 |
| P3 | **MindView 드래그 최적화**: 드래그 중에는 로컬 상태, 드래그 종료 시에만 스토어 반영 | `MindView.tsx` | 중간 |
| P4 | **FileExplorer TreeNode 메모이제이션**: `React.memo` 적용 | `FileExplorer.tsx` | 낮음 |

### 6.4 코드 품질 개선

| # | 제안 | 관련 파일 | 우선순위 |
|---|------|-----------|----------|
| Q1 | **컴포넌트 분할**: ErdDesigner(~1000줄), BlockEditor(~700줄) → 하위 컴포넌트로 분리 | Widgets | 중간 |
| Q2 | **중복 제거**: `getLevelStyles()` 함수를 Shared 유틸리티로 추출 | `BlockEditor.tsx`, `ReadView.tsx` | 낮음 |
| Q3 | **useResizer 훅 추출**: 사이드바/마인드뷰 리사이저 로직 통합 | `WorkspacePage.tsx` | 낮음 |
| Q4 | **any 타입 근절**: `global.d.ts` Tauri 타입 선언, Tauri 반환 타입 인터페이스 정의 | 전체 | 낮음 |
| Q5 | **접근성 강화**: `button` 태그, `tabIndex`, `onKeyDown`, ARIA 속성 도입 | `FileExplorer.tsx` | 낮음 |

---

## 7. 위험도별 Action Items

### 🔴 긴급 (데이터 유실 / 앱 크래시 위험)

1. **ERD 데이터 유실 방지** — `ErdDesignerMainView.tsx`에서 JSON 파싱 에러 시 빈 문서로 덮어쓰는 로직 제거. 에러 UI를 띄우고 사용자가 직접 조치하게 해야 합니다.
2. **설정 파일 복구 전략** — `settings/store.ts`, `recentStore.ts`의 빈 `catch {}` 블록에 에러 로깅 + `.bak` 백업 로직 추가.
3. **ErrorBoundary 도입** — ReactFlow/CodeMirror 크래시 시 전체 앱이 죽는 것을 방지.

### 🟡 중요 (아키텍처 건전성 / 성능)

4. **FSD Cross-Slice Dependency 해소** — `entities/document` → `entities/workspace` 의존 관계 정리.
5. **flattenTree 성능 최적화** — 대용량 문서 편집 시 병목 방지.
6. **Rust unwrap() 안전 처리** — 패닉 대신 우아한 에러 처리.
7. **통합 에러 처리 전략 수립** — `AppResult<T>` + Toast 시스템.

### 🟢 개선 (코드 품질 / DX)

8. 컴포넌트 비대화 해소 (ErdDesigner, BlockEditor 분할)
9. 중복 코드 추출 (`getLevelStyles`, `useResizer`)
10. `any` 타입 체계적 제거
11. 접근성(a11y) 강화

---

> **총평**: Devoras는 데스크톱 앱(Tauri) 환경의 멀티 탭 문서 편집기라는 복잡한 도메인을 매우 정교한 아키텍처와 깊은 보안 의식을 바탕으로 구현한 프로젝트입니다. 특히 상태 격리(TabDocumentProvider), 보안 경계 설계(ensure_inside + Provenance), 목적 지향 테스트(Harness) 등은 시니어 레벨의 뛰어난 엔지니어링 결정입니다. 위에서 제시한 개선 사항들은 이미 탄탄한 기반 위에 안정성과 유지보수성을 한 단계 더 끌어올리기 위한 제안입니다.
