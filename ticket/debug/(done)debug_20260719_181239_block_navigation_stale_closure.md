# [Debug] 헤딩 블록 간 위/아래 이동 시 포커스 오동작 및 차단 버그

## 🚨 1. 발생 현상 (Symptom)
* **상황:** 마크다운 에디터에서 H1/H2 헤딩 태그로 분리된 블록들이 여러 개 존재할 때, 방향키를 통한 블록 간 포커스 이동이 비정상적으로 동작하거나 아예 작동하지 않습니다.
* **구체적 현상:**
  * 위 방향키(`ArrowUp`)를 눌러 위쪽 블록으로 이동하는 것은 정상적으로 이루어집니다.
  * 아래 방향키(`ArrowDown`)를 눌러 위쪽 블록에서 아래쪽 블록으로 내려가려고 하면 이동이 차단되고 포커스가 이동하지 않습니다.
* **재현 경로:**
  1. H1 또는 H2 헤딩으로 나뉜 에디터 블록이 3개 이상 존재하도록 문서를 작성합니다.
  2. 첫 번째 또는 중간 블록의 마지막 줄로 이동합니다.
  3. 아래 방향키(`ArrowDown`)를 누릅니다.
  4. 아래 블록으로 포커스가 이동하지 않는 현상을 확인합니다.

## 🔍 2. 원인 분석 및 유추 (Root Cause Analysis)
* **가설 1:** CodeMirror의 커스텀 키맵 설정 시 발생한 **React stale closure (클로저 캡처)** 버그.
* **확인 결과:** 
  * [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)에서 개별 `CodeMirrorBlock`을 초기화하는 `useEffect`는 마운트 시 단 한 번만 실행되도록 빈 의존성 배열(`[]`)로 설정되어 있습니다.
  * 이 `useEffect` 내부에서 `blockKeymap`을 생성할 때 props로 넘어온 `onFocusPrev`와 `onFocusNext` 함수를 캡처하여 사용합니다.
  * 하지만 `onFocusPrev`와 `onFocusNext`는 `BlockEditor` 렌더링 시마다 인라인 함수로 매번 새로 생성되며, 내부적으로 최신 `index`와 `blocks` 상태를 참조합니다:
    ```typescript
    onFocusNext={() => {
      if (index < blocks.length - 1) focusBlock(blocks[index + 1].id, 0);
    }}
    ```
  * 결과적으로 CodeMirror의 `ArrowDown` 핸들러는 **마운트 시점의 오래된(stale) `blocks` 스냅샷과 `index`**를 캡처하고 있어, 새로운 블록이 추가되거나 문서 구조가 변경되어도 당시 상태를 기준으로 경계를 계산합니다.
  * 예를 들어 블록이 추가되어 3개가 되었음에도 최초 마운트 시점에 블록이 2개였다면, 2번째 블록의 stale `onFocusNext`는 자신이 마지막 블록이라고 판단하여 `index < blocks.length - 1` (1 < 1) 조건을 통과하지 못해 포커스 이동 동작을 전혀 수행하지 않게 됩니다.
* **핵심 원인:** CodeMirror keymap 정의부에서 React props인 `onFocusPrev`, `onFocusNext`를 직접 참조하여 발생한 stale closure 문제.

## 💡 3. 해결 방법 및 조치 (Resolution)
* **조치 내용:** 
  * `CodeMirrorBlock` 내부에 렌더링 시마다 최신 콜백 props를 동기화하는 mutable `ref`를 도입합니다.
  * CodeMirror keymap의 `run` 함수에서는 직접 props를 참조하는 대신 이 `ref`를 경유하도록 수정하여 stale closure 문제를 원천 해결합니다.
* **수정 코드 제안:**
  * [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)의 `CodeMirrorBlock` 내부 수정:
  ```typescript
  const CodeMirrorBlock = React.memo<CodeMirrorBlockProps>(function CodeMirrorBlock({
    block,
    index,
    isFocused,
    focusOffset,
    onUpdate,
    onMerge,
    onFocusPrev,
    onFocusNext,
    onSelect,
  }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // 최신 콜백을 보관할 ref 생성 및 매 렌더링마다 갱신
    const callbacksRef = useRef({ onFocusPrev, onFocusNext, onMerge, onUpdate });
    useEffect(() => {
      callbacksRef.current = { onFocusPrev, onFocusNext, onMerge, onUpdate };
    });

    useEffect(() => {
      if (!containerRef.current) return;

      const blockKeymap = keymap.of([
        {
          key: 'Backspace',
          run: (view) => {
            const { from, empty } = view.state.selection.main;
            if (empty && from === 0) {
              callbacksRef.current.onMerge();
              return true;
            }
            return false;
          },
        },
        {
          key: 'ArrowUp',
          run: (view) => {
            const { from } = view.state.selection.main;
            const line = view.state.doc.lineAt(from);
            if (line.number === 1) {
              callbacksRef.current.onFocusPrev();
              return true;
            }
            return false;
          },
        },
        {
          key: 'ArrowDown',
          run: (view) => {
            const { from } = view.state.selection.main;
            const line = view.state.doc.lineAt(from);
            const totalLines = view.state.doc.lines;
            if (line.number === totalLines) {
              callbacksRef.current.onFocusNext();
              return true;
            }
            return false;
          },
        },
      ]);
      // ...이하 동일하게 blockKeymap을 state extensions에 등록
  ```

## 🛡️ 4. 재발 방지 및 검증 (Prevention & Verification)
* **검증 방법:** 
  1. H1/H2 태그를 포함하여 다수의 블록을 생성한 뒤 `ArrowDown`을 통해 첫 블록부터 마지막 블록까지 막힘없이 포커스가 이동하는지 확인합니다.
  2. 중간에 새로운 헤딩을 입력해 블록을 쪼갠 뒤에도 정상적으로 방향키 이동이 가능한지 교차 검증합니다.
* **방지 대책:** CodeMirror, Monaco Editor 등 React 라이프사이클 외부에서 독립적으로 이벤트를 처리하는 컴포넌트를 설계할 때는 dynamic props를 직접 클로저에 캡처하지 않고 `useRef`를 거쳐 접근하도록 컴포넌트 설계 가이드를 준수합니다.
