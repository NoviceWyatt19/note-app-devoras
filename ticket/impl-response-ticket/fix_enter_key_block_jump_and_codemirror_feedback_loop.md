# Ticket: fix_enter_key_block_jump_and_codemirror_feedback_loop
**Status**: COMPLETED
**Target Release**: v0.1.2
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표

v0.1.2 블록 슬라이싱 정책 전환 이후 발견된 에디터 사용성 버그 두 가지를 수정한다.
1. 블록 내에서 Enter를 입력하면 다음 블록으로 커서가 넘어가는 오류.
2. 블록 내에서 일반 문자를 입력할 때마다 커서가 다음 블록의 헤딩 끝 위치로 점프하는 오류 (Zustand stale 클로저 + CodeMirror dispatch 피드백 루프).

## 2. 장애 진단 및 분석

### A. Enter 키로 다음 블록으로 넘어가는 버그
- **원인**: CodeMirror 커스텀 키맵에 구(舊) 단락 기반 분할 정책의 잔재인 `Enter` → `onSplit(from)` 핸들러가 여전히 등록되어 있었습니다.
- H1/H2 슬라이싱 정책으로 전환된 이후 Enter는 블록 내 일반 개행으로만 동작해야 하는데, 이 핸들러가 Enter를 완전히 가로채어 `splitBlock`을 강제 실행했습니다.

### B. 일반 문자 입력 시 커서가 다음 블록 헤딩 끝으로 점프하는 버그
이 버그는 **3개의 결함이 연쇄**하여 발생했습니다:

1. **Stale 클로저 (주 원인)**
   - `handleBlockUpdate` 함수가 React 컴포넌트의 훅 클로저에서 `blocks`와 `getMergedContent`를 참조합니다.
   - Zustand의 `set()`은 동기적이지만 React의 re-render는 배치 비동기입니다. 따라서 클로저에 캡처된 `blocks.length`는 이미 무효화된 이전 렌더의 값이고, `getMergedContent()`도 `updateBlockContent` 호출 이전의 스냅샷을 반환할 수 있었습니다.
   - 이로 인해 헤딩 개수 비교(`headingCount !== blocks.length`)가 잘못 평가되어 불필요한 `setBlocksFromContent` 재호출이 발생하고, `activeBlockId`와 `focusOffset`이 비정상적으로 갱신되었습니다.

2. **인덱스 기반 ID 보존의 취약성**
   - `setBlocksFromContent`가 `currentBlocks[idx]` 인덱스 순서로 기존 블록 ID를 재사용하는 방식이었습니다. 블록이 중간에 삽입되거나 순서가 바뀌면 ID 매핑이 어긋나 엉뚱한 블록이 활성 상태를 이어받는 문제가 내재되어 있었습니다.

3. **CodeMirror dispatch 피드백 루프**
   - `block.content`가 변경될 때 발화하는 `useEffect([block.content])`가 `view.dispatch(changes)`를 호출합니다.
   - 이 dispatch가 `updateListener`의 `update.docChanged: true`를 재발화시켜 `onUpdate` → `handleBlockUpdate`가 재진입하는 루프가 성립했습니다.
   - 루프 재진입 시 직전 헤딩 분리로 설정된 `focusOffset`(헤딩 끝 위치)이 남아있는 상태이므로, 다음 블록에 커서가 점프하는 증상이 나타났습니다.

## 3. 해결책 및 구현 내용

### A. Enter 키맵 완전 제거
- [project/src/widgets/BlockEditor/ui/BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)의 `blockKeymap`에서 `Enter` 핸들러를 제거했습니다.
- Enter는 이제 CodeMirror의 기본 동작(`defaultKeymap`)에 의해 블록 내 단순 개행으로만 처리됩니다.
- 연관된 `onSplit` prop, `handleSplit` 핸들러, `splitBlock` 스토어 참조를 모두 정리하여 코드 부채를 해소했습니다.

### B. Stale 클로저 제거 — `getState()` 직접 접근으로 전환
- `handleBlockUpdate`의 모든 스토어 접근을 `useBlockStore.getState()`로 교체했습니다:
  ```typescript
  const handleBlockUpdate = (id: string, text: string) => {
    useBlockStore.getState().updateBlockContent(id, text);
    const state = useBlockStore.getState();   // 항상 최신 상태
    const merged = state.getMergedContent();
    // ...
    if (headingCount !== state.blocks.length) { ... }
  };
  ```
- Zustand `set()`은 동기적이므로 `updateBlockContent` 직후 `getState()`는 항상 최신 값을 반환합니다.

### C. 인덱스 → 헤딩 첫 줄 키 기반 ID 보존으로 교체
- [project/src/entities/block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)의 `setBlocksFromContent`에서 ID 보존 로직을 재작성했습니다:
  ```typescript
  const headingKeyOf = (text: string) => text.split('\n')[0]; // 첫 줄 = 헤딩 텍스트
  const existingByKey = new Map<string, EditorBlock>();
  currentBlocks.forEach(b => {
    const key = headingKeyOf(b.content);
    if (!existingByKey.has(key)) existingByKey.set(key, b);
  });
  // 새 콘텐츠 배열을 순회하며 헤딩 텍스트가 일치하면 기존 ID 재사용
  ```
- 블록이 중간에 삽입되어 인덱스가 밀려도, 헤딩 텍스트가 동일한 기존 블록의 ID를 그대로 유지합니다.

### D. CodeMirror dispatch 피드백 루프 차단 — `Transaction.userEvent` 어노테이션
- 외부에서 에디터 콘텐츠를 동기화하는 `useEffect`의 `view.dispatch`에 `Transaction.userEvent.of('external')` 어노테이션을 붙였습니다:
  ```typescript
  view.dispatch({
    changes: { from: 0, to: currentDoc.length, insert: block.content },
    annotations: [Transaction.userEvent.of('external')],
  });
  ```
- `updateListener`에서 이 어노테이션을 감지하여 `onUpdate` 호출을 차단합니다:
  ```typescript
  const isExternal = update.transactions.some(
    tr => tr.annotation(Transaction.userEvent) === 'external'
  );
  if (update.docChanged && !isExternal) { onUpdate(...); }
  ```
- 외부 동기화 dispatch는 `docChanged`를 발화해도 `handleBlockUpdate`로 전파되지 않으므로 피드백 루프가 원천 차단됩니다.

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [project/src/entities/block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [project/src/widgets/BlockEditor/ui/BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)
