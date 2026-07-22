# Ticket: refactor_20260720_033049_block_state_cursor_srp_unification
**Status**: TODO
**Target Release**: v0.2.8
**Date**: 2026-07-20

---

## 1. 개요 및 티켓 목표
`setBlocksFromContent`의 단일 책임 원칙(SRP) 위반 문제를 해소하여 스토어 역할을 분리하고, 블록 상태 변환 시 발생하는 커서 위치 역산 모델(`absoluteCursorPos`)을 전반적으로 정비 및 일원화한다.

## 2. 배경 및 문제 원인

### A. [R2] `setBlocksFromContent` 내부 커서 관리 로직 잔존 (SRP 위반)
- `setBlocksFromContent`는 순수한 상태 변환(블록 Slicing 및 ID 보존)만을 담당해야 하지만, 내부에 `activeBlockId` 및 `focusOffset` 결정 로직(Case A/B)이 포함되어 있습니다.
- 특히 하격(H2 ➡️ H3 등) 발생 시 `oldIndex - 1` 위치의 끝(`content.length`)으로 커서를 강제 이동시키는 임시 추정치(junction) 로직이 삽입되어 코드 결합도를 높입니다.

### B. [R1] `handleBlockUpdate` 하격 케이스 `absoluteCursorPos` 미적용 가능성
- `handleBlockUpdate` 내부의 `absoluteCursorPos` 계산 및 적용은 `if (newBlock)` 조건문 안에만 감싸져 있어 **승격(H3 ➡️ H1/H2) 케이스에만 실행**되고 있었습니다.
- 하격 발생 시에는 스토어의 불완전한 Case A 로직에 위임되어 사용자가 편집 중이던 위치를 온전히 보존하지 못할 위험이 있습니다.

## 3. 리팩터링 및 검증 상세

### A. 커서 처리 로직의 Unification (단일 위치 일원화)
- `setBlocksFromContent`에서는 `activeBlockId` 및 `focusOffset`을 결정하는 부작용(Case A, Case B 등)을 완전히 제거하고 순수하게 `blocks` 배열 상태만 가공해 반환하도록 격리합니다.
- 대신, 호출자인 `handleBlockUpdate` 내에서 `absoluteCursorPos` 기반의 절대 커서 보정 알고리즘을 항상 실행(승격, 하격, 동일 개수 상태 모두 포함)하도록 일원화합니다.

### 🔍 B. R1 현상에 대한 타 로직 연동 확인 사항 [CRITICAL CHECK]
* **핵심 확인 사항:** R1(하격 시 커서 튐) 버그의 경우, 논리상으로는 버그의 소지가 다분하나 **현재 실제 동작 환경에서는 튀는 현상이 명확히 발현되지 않는 것처럼 보일 수 있습니다.**
* **검증 태스크:** 
  1. 실제 편집 환경에서 H2 헤딩을 H3 헤딩으로 강등할 때, 커서가 이전 블록 끝으로 점프하는지 아니면 원래 위치에 잘 유지되는지 검증합니다.
  2. 만약 정상 작동하고 있다면, React의 렌더링 타이밍, CodeMirror의 자체 selection 복구 메커니즘, 또는 다른 컴포넌트/이벤트 핸들러(예: focusListener 등)에서 이 오류를 간접적으로 가리거나 우회적으로 해결하고 있는지 면밀히 확인해야 합니다.
  3. 다른 은폐 로직이 있다면 이를 파악하고, 일원화된 커서 보정 설계가 도입되었을 때 충돌이나 이중 포커스 업데이트 현상이 발생하지 않도록 조율합니다.

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)
