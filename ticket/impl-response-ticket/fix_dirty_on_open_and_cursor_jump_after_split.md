# Ticket: fix_dirty_on_open_and_cursor_jump_after_split
**Status**: COMPLETED
**Target Release**: v0.1.2
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표

v0.1.1 → v0.1.2 전환 과정에서 발견된 에디터 사용성 버그 세 가지를 수정한다.
1. 파일을 열자마자 저장되지 않은 변경 사항(`isDirty`)이 발생하는 오류.
2. H1/H2 헤딩 입력으로 블록이 분리될 때 커서가 신규 블록으로 이동하지 않는 오류.
3. H1/H2 헤딩으로 블록 분리 후 커서 위치가 헤딩 접두사(`# `, `## `) 앞에 놓이는 오류.

## 2. 장애 진단 및 분석

### A. 파일 열기만 해도 dirty 상태가 되는 버그
- **진단**: 파일 선택 → `loadFile` → `setBlocksFromContent` → CodeMirror 인스턴스 마운트
- **원인**: CodeMirror의 `updateListener`는 `EditorState.create()` 호출(초기화) 시점에도 `update.docChanged: true`를 발화합니다. 이 초기화 이벤트가 `onUpdate` → `updateContent` → `isDirty: true` 경로를 실행해, 사용자가 아무것도 입력하지 않았음에도 파일이 수정된 것처럼 처리되었습니다.
- **핵심 원칙 위반**: "사용자가 실제로 내용을 바꿨을 때만 dirty를 올린다"는 원칙이 스토어 레벨에서 지켜지지 않고 있었습니다.

### B. 블록 분리 후 커서가 신규 블록으로 이동하지 않는 버그
- **진단**: H1/H2 헤딩 입력 → `handleBlockUpdate` → 헤딩 수 불일치 감지 → `setBlocksFromContent` 호출 → 새 블록 생성. 그러나 `activeBlockId`가 이전 블록을 그대로 가리켜 포커스가 이동하지 않음.
- **원인**: `setBlocksFromContent` 호출 이후 "어느 블록이 새로 생겼는지"를 추적하는 로직이 없어 신규 블록에 `focusBlock`이 호출되지 않았습니다.

### C. 분리된 블록의 커서가 헤딩 접두사 앞에 위치하는 버그
- **원인**: 신규 블록 포커스 시 `focusBlock(newBlock.id, 0)`으로 offset `0`을 지정하여 커서가 `# ` 또는 `## ` 앞(문서 시작 위치)에 놓였습니다.

## 3. 해결책 및 구현 내용

### A. `updateContent` 내용 동일성 가드 추가
- [project/src/entities/document/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts)의 `updateContent` 액션에 아래 가드를 추가했습니다:
  ```typescript
  const hasChanged = content !== rawContent;
  set({ rawContent: content, nodes: alignedNodes, isDirty: hasChanged });
  ```
- 들어온 내용이 디스크에서 읽은 원문(`rawContent`)과 동일하면 `isDirty`를 올리지 않습니다. CodeMirror 초기화 시 발화하는 `docChanged` 이벤트가 전파되어도 dirty가 켜지지 않습니다.

### B. 신규 블록 ID 추적 및 자동 포커스 이동
- [project/src/widgets/BlockEditor/ui/BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)의 `handleBlockUpdate`에서 re-slice 직전 기존 블록 ID 집합을 스냅샷(`prevIds`)으로 저장합니다.
- `setBlocksFromContent` 완료 후 이전에 없던 ID를 가진 블록(`newBlock`)을 특정하고, `setTimeout(0)` 지연 후 `focusBlock`을 호출합니다 (지연은 새 CodeMirror 인스턴스가 DOM에 마운트된 후 포커스를 잡기 위함):
  ```typescript
  const prevIds = new Set(state.blocks.map(b => b.id));
  state.setBlocksFromContent(merged);
  const newBlock = useBlockStore.getState().blocks.find(b => !prevIds.has(b.id));
  if (newBlock) setTimeout(() => focusBlock(newBlock.id, headingLineEnd), 0);
  ```

### C. 헤딩 줄 끝으로 커서 오프셋 계산
- 신규 블록 포커스 시 첫 번째 줄 바꿈(`\n`) 위치를 찾아 헤딩 텍스트의 끝 offset을 계산합니다:
  ```typescript
  const firstNewline = newBlock.content.indexOf('\n');
  const headingLineEnd = firstNewline === -1 ? newBlock.content.length : firstNewline;
  focusBlock(newBlock.id, headingLineEnd);
  ```
- 이제 `## 새 섹션` 형태의 헤딩을 입력해 블록이 분리되면 커서가 자연스럽게 헤딩 텍스트 끝에 위치합니다.

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [project/src/entities/document/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts)
  - [project/src/widgets/BlockEditor/ui/BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)
