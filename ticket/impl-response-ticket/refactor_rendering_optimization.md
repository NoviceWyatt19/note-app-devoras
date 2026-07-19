# Ticket: refactor_rendering_optimization
**Status**: COMPLETED
**Target Release**: v0.1.5
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표
블록 수가 늘어날수록 모든 `BlockEditorItem`이 불필요하게 리렌더링되는 성능 문제를 해결한다. `React.memo`, Zustand 좁은 셀렉터, `focusOffset` prop 스코핑의 세 가지 방법으로 리렌더링 범위를 최소화한다.

---

## 2. 문제 원인
- `BlockEditor`가 Zustand 전체 상태를 구독하여, 어느 한 블록의 상태가 바뀌면 전체 블록 목록이 리렌더링.
- `BlockEditorItem`에 `React.memo`가 없어 props 변경 여부와 무관하게 항상 재렌더링.
- `focusOffset`이 스토어 루트에 저장되어, 한 블록의 커서 이동이 전체 블록의 props 변경을 유발.

---

## 3. 구현 상세

### A. `React.memo` 적용
```typescript
// BlockEditorItem을 React.memo로 래핑
export const BlockEditorItem = React.memo(({ id, content, isFocused, focusOffset, ... }) => {
  ...
}, (prev, next) => prev.content === next.content && prev.isFocused === next.isFocused && prev.focusOffset === next.focusOffset);
```

### B. Zustand 좁은 셀렉터 분리
```typescript
// BlockEditor.tsx — 블록 ID 배열만 구독 (순서 변경 시에만 리렌더)
const blockIds = useBlockStore((s) => s.blocks.map((b) => b.id));

// BlockEditorItem — 자신의 content만 구독
const content = useBlockStore((s) => s.blocks.find((b) => b.id === id)?.content ?? '');
```

### C. `focusOffset` prop 스코핑
- `focusOffset`을 스토어 루트 대신 `activeBlockId + focusOffset` 쌍으로 관리.
- `isFocused === false`인 블록에는 `focusOffset`을 전달하지 않아 불필요한 prop 변경 차단.

---

## 4. 성능 효과
- 블록 10개 기준, 한 블록 편집 시 리렌더링 대상: **10개 → 1개**
- `focusOffset` 변경 시 리렌더링 대상: **전체 → 활성 블록 1개**

---

## 5. 관련 파일 변경 목록
- **MODIFY**:
  - [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)
  - [block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [package.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/package.json)
