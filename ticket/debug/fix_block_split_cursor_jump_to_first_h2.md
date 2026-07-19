# Ticket: fix_block_split_cursor_jump_to_first_h2
**Status**: COMPLETED
**Target Release**: v0.1.6
**Date**: 2026-07-15

---

## 1. 개요 및 티켓 목표
블록이 여러 개 생성된 상태에서 새 블록을 추가(Enter + `## 새 섹션` 입력)하면 커서가 새로 생성된 블록이 아닌 **첫 번째 H2 블록의 마지막 문자 위치**로 고정되는 버그를 수정한다.

---

## 2. 재현 조건
1. H1 블록 1개 + H2 블록 2개 이상 존재하는 문서 작성.
2. 마지막 H2 블록 본문에서 Enter → `## 새 섹션` 입력.
3. 기대: 커서가 새로 생성된 `## 새 섹션` 블록으로 이동.
4. 실제: 커서가 첫 번째 H2 블록 헤딩 마지막 글자로 이동.

---

## 3. 근본 원인 분석

`BlockEditor.tsx`의 `handleBlockUpdate`에서 신규 블록을 감지하는 로직:
```typescript
const prevIds = new Set(state.blocks.map(b => b.id));
state.setBlocksFromContent(merged);
const newBlock = nextBlocks.find(b => !prevIds.has(b.id)); // ← 항상 첫 H2 반환
```

`setBlocksFromContent` 내부의 구 블록 키 도출이 문제였다:

```typescript
// 버그 코드: 각 블록마다 독립적인 빈 parentStack 사용
currentBlocks.forEach((b) => {
  const key = deriveBlockKey(b.content, [], {}); // ← 항상 부모 경로 없이 단순 키
});
```

| 블록 | 신 블록 키 (누적 parent stack) | 구 블록 키 (독립 계산) |
|---|---|---|
| `# Title` | `"Title"` | `"Title"` ✅ |
| `## Section A` | `"Title/Section A"` | `"Section A"` ❌ |
| `## Section B` | `"Title/Section B"` | `"Section B"` ❌ |

키 불일치로 **H2 블록 전체가 매번 새 ID를 발급**받음 → `find(b => !prevIds.has(b.id))`가 진짜 신규 블록이 아닌 **첫 번째 H2**를 반환.

---

## 4. 수정 내용

```typescript
// 수정 코드: 구 블록도 동일한 순차적 parent stack 누적 방식으로 키 도출
const oldSiblingCountMap: Record<string, number> = {};
const oldParentKeyStack: { level: number; key: string }[] = [];

currentBlocks.forEach((b) => {
  const key = deriveBlockKey(b.content, oldParentKeyStack, oldSiblingCountMap);
  const parsed = parseHeadingLine(b.content.split('\n')[0]);
  if (parsed) {
    while (oldParentKeyStack.length > 0 &&
           oldParentKeyStack[oldParentKeyStack.length - 1].level >= parsed.level) {
      oldParentKeyStack.pop();
    }
    oldParentKeyStack.push({ level: parsed.level, key });
  }
  if (!existingByKey.has(key)) existingByKey.set(key, b);
});
```

이제 구/신 블록 키가 동일하게 도출되어, 기존 H2 블록은 ID가 보존되고 진짜 신규 블록만 새 ID를 받음 → 커서가 정확히 신규 블록으로 이동.

---

## 5. 관련 파일 변경 목록
- **MODIFY**:
  - [block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [package.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/package.json)
