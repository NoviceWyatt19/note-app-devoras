# Ticket: refactor_20260720_032225_split_block_dead_code
**Status**: TODO
**Target Release**: v0.2.8
**Date**: 2026-07-20

---

## 1. 개요 및 티켓 목표
`useBlockStore` 스토어와 인터페이스에 잔존하고 있는 미사용 메서드 `splitBlock` 데드 코드를 제거하여 코드 베이스를 깔끔하게 정리한다.

## 2. 배경 및 원인
- 이전에 Enter 키 입력 시 블록을 분할하는 기능이 CodeMirror 피드백 루프 및 사용성 문제로 제거(`fix_enter_key_block_jump_and_codemirror_feedback_loop` 티켓 작업)되었습니다.
- 이에 따라 `BlockEditor.tsx`를 포함한 모든 곳에서 `splitBlock` 호출부가 제거되었으나, `store.ts` 및 인터페이스 정의에는 데드 코드로 남아 있어 정리(Cleanup)가 필요합니다.

## 3. 리팩터링 상세
* [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts) 파일 수정:
  * `BlockState` 인터페이스 선언에서 `splitBlock: (id: string, cursorOffset: number) => void;` 제거
  * `useBlockStore` 스토어 구현체 내부에서 `splitBlock: (id, cursorOffset) => { ... }` 메서드 정의 및 로직 완전 삭제

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
