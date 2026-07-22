# Ticket: refactor_20260720_032225_set_blocks_parent_stack_dry
**Status**: TODO
**Target Release**: v0.2.8
**Date**: 2026-07-20

---

## 1. 개요 및 티켓 목표
`store.ts` 내 `setBlocksFromContent` 함수에서 새로운 블록들의 키를 도출하는 루프와 기존 블록들의 키를 도출하는 루프 간 중복 코드를 제거하여 DRY(Don't Repeat Yourself) 원칙을 준수하고 유지보수성을 향상시킨다.

## 2. 문제 원인
- `setBlocksFromContent` 메서드 내부에 `deriveBlockKey` 호출 및 parent stack의 `pop`/`push`를 제어하는 정형화된 루프가 `newKeys`를 뽑을 때(L97~111)와 `existingByKey`를 만들 때(L121~137) 중복해서 작성되어 있습니다.
- 로직이 물리적으로 두 군데 흩어져 있어, 헤딩 파싱 방식이나 트리 깊이 탐색 규칙이 변경될 때 두 곳 모두를 직접 고쳐야 하므로 잠재적인 휴먼 에러를 유발합니다.

## 3. 리팩터링 상세
* [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts) 파일 수정:
  * 파일 내에 블록 배열을 인풋으로 받아 parent stack과 sibling count map을 순차 누적 계산하며 canonical key 배열을 추출하는 헬퍼 함수를 추가합니다:
    ```typescript
    function deriveKeysWithParentStack(
      items: Array<{ content: string }>
    ): string[] {
      const sibMap: Record<string, number> = {};
      const parentStack: { level: number; key: string }[] = [];
      return items.map(item => {
        const key = deriveBlockKey(item.content, parentStack, sibMap);
        const parsed = parseHeadingLine(item.content.split('\n')[0]);
        if (parsed) {
          while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= parsed.level) {
            parentStack.pop();
          }
          parentStack.push({ level: parsed.level, key });
        }
        return key;
      });
    }
    ```
  * `setBlocksFromContent` 내부의 `newKeys` 생성 루프와 `currentBlocks` 순회 루프를 이 `deriveKeysWithParentStack` 헬퍼 함수를 호출하도록 변경하고 중복되는 stack pop/push 코드를 제거합니다.

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
