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

1. **CodeMirror 6 Decorators**: Implemented a robust `Decorator Orchestrator` pattern handling markdown syntax (Bold, Italic, Images, LaTeX, Code Blocks) with cursor-aware revealing.
2. **Korean IME Handling**: Implemented a 3-layer defense (`useImeInputManager`, `setImeEffect`) to prevent CodeMirror/Zustand sync issues during Korean IME composition.
3. **Workspace Operations**: Fixed drag-and-drop file moving bugs, implemented `Cmd+C`/`Cmd+V` file copying, and added a `Cmd+O` (File menu) workspace opener.
4. **ERD Designer Integration**: Updated the project to use `@xyflow/react` for the ERD Canvas, removing old Obsidian dependencies.

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

## 🟡 Code Smells & Refactoring Targets

- **`BlockEditor` Performance**: `handleBlockUpdate` currently triggers multiple `O(N)` tree traversals and string re-parsing on every keystroke. This needs optimization.
- **`Cmd+C` Scope Issue**: The `Cmd+C` file copy listener in `FileExplorer` is attached globally to `window`, interfering with text copying inside the markdown editor. It needs to be scoped to the FileExplorer container.
- **`documentStore` Multi-Tab State**: Currently, `rawContent`, `nodes`, and `isDirty` are global singletons in `documentStore`. They should ideally be scoped per tab to properly support multiple open documents without conflicts.
- **`parser.ts` Layout Coupling**: The markdown parser calculates initial `x`/`y` coordinates for the MindMap. This layout logic should be moved to the MindView layer.

## 🛠️ Next Steps for Claude Code

1. Read through `src/entities/document/model/store.ts` and `src/widgets/BlockEditor/ui/BlockEditor.tsx` to familiarize yourself with the state management and editor implementation.
2. **Start by fixing the "Data Loss on Tab Switch" bug** mentioned in the Critical Bugs section above. This is the highest priority.
3. Refer to the `code_review.md` artifact from previous sessions for a more detailed breakdown of technical debt and architectural improvements.
4. Ensure you follow the project's strict `.eslintrc` rules and `prettier` formatting on all changes.
5. **Remember**: The project uses `pnpm`. Use `pnpm dev` for browser testing and `pnpm tauri:dev` for native desktop testing.

Good luck!
