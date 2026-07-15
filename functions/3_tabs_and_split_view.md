# Feature Ticket: 3. 다중 파일 탭 지원 및 스플릿 뷰(가로/세로)
**Status**: PLANNED
**Target Release**: v0.4.0
**Priority**: Medium
**Date**: 2026-07-15

---

## 1. 개요 및 기능 목표
사용자가 동시에 여러 마크다운 노트를 오가며 참조하고 작업할 수 있도록 다중 탭(Tab) 관리 시스템을 구축하고, 화면을 분할하여 서로 다른 노트를 병렬로 띄우거나 에디터와 마인드맵 뷰를 유연하게 분할 렌더링하는 스플릿 뷰(Split View)를 구현한다.

## 2. 요구 사항 및 유스케이스
- **탭바 (Tab Bar)**: 상단에 열려 있는 파일 목록 탭을 노출하고, 닫기(`Cmd+W`), 위치 드래그 이동 등을 지원.
- **화면 분할 (Split Editor)**: 단일 탭을 화면 우측/하단으로 드래그하여 에디터 화면을 좌/우 또는 상/하로 분할.
- **포커스 연동**: 각 분할된 에디터 패널별로 마인드맵(MindView)을 다르게 매핑하거나, 하나의 거대한 마인드맵과 에디터 분할 뷰를 유연하게 동기화.

## 3. 기술적 구현 설계 (FSD 아키텍처)
- **Entities Layer (`document/store.ts`)**:
  - `activeFile` 단일 상태를 `openedTabs: string[]` 및 `activeTabId: string` 형태로 구조 재설계.
  - 분할 레이아웃 트리 구조 상태(예: Golden Layout 또는 React-Split 기반 상태 관리) 스토어 설계.
- **Pages/Widgets Layer (`WorkspacePage.tsx`, `TabGroup.tsx`)**:
  - CSS Flex/Grid 또는 `react-resizable-panels` 라이브러리를 활용한 분할 패널 컴포넌트 개발.

## 4. 작업 체크리스트
- [ ] 다중 탭 열기, 닫기, 상태 유지용 Zustand 스토어 확장
- [ ] 상단 탭바 컴포넌트 마크업 및 드래그 앤 드롭 정렬 기능 개발
- [ ] 화면 상/하/좌/우 분할 레이아웃 컴포넌트 구축
- [ ] 여러 개 열린 에디터 인스턴스별로 독립된 CodeMirror 상태 분리 바인딩
- [ ] 스플릿 패널 간 포커스 이동 시 마인드맵 시각화 연동 디버깅
