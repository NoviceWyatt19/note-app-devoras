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
5. **Advanced Rendering & Memory Optimization Planning**: Drafted `advanced_rendering_optimization.md` to outline TTL-based unmounting, Web Workers, and multi-window isolation for heavy 3D/Scheduler views.

## 🔴 Current Critical Bugs (Priority: Immediate)

A recent codebase audit discovered the following critical bugs that need to be addressed immediately:

1. **Data Loss on Tab Switch (`src/entities/document/model/store.ts`)**:
   - `setActiveTab` currently calls `fileSystemRepository.readFile()` unconditionally, wiping out any unsaved in-memory edits (`rawContent`, `nodes`) when switching between tabs.
   - *Fix needed*: Implement a tab-level cache (`TabItem.cache`) so `setActiveTab` restores from memory instead of disk if the tab has already been loaded.
2. **Nested Block Formatting Fails (`src/widgets/BlockEditor/ui/ReadView.tsx`)**:
   - `applyFormat` uses `useBlockStore.getState().blocks.find()`, which only searches root nodes. Formatting nested blocks (H2, H3, paragraphs) silently fails.
   - *Fix needed*: Use `flattenTree(useBlockStore.getState().blocks).find()` instead.
3. **H1 Block Merge Regex Bug (`src/entities/block/model/store.ts`)**:
   - `mergeBlockWithPrevious` uses the regex `/^(###?#?)\s*/` which matches `##`, `###`, `####` but FAILS to match a single `#` (H1).
   - *Fix needed*: Change to `/^#{1,4}\s*/`.
4. **~~Focus Jump on Heading Creation~~ (✅ Fixed in v0.6.1)**:
   - ~~When typing `##` or `###` in an existing block to create a new heading block, the cursor/focus incorrectly jumps back to the position of the existing block's H tag instead of staying at the newly created block.~~
   - *Root cause was 5 cascading issues*: unstable key derivation for empty headings, circular `useEffect([rawContent])`, deferred `setTimeout` focus, `onSelect` resetting offset to 0, and overly strict focus useEffect condition.

## 🟡 Code Smells & Refactoring Targets

- **`BlockEditor` Performance**: `handleBlockUpdate` currently triggers multiple `O(N)` tree traversals and string re-parsing on every keystroke. This needs optimization.
- **`Cmd+C` Scope Issue**: The `Cmd+C` file copy listener in `FileExplorer` is attached globally to `window`, interfering with text copying inside the markdown editor. It needs to be scoped to the FileExplorer container.
- **`documentStore` Multi-Tab State**: Currently, `rawContent`, `nodes`, and `isDirty` are global singletons in `documentStore`. They should ideally be scoped per tab to properly support multiple open documents without conflicts.
- **`parser.ts` Layout Coupling**: The markdown parser calculates initial `x`/`y` coordinates for the MindMap. This layout logic should be moved to the MindView layer.

## 💡 Conceptual Backlog (Phase 6 Features)
The following features have been brainstormed and validated as technically feasible for future implementation:
- **Slash Commands (`\:` popup)**: Implement a CodeMirror 6 ViewPlugin to trigger an autocomplete UI for generating blocks (e.g., `\:h3` -> `### `).
- **Multi-column Parallel Blocks**: Extend parsing and CodeMirror line decorators to support side-by-side rendering (e.g., via `|| parallel-left` metadata in headings).
- **Extended Markdown Images**: Update the image regex to support custom sizing and alignment syntax (e.g., `![alt](url || left 300px)`).
- **Image Detail Viewer**: Implement a side-tab or modal to open images for zooming and panning.

## 🛠️ Next Steps for Claude Code

1. Read through `src/entities/document/model/store.ts` and `src/widgets/BlockEditor/ui/BlockEditor.tsx` to familiarize yourself with the state management and editor implementation.
2. **Start by fixing the "Data Loss on Tab Switch" bug** mentioned in the Critical Bugs section above. This is the highest priority.
3. Refer to the `code_review.md` artifact from previous sessions for a detailed breakdown of technical debt.
4. Read `advanced_rendering_optimization.md` when preparing to implement heavy views (3D, Scheduler).
4. Ensure you follow the project's strict `.eslintrc` rules and `prettier` formatting on all changes.
5. **Remember**: The project uses `pnpm`. Use `pnpm dev` for browser testing and `pnpm tauri:dev` for native desktop testing.

Good luck!
