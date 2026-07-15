# Feature Ticket: 5. 앱 설정
**Status**: PLANNED
**Target Release**: v0.5.0
**Priority**: Medium
**Date**: 2026-07-15

---

## 1. 개요 및 기능 목표
에디터 폰트 크기, 줄바꿈 설정, 자동 저장 주기 등 텍스트 편집기 기본 옵션과 마인드맵 레이아웃(세로형/가로형) 등 뷰어 옵션을 전역적으로 구성하고 유지하는 앱 설정(Settings) 모달을 개발한다.

## 2. 요구 사항 및 유스케이스
- **에디터 세부 설정**:
  - 글꼴 크기 (Font Size, 12px ~ 24px)
  - 폰트 패밀리 (D2Coding, JetBrains Mono, 기본 시스템 고딕 등)
  - 자동 저장 주기 (Autosave Delay, 1초 ~ 10초 또는 입력 즉시)
  - 줄 바꿈 활성화 여부 (Line Wrap)
- **마인드맵 세부 설정**:
  - 기본 노드 색상 테마
  - 노드 간 연결선 스타일 (직선, 베지에 곡선 등)
- **설정 영구 저장**: 설정을 변경하면 앱이 재부팅되어도 유지되도록 로컬 스토리지 또는 OS 홈 디렉터리에 JSON 형태로 자동 보존.

## 3. 기술적 구현 설계 (FSD 아키텍처)
- **Shared Layer (`fs.ts` 또는 `@tauri-apps/plugin-store`)**:
  - 전역 환경설정을 보관하는 파일(`settings.json`) 입출력 처리.
- **Entities Layer (`settings/store.ts`)**:
  - 설정을 React 전역 상태로 관리하고 각 컴포넌트(CodeMirror 렌더러, SVG 마인드맵 컨테이너 등)가 이를 유연하게 받아 반응하도록 설계.
- **Features Layer (`SettingsModal.tsx`)**:
  - 토글, 셀렉터, 넘버 인풋 등의 컨트롤이 포함된 설정 오버레이 UI 개발.

## 4. 작업 체크리스트
- [ ] 전역 설정 스키마 및 Zustand 스토어 작성
- [ ] Tauri 로컬 저장소 또는 LocalStorage 기반 설정 입출력 레이어 구현
- [ ] 설정 변경 시 실시간으로 CodeMirror 테마 확장자(Extension) 재구성 기능 연결
- [ ] 설정 변경 시 실시간으로 MindView 노드/연결선 렌더링 스타일 즉시 갱신 연동
- [ ] 설정 설정 다이얼로그 모달 UI 구축
