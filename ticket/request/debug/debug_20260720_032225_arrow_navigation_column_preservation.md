# [Debug] 블록 간 방향키(ArrowUp, ArrowDown) 이동 시 커서 가로 컬럼(Column) 위치 미보존 오류

## 🚨 1. 발생 현상 (Symptom)
* **상황:** 마크다운 에디터에서 여러 블록이 존재할 때, 방향키(`ArrowUp`, `ArrowDown`)를 이용해 위/아래 블록으로 포커스를 전이시키면, 원래 작성 중이던 줄의 가로 컬럼(Column) 위치가 유지되지 않고 무조건 이전 블록의 맨 끝 또는 다음 블록의 맨 처음(0)으로 커서가 리셋되어 이동합니다.
* **구체적 현상:**
  * 이전 블록으로 올라갈 때(`ArrowUp`): 이전 블록 내용의 맨 마지막 줄 끝(`content.length`)으로 커서가 강제 고정됩니다.
  * 다음 블록으로 내려갈 때(`ArrowDown`): 다음 블록의 맨 처음(`0`)으로 강제 고정됩니다. 헤딩 블록(`## Heading`)의 맨 첫 문자(`|## Heading`) 앞으로 커서가 붙기 때문에 타이핑 연속성에 큰 방해가 되며, 실수로 Backspace를 누르면 원치 않는 블록 병합이 쉽게 일어납니다.

## 🔍 2. 원인 분석 및 유추 (Root Cause Analysis)
* **상황 분석:**
  * [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)의 `onFocusPrev`와 `onFocusNext` 선언:
    ```typescript
    onFocusPrev={() => {
      if (index > 0) focusBlock(blocks[index - 1].id, blocks[index - 1].content.length);
    }}
    onFocusNext={() => {
      if (index < blocks.length - 1) focusBlock(blocks[index + 1].id, 0);
    }}
    ```
  * 위 코드에서 볼 수 있듯이 이동 타깃의 오프셋을 각각 이전 블록의 `content.length`와 다음 블록의 `0`으로 하드코딩해서 고정 전달하고 있습니다.
  * 또한 CodeMirror `run(view)` keymap 핸들러에서도 단지 `line.number === 1` 또는 `line.number === totalLines`만 확인하고 바로 `onFocusPrev()`, `onFocusNext()`를 인자 없이 호출해 가로 컬럼 인덱스 정보를 유실시킵니다.
* **핵심 원인:** 위/아래 블록 전이 시, 현재 행에서의 가로 오프셋(컬럼 위치)을 구하여 다음 블록의 첫 행 또는 이전 블록의 마지막 행 내 동일 컬럼 위치로 맵핑해 주지 않고 `0`과 `length`로 일방 리셋시키는 설계 결함.

## 💡 3. 해결 방법 및 조치 (Resolution)
* **조치 내용:**
  1. `run(view)` 핸들러에서 이동 직전 커서의 가로 오프셋(현재 행 시작점 기준의 오프셋)을 계산해 `onFocusPrev(col)`, `onFocusNext(col)`에 인자로 넘겨줍니다.
  2. `BlockEditor.tsx`에서 이 컬럼 인자를 받아 이동 대상 블록의 해당 라인(이전 블록의 마지막 행 또는 다음 블록의 첫 행)에서의 실제 오프셋을 역산한 후 `focusBlock`에 전달합니다.
* **수정 코드 제안:**
  * CodeMirror keymap `run(view)` 수정:
    ```typescript
    key: 'ArrowUp',
    run: (view) => {
      const { from } = view.state.selection.main;
      const line = view.state.doc.lineAt(from);
      if (line.number === 1) {
        const col = from - line.from; // 가로 컬럼 위치
        callbacksRef.current.onFocusPrev(col);
        return true;
      }
      return false;
    }
    ```
    ```typescript
    key: 'ArrowDown',
    run: (view) => {
      const { from } = view.state.selection.main;
      const line = view.state.doc.lineAt(from);
      const totalLines = view.state.doc.lines;
      if (line.number === totalLines) {
        const col = from - line.from; // 가로 컬럼 위치
        callbacksRef.current.onFocusNext(col);
        return true;
      }
      return false;
    }
    ```
  * `BlockEditor.tsx`에서 핸들러 수정:
    ```typescript
    onFocusPrev={(col) => {
      if (index > 0) {
        const prevBlock = blocks[index - 1];
        // 이전 블록의 마지막 행을 찾고, 그 행의 시작점 + col 위치 계산
        const lines = prevBlock.content.split('\n');
        const lastLineLen = lines[lines.length - 1].length;
        const targetCol = Math.min(col, lastLineLen);
        const precedingContentLen = prevBlock.content.length - lastLineLen;
        focusBlock(prevBlock.id, precedingContentLen + targetCol);
      }
    }}
    onFocusNext={(col) => {
      if (index < blocks.length - 1) {
        const nextBlock = blocks[index + 1];
        // 다음 블록의 첫 행 길이 내에서 컬럼 매핑
        const firstLineLen = nextBlock.content.split('\n')[0].length;
        const targetCol = Math.min(col, firstLineLen);
        focusBlock(nextBlock.id, targetCol);
      }
    }}
    ```

## 🛡️ 4. 재발 방지 및 검증 (Prevention & Verification)
* **검증 방법:**
  1. 두 개 이상의 블록에서 임의의 글자(예: 5번째 글자 뒤)를 편집하던 중 `ArrowDown` 또는 `ArrowUp`을 눌러 인접 블록으로 이동시킵니다.
  2. 커서가 인접 블록의 시작행/마지막행의 동일한 5번째 글자 부근으로 오차가 보정되어 맵핑되는지 확인합니다.
* **방지 대책:** 다중 컴포넌트 텍스트 뷰 구조에서 방향키 포커스 체인 구성 시, 행 단위 전이뿐만 아니라 컬럼 위치를 추적/보정하여 이동시킴으로써 사용자 경험(UX) 품질을 유지합니다.
