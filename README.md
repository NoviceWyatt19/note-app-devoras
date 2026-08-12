# Devoras (MVP)

Devoras는 **텍스트 기반의 마크다운 에디터**와 **실시간 마인드맵/ERD 시각화 도구**가 결합된 차세대 로컬 노트 앱입니다. 생각의 흐름을 텍스트로 정리함과 동시에, 단방향 투영 캔버스를 통해 구조화된 데이터를 한눈에 파악할 수 있도록 돕습니다.

---

## 🌟 주요 기능 (Key Features)

### 1. 계층형 중첩 박스 (Hierarchical Nested Box) 디자인
- 기존의 평면적인 텍스트 노트를 넘어, **H1, H2, H3 헤딩(Heading)** 레벨에 따라 시각적인 계층 구조를 만듭니다.
- 가장 큰 주제(H1) 안에 하위 주제(H2, H3)가 각각 점진적으로 짙은 배경색과 패딩을 갖는 **레이어드(Layered) 상자** 형태로 렌더링되어, 직관적이고 깊이 있는 문서 탐색 경험을 제공합니다.
- **Write Mode(편집 모드)**와 **Read Mode(읽기 모드)** 모두에 완벽하게 동일한 중첩 박스 디자인이 적용되어 이질감이 없습니다.

### 2. 강력한 마크다운 편집 경험 (CodeMirror 6 기반)
- **WYSIWYG 스타일 마크다운**: 굵게(`**`), 기울임(`*`), 취소선(`~~`), 형광펜(`==`), 체크박스, 인용구 등 다양한 문법을 입력하는 즉시 데코레이터(Decorator) 위젯으로 치환하거나 스타일을 적용해 줍니다.
- 백스페이스 연산 및 블록간 이동 시 트리 구조를 '자가 치유(Heal)' 방식으로 자연스럽게 이어 붙이는 스마트한 에디터 아키텍처를 자랑합니다.

### 3. 실시간 단방향 투영 캔버스 (마인드맵 & ERD)
- 문서를 편집하면, 문서 내의 구조와 특수 블록(예: 데이터베이스 스키마 정의 등)이 **독립 마인드맵(React Flow)** 뷰 혹은 **사이드 뷰(Split View)**에 실시간으로 동기화되어 렌더링됩니다.
- 텍스트 뷰포트와 노드 구조 사이의 딜레이 없는 실시간 동기화를 지원합니다.

### 4. 빠르고 안전한 로컬 파일 관리 시스템 (Tauri)
- 클라우드 의존성 없이, 사용자 PC 내의 로컬 폴더(Workspace)를 통째로 연동하여 `.md` 파일을 읽고 씁니다.
- 데스크탑 환경에 특화된 기능으로, **이미지 드래그 앤 드롭(Drag & Drop)** 및 **클립보드 이미지 붙여넣기**를 지원하여 자동으로 로컬 작업 공간에 이미지를 저장하고 마크다운 문법으로 변환해 줍니다.

---

## 🛠 기술 스택 (Tech Stack)

### Frontend
- **React (v18)** & **Vite**: 쾌적한 개발 및 UI 렌더링 환경
- **Zustand**: 문서 구조, 블록 관리 등을 위한 빠르고 간결한 상태 관리
- **TailwindCSS**: UI 디자인 및 반응형/다크 모드 스타일링
- **CodeMirror 6**: 문서 블록들의 핵심 편집 코어 (마크다운 파서 및 StateField 데코레이터 적용)
- **XYFlow (React Flow)**: 노드 기반의 실시간 마인드맵 시각화 렌더러
- **Marked**: 빠르고 커스텀 가능한 마크다운 렌더링 파서 (Read Mode 용)

### Backend / Desktop App Core
- **Tauri 2 (Rust)**: 초경량, 고성능 데스크탑 애플리케이션 프레임워크
- **Tauri Plugins**: `fs` (파일 시스템), `dialog` (운영체제 다이얼로그) 활용 등 완벽한 OS 통합 지원

---

## 🚀 시작하기 (Getting Started)

### 사전 요구사항
* [Node.js](https://nodejs.org/) (v18 이상 권장)
* [pnpm](https://pnpm.io/) 패키지 매니저
* [Rust](https://www.rust-lang.org/) (Tauri 빌드를 위함)

### 설치 및 로컬 실행

1. 의존성 설치
```bash
cd project
pnpm install
```

2. 데스크탑 앱 개발 모드 실행
```bash
pnpm tauri dev
```
(이 명령어는 Vite 개발 서버를 구동하고, 백그라운드에서 Rust Tauri 코어와 연동된 데스크탑 앱 윈도우를 띄웁니다.)

3. 프로덕션 빌드
```bash
pnpm tauri build
```
(Windows의 경우 `.msi` 혹은 `.exe`, macOS의 경우 `.app`, `.dmg` 등의 설치 파일이 `/src-tauri/target/release/bundle` 에 생성됩니다.)

---

## 💡 프로젝트 구조 안내

* `project/src/entities` : 블록(Block), 문서(Document), 워크스페이스(Workspace)의 핵심 비즈니스 로직과 Zustand 스토어
* `project/src/widgets` : BlockEditor(에디터 코어), ErdDesigner(캔버스 뷰), FileExplorer(좌측 탐색기) 등 메인 기능별 위젯 조합
* `project/src/shared/lib/editor` : CodeMirror 6 기반의 커스텀 플러그인(장식자, IME 격리 모듈 등) 등 에디터 필수 유틸리티 집합
* `project/src-tauri` : Rust 백엔드 코드 모음 (파일 입출력, OS API 등)
