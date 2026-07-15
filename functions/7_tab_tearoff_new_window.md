# Feature Ticket: 7. 탭 드래그 앤 드롭 분리(Tear-off) 및 새 창 생성
**Status**: PLANNED
**Target Release**: v0.6.0
**Priority**: Low
**Date**: 2026-07-15

---

## 1. 개요 및 기능 목표
에디터 화면 상단의 문서 탭을 드래그하여 앱 창 바깥으로 떨어뜨리면(Tear-off Drop), Tauri 멀티 윈도우 API를 사용하여 해당 문서를 연 채로 독립된 새 데스크톱 창(Window)을 동적으로 생성 및 분리한다.

## 2. 요구 사항 및 유스케이스
- **탭 드래그 외부 감지**: 탭 드래그 시 윈도우 경계를 벗어난 드롭 이벤트를 정확하게 감지.
- **새 창(Window) 동적 빌드**: Tauri의 `@tauri-apps/api/window`를 이용하여 서브 윈도우 생성. 해당 서브 윈도우는 대상 파일의 경로를 파라미터로 로드.
- **실시간 데이터 동기화**: 메인 윈도우와 서브 윈도우가 동일한 파일을 열고 있을 때 한쪽 창의 편집 사항이 다른 쪽 창에 실시간으로(또는 파일 저장 이벤트 시 즉각) 충돌 없이 동기화되어야 함.

## 3. 기술적 구현 설계 (FSD 아키텍처)
- **Shared Layer (`window.ts`)**:
  - `spawnNewWindow(filePath: string): Promise<void>` 구현 (Tauri WebviewWindow 빌더 연동).
- **Widgets Layer (`TabGroup.tsx`)**:
  - HTML5 Drag and Drop API 또는 `react-dnd`를 활용하여 드래그 중인 탭이 브라우저 창(Window)을 벗어나는 `dragend` 위치(좌표) 계산 처리.
- **Entities Layer (`document/store.ts`)**:
  - 파일 변경 사항 이벤트를 Tauri IPC(Emit/Listen)를 통해 다중 창 간 상호 전파하는 동기화 이벤트 버스 구축.

## 4. 작업 체크리스트
- [ ] HTML5 drag and drop 외부 드롭 감지 로직 구현
- [ ] Tauri WebviewWindow 기반의 서브 창 동적 스폰 헬퍼 코드 구축
- [ ] 새 윈도우 인스턴스 전용 초기화 뷰 라우팅 경로 세팅
- [ ] 다중 윈도우 간 상태 데이터 실시간 동기화용 Tauri Event Bus 통합
- [ ] 멀티 모니터 환경에서 창 분리 및 병렬 편집 사용성 검증
