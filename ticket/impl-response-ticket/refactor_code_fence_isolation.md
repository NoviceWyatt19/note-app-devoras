# Ticket: refactor_code_fence_isolation
**Status**: COMPLETED
**Target Release**: v0.1.3
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표
마크다운 코드 블록(` ``` ` / `~~~`) 내부에 작성된 헤딩 주석(예: `# heading`)이 마인드맵 노드 및 에디터 블록 분할 경계로 오인되는 취약점을 해소한다. parser, block store, BlockEditor 세 곳에 동일한 코드 펜스 추적 로직을 일관성 있게 적용한다.

---

## 2. 문제 원인
- `parser.ts`의 헤딩 정규식(`^(#{1,6})\s+(.+)$`)이 파일 전체 라인에 단순 매핑되어 코드 블록 내부 헤딩도 마인드 노드로 추출됨.
- `block/model/store.ts`의 `setBlocksFromContent`도 동일한 단순 매핑으로 코드 블록 내 헤딩에서 블록 분할이 발생.
- `BlockEditor.tsx`의 `handleBlockUpdate` 헤딩 카운팅도 코드 블록을 무시하지 않아 슬라이싱 판단이 틀림.

---

## 3. 구현 상세

### A. parser.ts — `insideCodeFence` 상태 추가
```typescript
let insideCodeFence = false;
lines.forEach((line) => {
  if (/^(`{3,}|~{3,})/.test(line)) {
    insideCodeFence = !insideCodeFence;
    return;
  }
  if (insideCodeFence) return; // 펜스 내부 라인 무시
  // ... 헤딩 파싱 로직
});
```

### B. block/model/store.ts — `setBlocksFromContent` 펜스 가드
```typescript
let insideCodeFence = false;
lines.forEach((line) => {
  if (/^(`{3,}|~{3,})/.test(line)) {
    insideCodeFence = !insideCodeFence;
    currentBlockLines.push(line);
    return;
  }
  if (!insideCodeFence && (line.startsWith('# ') || line.startsWith('## '))) {
    // 블록 경계 처리
  }
  currentBlockLines.push(line);
});
```

### C. BlockEditor.tsx — `handleBlockUpdate` 헤딩 카운팅 펜스 가드
```typescript
let fenceActive = false;
lines.forEach((line) => {
  if (/^(`{3,}|~{3,})/.test(line)) { fenceActive = !fenceActive; return; }
  if (!fenceActive && (line.startsWith('# ') || line.startsWith('## '))) headingCount++;
});
```

---

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [parser.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts)
  - [block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)
  - [package.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/package.json)
