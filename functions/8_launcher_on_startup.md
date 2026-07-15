# Feature Ticket: 8. 시작 시 폴더 선택 런처 실행
**Status**: PLANNED
**Target Release**: v0.2.5
**Priority**: High
**Date**: 2026-07-15

---

## 1. 개요 및 기능 목표
앱 구동 시 마지막으로 열었던 워크스페이스를 자동 마운트하거나, 저장된 최근 워크스페이스 폴더 리스트를 보여주고 새 폴더를 선택할 수 있도록 유도하는 시작 전용 폴더 선택 런처(Startup Launcher) 화면을 개발한다.

## 2. 요구 사항 및 유스케이스
- **첫 실행 분기 처리**: 마운트된 워크스페이스가 없을 경우 메인 에디터 화면 대신 런처 모달 또는 런처 페이지를 우선 노출.
- **최근 사용 폴더 목록**: 최대 5~10개의 최근 열어본 폴더 경로를 기억하여 원클릭으로 다시 오픈.
- **자주 쓰는 폴더 고정(Pin)**: 특정 워크스페이스 경로를 고정 보관하는 기능 제공.
- **Tauri Native Open Dialog**: "새 폴더 열기" 버튼 클릭 시 OS 기본 파일 선택 창을 호출하여 로드.

## 3. 기술적 구현 설계 (FSD 아키텍처)
- **Shared Layer (`fs.ts` 또는 `@tauri-apps/plugin-dialog`)**:
  - `openDirectory` 메서드 연동 및 로컬 전역 스토리지에 최근 경로 스키마 저장 로직 구현.
- **Pages/Widgets Layer (`LauncherPage.tsx` 또는 `LauncherModal.tsx`)**:
  - 심플하고 수려한 모던 디자인의 런처 UI 렌더링.
  - 워크스페이스 스토어의 `workspacePath` 설정 완료 시 메인 `WorkspacePage`로 자연스럽게 라우팅 화면 전환 처리.

## 4. 작업 체크리스트
- [ ] 앱 전역 저장소에 `recentWorkspaces` 배열 및 `pinnedWorkspaces` 스키마 설계
- [ ] 최근 폴더 경로 목록 추가/갱신/핀 기능 및 저장 로직 구현
- [ ] 첫 진입 시 `workspacePath`의 유무에 따른 조건부 런처 노출 라우팅 구현
- [ ] 모던 다크 테마 기반의 폴더 선택 런처 화면 마크업 및 애니메이션 효과 적용
- [ ] 최근 경로 삭제 및 유효하지 않은 경로(삭제된 폴더) 접근 시 예외 처리
