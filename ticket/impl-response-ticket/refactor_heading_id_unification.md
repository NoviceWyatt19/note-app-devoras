# Ticket: refactor_heading_id_unification
**Status**: COMPLETED
**Target Release**: v0.1.4
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표
마인드맵 노드 ID와 에디터 블록 식별 키가 서로 다른 로직으로 생성되어 좌표 연결이 끊기는 문제를 해결한다. `shared/lib/headingId.ts`에 단일 ID 생성 유틸리티를 만들고, parser와 block store가 이를 공통으로 사용하도록 통합한다.

---

## 2. 문제 원인
- `parser.ts`는 헤딩 텍스트를 그대로 노드 ID로 사용.
- `block/model/store.ts`는 각 블록의 첫 번째 라인 해시를 키로 사용.
- 동일 헤딩 텍스트라도 부모 컨텍스트(sibling count, parent path)에 따라 ID가 달라지는 경우 두 레이어가 서로 다른 키를 생성 → 공간 좌표가 유실됨.

---

## 3. 구현 상세

### A. `shared/lib/headingId.ts` 신규 생성
```typescript
/**
 * Derives a stable, hierarchical key for a heading block.
 * Format: parentKey/headingText[#duplicateIndex]
 */
export function deriveBlockKey(
  blockText: string,
  parentKeyStack: { level: number; key: string }[],
  siblingCountMap: Record<string, number>,
): string { ... }

export function parseHeadingLine(line: string): { level: number; text: string } | null { ... }
```

### B. `parser.ts` — 노드 ID 생성 로직 교체
- `buildHeadingId`를 `deriveBlockKey` + `parseHeadingLine`으로 대체.
- `parentKeyStack`, `siblingCountMap`을 순차적으로 누적하여 계층적 ID 생성.

### C. `block/model/store.ts` — 블록 키 도출 통합
- `setBlocksFromContent`에서 `deriveBlockKey`로 신 블록 키를 도출.
- 기존 블록과의 매칭도 동일 함수 사용 → 마인드 노드 ID = 블록 보존 키.

### D. 좌표 유실 폴백
- `spatial.json`에 저장된 좌표를 로드할 때, 노드 ID가 없으면 인접 좌표 평균으로 폴백 배치.

---

## 4. 관련 파일 변경 목록
- **NEW**:
  - [shared/lib/headingId.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/lib/headingId.ts)
- **MODIFY**:
  - [parser.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts)
  - [block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [package.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/package.json)
