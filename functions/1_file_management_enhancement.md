# Feature Ticket: 1. 파일 탐색기 및 파일 관리 강화
**Status**: PLANNED
**Target Release**: v0.2.0
**Priority**: High
**Date**: 2026-07-15

---

## 1. 개요 및 기능 목표
현재 MVP 버전에 구현된 단일 레벨 파일 목록 조회를 넘어, 워크스페이스 내 중첩된 폴더 구조(Tree View)를 시각화하고 파일/폴더의 CRUD(생성, 이름 변경, 이동, 삭제) 기능을 완비한다.

## 2. 요구 사항 및 유스케이스
- **중첩 폴더 구조 지원**: 파일 탐색기에서 하위 폴더를 트리 형태로 확장/축소할 수 있어야 함.
- **폴더 생성**: 탐색기 내 특정 위치 또는 루트에 새 폴더를 생성할 수 있어야 함.
- **이름 변경(Rename)**: 파일 및 폴더의 이름을 인라인 수정할 수 있으며, 이와 연동되어 활성화된 문서 스토어 상태도 갱신되어야 함.
- **삭제(Delete)**: 파일 및 폴더 삭제 시 시스템 휴지통으로 보내거나 경고 팝업 후 영구 삭제함.

## 3. 기술적 구현 설계 (FSD 아키텍처)
- **Shared Layer (`fs.ts`)**: 
  - `createDirectory(dirPath: string): Promise<void>`
  - `renameEntry(oldPath: string, newPath: string): Promise<void>`
  - `removeEntry(path: string, recursive: boolean): Promise<void>`
  - Tauri 및 Mock FSRepository 구현체에 각각 반영.
- **Entities Layer (`workspace/store.ts`)**:
  - 디렉터리 구조를 재귀적으로 스캔하여 트리 노드 배열(`FileEntry[]`)로 변환하고 캐싱하는 상태 관리 구축.
- **Widgets Layer (`FileExplorer.tsx`)**:
  - 트리 컴포넌트 구현 (폴더 접기/펴기 상태 메모리 유지).
  - 우클릭 콘텍스트 메뉴(Context Menu) 추가: "새 파일", "새 폴더", "이름 변경", "삭제".

## 4. 작업 체크리스트
- [ ] Shared FSRepository 인터페이스 확장 및 구현 (Tauri/Mock)
- [ ] 디렉터리 재귀 탐색 및 트리 구조 렌더링용 컴포넌트 개발
- [ ] 파일/폴더 인라인 이름 변경 UX 및 스토어 동기화 구현
- [ ] 삭제 및 폴더 생성 기능 연결 및 팝업 모달 예외 처리
- [ ] macOS 호환 파일 시스템 동작 테스트
