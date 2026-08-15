# Devoras Project Handover Document

이 문서는 Antigravity 플랫폼에서 Claude Code 등 다른 Agent 플랫폼으로 이전(Migration)할 때, 새로운 Agent가 프로젝트의 맥락(Context)과 아키텍처, 그리고 최근 진행 상황을 즉시 파악할 수 있도록 돕는 인수인계서입니다.

## 1. 프로젝트 아키텍처 개요
Devoras는 마크다운 기반의 지식 관리 데스크톱 애플리케이션으로, 로컬 파일 시스템을 직접 제어합니다.
- **Frontend:** React 18, TypeScript, Tailwind CSS, Zustand (FSD - Feature-Sliced Design 아키텍처 적용)
- **Backend (Desktop OS API):** Tauri v2 (Rust)
- **Editor:** CodeMirror 6 (Markdown), XYFlow / ReactFlow (Mindmap & ERD)

## 2. 최근 해결된 핵심 이슈 및 아키텍처 변경사항 (2026-08)

### 2.1. Tauri 초기 렌더링 데드락 및 백색 화면 (Splash Screen 아키텍처 도입)
- **문제:** 앱 로드 시 React 번들이 파싱되는 수 초간 하얀 화면이 뜨거나 멈춰있는 현상. 기존에는 `requestAnimationFrame`으로 렌더링 완료를 기다렸으나 창이 `visible: false`일 경우 데드락(무한 대기)이 발생함.
- **해결:** Tauri의 멀티 윈도우 스플래시 스크린 패턴 도입.
  - `tauri.conf.json`: `splashscreen`(투명 HTML, 즉각 로드)과 `main`(React, 렌더링 전 숨김) 윈도우 분리.
  - `public/splash.html`: 100vw, 100vh의 순수 다크 테마 HTML 로딩 뷰 추가.
  - `App.tsx` & `lib.rs`: React 렌더링 완료 직후 `invoke('close_splashscreen')`을 호출하여 스플래시를 끄고 메인 윈도우 노출.

### 2.2. 워크스페이스 상태 동기화 및 렌더링 꼬임 방지
- **문제:** 워크스페이스(디렉터리) 변경 시 `WorkspacePage`의 React `key`를 변경해 강제로 리마운트(remount)하던 안티 패턴과, Zustand 스토어의 `resetDocumentState` 구현 누락(TypeError)으로 인해 무한 로딩이 걸리는 현상 발생.
- **해결:** 
  - `documentStore.ts` 내 `resetDocumentState` 메서드 구현 완료.
  - 워크스페이스 변경 시 즉각적으로 상태를 비우고(`files: []`), 스캔(`scanWorkspace`)을 동기적으로 `await`하여 UI를 부드럽게 갱신하는 형태로 아키텍처 수정. (더 이상 React 트리 강제 파괴에 의존하지 않음)
  - 초기 실행 시 이전 캐시를 불러오던 로직을 삭제하여 항상 클린한 "폴더 선택" 스플래시로 시작하도록 강제.

## 3. 작업 히스토리 및 트러블슈팅 문서 위치
- **티켓/히스토리:** `ticket/` 하위 디렉터리(`debug/`, `impl/`, `refactor/` 등)에 과거 작업 및 기획 문서들이 보관되어 있음. (단, `ticket/request/`는 사용자의 이전 요청 원문 모음이므로 로드맵 산출 시 제외)
- **최신 트러블슈팅:** `ticket/troubleshooting/tauri-workspace-loading-issues.md`에 Tauri 데드락 및 상태 꼬임 해결 상세 내역 저장.

## 4. 새 Agent(Claude Code)를 위한 다음 권장 스텝
1. **코드 리뷰 적용:** 루트 경로의 `code_review.md`를 바탕으로 FSD 아키텍처 위반 사항 및 에러 수정(리팩토링) 진행.
2. **아키텍처 문서화:** 현재 프로젝트 내 모든 함수의 관계도와 레이어 아키텍처를 스케치하여 루트 경로에 MD 파일로 저장 (사용자 이전 요청 사항 중 미완료 건).
3. **히스토리 정리 완료:** `dev_history.md`와 `function_roadmap.md`를 보강하여 티켓들을 정리하고, 현재 개발 위치를 명확히 세팅.
