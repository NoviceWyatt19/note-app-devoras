# Devoras Design - Layer Architecture Sketch

이 문서는 Devoras Design 프로젝트의 전반적인 레이어 아키텍처(Feature-Sliced Design, FSD) 구조를 나타냅니다.

## 🏗️ 아키텍처 다이어그램 (FSD 구조)

```mermaid
graph TD
    %% Layers
    subgraph App Layer ["App Layer (진입점 & 전역 설정)"]
        A1[main.tsx]
        A2[App.tsx]
    end

    subgraph Pages Layer ["Pages Layer (라우트 & 레이아웃)"]
        P1[WorkspacePage.tsx]
    end

    subgraph Widgets Layer ["Widgets Layer (독립적인 복합 UI)"]
        W1[FileExplorer]
        W2[BlockEditor]
        W3[MindView]
        W4[ErdDesigner]
    end

    subgraph Entities Layer ["Entities Layer (도메인 모델 & 비즈니스 로직)"]
        E1[Document Entity<br>documentStore, parser]
        E2[Block Entity<br>blockStore]
        E3[Workspace Entity<br>workspaceStore]
        E4[Erd Entity<br>erdStore, relations]
    end

    subgraph Shared Layer ["Shared Layer (공통 모듈 & 인프라)"]
        S1[File System API<br>TauriFileSystem, MockFileSystem]
        S2[Editor Decorators<br>Orchestrator, SyntaxDecorators]
        S3[Utilities<br>headingId, imageAsset, IME Managers]
    end

    %% Dependencies
    App Layer --> Pages Layer
    Pages Layer --> Widgets Layer
    Widgets Layer --> Entities Layer
    Widgets Layer --> Shared Layer
    Entities Layer --> Shared Layer

    classDef layer fill:#232431,stroke:#6366f1,stroke-width:2px,color:#fff;
    class App Layer,Pages Layer,Widgets Layer,Entities Layer,Shared Layer layer;
```

## 📂 레이어별 책임 및 역할

### 1. App Layer (`src/app/`)
- **책임**: 애플리케이션 진입점 및 전역 설정 초기화
- **주요 구성 요소**:
  - `main.tsx`: React Root 렌더링, 전역 CSS 로드
  - `App.tsx`: Tauri 런타임 감지, 메인 윈도우 지연 표시(White-flash 방지), 타이틀바 구성

### 2. Pages Layer (`src/pages/`)
- **책임**: 애플리케이션의 주요 뷰 구성 요소 배치 및 라우팅 (단일 페이지이지만 역할상 페이지)
- **주요 구성 요소**:
  - `WorkspacePage.tsx`: 파일 탐색기, 에디터, 마인드맵을 조합하는 3-Pane 레이아웃 담당. 전역 단축키(`Cmd+S`, `Cmd+\`, `Cmd+O`) 처리.

### 3. Widgets Layer (`src/widgets/`)
- **책임**: 재사용 가능한 비즈니스 UI 블록. 각 위젯은 내부 UI를 캡슐화하며 엔티티 스토어를 구독.
- **주요 구성 요소**:
  - `FileExplorer`: 파일 트리 렌더링, 컨텍스트 메뉴, 드래그 앤 드롭 이동, 복사/붙여넣기.
  - `BlockEditor`: 블록 단위 마크다운 에디터. CodeMirror 6 기반 에디터 인스턴스 관리, 포맷팅 툴바.
  - `MindView`: 노드 기반 마인드맵 렌더러, SVG 인터랙션 (Pan/Zoom/Drag).
  - `ErdDesigner`: `@xyflow/react` 기반의 ERD 시각화 편집 도구.

### 4. Entities Layer (`src/entities/`)
- **책임**: 애플리케이션의 핵심 도메인 상태와 로직 관리 (Zustand 스토어 기반).
- **주요 구성 요소**:
  - `documentStore`: 다중 탭/패인 상태, 현재 열린 문서(`rawContent`), 파일 I/O 동기화.
  - `blockStore`: `EditorBlock` 트리 구조 관리, 텍스트 입력 시 트리 병합/분할 연산.
  - `workspaceStore`: 워크스페이스 내 파일 시스템 상태 스캔, CRUD 비즈니스 로직.
  - `erdStore` & `relations`: ERD 스키마 파싱, 직렬화, SVG 정적 렌더링.

### 5. Shared Layer (`src/shared/`)
- **책임**: 특정 도메인에 종속되지 않는 범용 도구 및 인프라 연동.
- **주요 구성 요소**:
  - `api/fs.ts`: `TauriFileSystem`과 `MockFileSystem`의 추상화 인터페이스.
  - `lib/editor/decorators`: CodeMirror 6 마크다운 문법 장식자(Decorators) 및 IME 조합 상태 매니저.
  - `lib/headingId.ts`: BlockEditor와 MindView 간의 고유 ID 동기화 알고리즘.
