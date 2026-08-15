# Ticket: imple_setup_and_fsd_structure
**Status**: COMPLETED
**Target Release**: v0.1.1
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표
Devoras MVP의 뼈대를 잡기 위해 React + Vite + TypeScript + Tailwind CSS + CodeMirror 6 개발 환경을 구축하고, FSD(Feature-Sliced Design) 아키텍처 기반의 초기 폴더 구조를 수립한다. 환경에 독립적인 로컬 파일 IO 제어를 위해 FileSystem Repository 패턴을 구현한다.

## 2. 구현 상세

### A. 빌드 및 스타일링 환경 설정
- **Vite 설정**: `vite.config.ts`를 작성하여 React 플러그인을 활성화하고 `@/*` 에일리어스를 구성했으며, Tauri 2 컴패티빌리티 및 포트(1420)를 고정했습니다.
- **TypeScript 노드 설정**: `tsconfig.node.json`을 추가하여 Vite 설정 컴파일 시 에러가 나지 않도록 조정했습니다.
- **Tailwind & PostCSS**: `tailwind.config.js`와 `postcss.config.js`를 배치하여 프로젝트의 다크 테마(HSL 기반) 색상 체계를 잡고, `src/app/styles/index.css`를 통해 Tailwind 디렉티브와 함께 스크롤바 디자인을 세팅했습니다.

### B. FileSystem 추상화 (Repository 패턴)
- 로컬 브라우저(Vite Mocking)와 데스크톱 앱(Tauri 2) 개발 생산성을 모두 보장할 수 있는 파일 시스템 추상 레이어를 설계했습니다.
- **인터페이스 (`src/shared/api/fs.ts`)**:
  ```typescript
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
  }
  ```
- **MockFileSystem**: `localStorage` 및 인메모리 기록에 대응하는 더미 마크다운 파일시스템 구성.
- **TauriFileSystem**: Tauri 2의 `@tauri-apps/plugin-dialog` 및 `@tauri-apps/plugin-fs` 기반의 로컬 OS 파일 입출력 결합.

### C. FSD 기반 상태 스토어 및 위젯 구성
- **스토어 구성**:
  - `workspace`: 워크스페이스 디렉토리 선택 및 파일 탐색기 연동.
  - `document`: 마크다운 파싱(헤딩 및 메타 주석 결합) 및 저장(주석 직렬화).
  - `block`: 마크다운 문단을 `\n\n` 기준으로 CodeMirror 블록으로 가공 및 에디터 상태 유지.
- **3패널 레이아웃 구성 (`WorkspacePage`)**:
  - `FileExplorer` (좌측): 워크스페이스 마운트 및 새 마크다운 파일 생성.
  - `BlockEditor` (중앙): 문단별 CodeMirror 6 에디터를 루프 렌더링하고, 포커스/Enter 분할/Backspace 병합 제어.
  - `MindView` (우측): SVG/DOM 기반 줌, 팬, 노드 드래그 앤 드롭 마인드맵 시각화.

## 3. 관련 파일 변경 목록
- **NEW**:
  - [project/vite.config.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/vite.config.ts)
  - [project/index.html](file:///Users/wyattkim/Desktop/Devoras-Design/project/index.html)
  - [project/tailwind.config.js](file:///Users/wyattkim/Desktop/Devoras-Design/project/tailwind.config.js)
  - [project/postcss.config.js](file:///Users/wyattkim/Desktop/Devoras-Design/project/postcss.config.js)
  - [project/tsconfig.node.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/tsconfig.node.json)
  - [project/src/shared/api/fs.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/api/fs.ts)
  - [project/src/app/styles/index.css](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/app/styles/index.css)
  - [project/src/app/main.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/app/main.tsx)
  - [project/src/app/App.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/app/App.tsx)
  - [project/src/pages/WorkspacePage/WorkspacePage.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/pages/WorkspacePage/WorkspacePage.tsx)
  - [project/src/entities/workspace/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/workspace/model/store.ts)
  - [project/src/entities/document/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts)
  - [project/src/entities/document/lib/parser.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts)
  - [project/src/entities/block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [project/src/widgets/FileExplorer/index.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/FileExplorer/index.ts)
  - [project/src/widgets/FileExplorer/ui/FileExplorer.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/FileExplorer/ui/FileExplorer.tsx)
  - [project/src/widgets/BlockEditor/index.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/index.ts)
  - [project/src/widgets/BlockEditor/ui/BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)
  - [project/src/widgets/MindView/index.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/MindView/index.ts)
  - [project/src/widgets/MindView/ui/MindView.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/MindView/ui/MindView.tsx)
- **MODIFY**:
  - [project/package.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/package.json)
