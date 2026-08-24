# Devoras Design - Project Handover Context

Welcome, Claude Code! This document provides the necessary context to continue development on the **Devoras Design** project.

## 🚀 Project Overview

**Devoras Design** is a Desktop Markdown, MindMap, and ERD Canvas application.
- **Tech Stack**: Tauri 2, React 18, TypeScript, Zustand, CodeMirror 6, `@xyflow/react`, Vite, Tailwind CSS (via inline utilities & classes).
- **Architecture**: Follows a Feature-Sliced Design (FSD) inspired structure:
  - `src/app/`: Application entry points, global providers.
  - `src/entities/`: Core domain models (`block`, `document`, `erd`, `workspace`) and Zustand stores.
  - `src/shared/`: Reusable utilities, API definitions (`fs.ts`), Editor Decorators.
  - `src/widgets/`: Complex UI components (`BlockEditor`, `MindView`, `ErdDesigner`, `FileExplorer`).
  - `src/pages/`: Route-level components (`WorkspacePage`).

## 🔄 Recent Accomplishments

1. **CodeMirror 6 Decorators & Korean IME Handling**: Solved complex React state/CodeMirror sync issues during IME composition using a 3-layer latch defense system.
2. **Splash Screen Deadlock Resolution**: Implemented a multi-window architecture in `tauri.conf.json` and `App.tsx` (using an explicit `setTimeout` fallback instead of `requestAnimationFrame`) to fix the white screen of death caused by window initialization deadlocks.
3. **100% Custom Pointer Events Drag & Drop**: Bypassed flaky WebKit/HTML5 Drag and Drop restrictions completely by implementing a robust, custom `onPointerDown`/`Enter`/`Up` solution for the file explorer.
4. **UX Enhancements**: Redefined `Cmd+W` strictly for tab closure (reserving `Cmd+Q` for app quit) and added a subtle save animation for `Cmd+S`.
5. **3-Tier Hybrid Architecture Decision**: Finalized the resource management strategy after evaluating TTL-based unmounting (insufficient for this app's use-case patterns). See `architecture_stages.md` for full details.

## 🟢 Current Critical Bugs (Priority: Resolved in Stage 1)

A recent codebase audit discovered the following critical bugs, which have now been **fully resolved**:

1. **~~Data Loss on Tab Switch (`src/entities/document/model/store.ts`)~~ (✅ Fixed)**:
   - Implemented a tab-level cache (`TabCache`) so `setActiveTab` restores from memory instead of disk.
2. **~~Nested Block Formatting Fails (`src/widgets/BlockEditor/ui/ReadView.tsx`)~~ (✅ Fixed)**:
   - Replaced `blocks.find()` with `flattenTree(blocks).find()`.
3. **~~H1 Block Merge Regex Bug (`src/entities/block/model/store.ts`)~~ (✅ Fixed)**:
   - Changed to `/^#{1,6}\s*/` to properly merge H1 headings.
4. **~~Focus Jump on Heading Creation~~ (✅ Fixed in v0.6.1)**:
   - Root cause was cascading focus effects and debounce issues; resolved with targeted focus coordination.

## 🟡 Code Smells & Refactoring Targets

- **`BlockEditor` Performance**: `handleBlockUpdate` currently triggers multiple `O(N)` tree traversals and string re-parsing on every keystroke. This needs optimization.
- **`Cmd+C` Scope Issue**: The `Cmd+C` file copy listener in `FileExplorer` is attached globally to `window`, interfering with text copying inside the markdown editor. It needs to be scoped to the FileExplorer container.
- **`documentStore` Multi-Tab State**: Currently, `rawContent`, `nodes`, and `isDirty` are global singletons in `documentStore`. They should ideally be scoped per tab to properly support multiple open documents without conflicts.
- **`parser.ts` Layout Coupling**: The markdown parser calculates initial `x`/`y` coordinates for the MindMap. This layout logic should be moved to the MindView layer.

## 🏗️ Resource Management Architecture (3-Tier Hybrid)

> **핵심 원칙:** TTL 기반 언마운트 전략은 이 앱의 유즈케이스 패턴(에디터↔마인드맵 전환이 잦고, 3D 뷰는 드물게 사용)에 부적합하므로 폐기.
> 대신 뷰의 무게와 사용 빈도에 따라 3개 계층을 분리 적용한다.

### Tier 1 (Foundation): Rust Backend State Management
- 모든 무거운 데이터 구조(AST 트리, 그래프, 좌표 계산)를 Tauri Rust 백엔드로 이관.
- 프론트엔드(React)는 Rust에게 IPC로 "화면에 보여야 할 데이터"만 요청하는 얇은 렌더링 레이어로 전환.
- JS 힙 메모리를 극적으로 줄여 뷰 마운트 수와 무관하게 낮은 기본 자원 점유를 보장.

### Tier 2 (Frequent Views): OffscreenCanvas in Main Window
- 에디터, 마인드맵, ERD는 메인 Webview 내에서 탭 전환. DOM은 항상 유지(`display: none`), 캔버스 뷰는 `OffscreenCanvas`로 Worker 렌더링.
- 비활성 뷰는 렌더링 루프(RAF)만 일시정지 → CPU 비용 0, 메모리는 캔버스 버퍼만 유지.

### Tier 3 (Heavy Views): Lazy Multi-Window
- 3D 아키텍처 뷰 등 GPU 집약적인 뷰는 사용자가 처음 열 때 별도 Tauri Window를 Lazy 생성.
- 워크스페이스가 닫힐 때까지 Hide/Show로 전환. 메인 창 IME/타이핑과 완전 프로세스 격리.

## 💡 Conceptual Backlog (Phase 6 Features)
The following features have been brainstormed and validated as technically feasible for future implementation:
- **Slash Commands (`\:` popup)**: Implement a CodeMirror 6 ViewPlugin to trigger an autocomplete UI for generating blocks (e.g., `\:h3` -> `### `).
- **Multi-column Parallel Blocks**: Extend parsing and CodeMirror line decorators to support side-by-side rendering (e.g., via `|| parallel-left` metadata in headings).
- **Extended Markdown Images**: Update the image regex to support custom sizing and alignment syntax (e.g., `![alt](url || left 300px)`).
- **Image Detail Viewer**: Implement a side-tab or modal to open images for zooming and panning. See `functions/image_side_view.pdf`.
- **Inline Smart Custom Symbols**: User-defined symbol widgets (badges) with hover tooltip for meaning. Prerequisites: interactive state toggling + workspace-wide query aggregation system. See `functions/custom_symbol.pdf`.
- **Tabs & Split View**: Multi-file tab bar with drag reorder and horizontal/vertical split editor panes. See `functions/3_tabs_and_split_view.md`.
- **Global Search**: Workspace-wide real-time search with filename/body matching, context snippets, and jump navigation. See `functions/4_global_search.md`.
- **App Settings**: Persistent editor/mindmap settings (font, autosave, line wrap, node styles) with live hot-reload. See `functions/5_app_settings.md`.
- **YAML Custom Themes**: Dark/light mode toggle + user-defined YAML theme files with real-time CSS variable injection. See `functions/6_theme_yaml_custom.md`.
- **Tab Tearoff & New Window**: Drag tabs outside the window to spawn independent Tauri child windows with IPC sync. See `functions/7_tab_tearoff_new_window.md`.
- **Startup Launcher**: Workspace selection screen on launch with recent folders list and pin-to-favorites. See `functions/8_launcher_on_startup.md`.
- **MindView Nested Container**: H1-root hierarchy-based nested box (container/boundary) view mode for architecture visualization. See `functions/9_mind_view_nested_container.md`.

## 🛠️ Next Steps for Claude Code

1. Read through `src/entities/document/model/store.ts` and `src/widgets/BlockEditor/ui/BlockEditor.tsx` to familiarize yourself with the state management and editor implementation.
2. **Start by fixing the "Data Loss on Tab Switch" bug** mentioned in the Critical Bugs section above. This is the highest priority.
3. Refer to the `code_review.md` artifact from previous sessions for a detailed breakdown of technical debt.
4. Read `advanced_rendering_optimization.md` when preparing to implement heavy views (3D, Scheduler).
4. Ensure you follow the project's strict `.eslintrc` rules and `prettier` formatting on all changes.
5. **Remember**: The project uses `pnpm`. Use `pnpm dev` for browser testing and `pnpm tauri:dev` for native desktop testing.

Good luck!
