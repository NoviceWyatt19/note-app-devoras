---

## 1. 이전에 해결한 한글 입력 오류 (직접 원인과 수정 내용)

* **증상**: 한글 조합 중 백스페이스를 누르면 자모 단위(예: '각' → '가')로 분리 삭제되지 않고, 미완성 글자 전체가 통째로 지워지는 현상.
* **원인**: `BlockEditor.tsx` 내 `EditorView.domEventHandlers`에 작성된 `keydown` 핸들러에서 `event.isComposing` 또는 `event.keyCode === 229`일 때 `return true;`를 반환하고 있었습니다. CodeMirror 6 API 스펙상 `true` 반환은 `event.preventDefault()`를 강제 실행하는데, macOS WebKit 환경에서 활성화된 IME 이벤트에 `preventDefault()`가 걸리면 OS가 한글 조합 상태를 취소(Abort)하고 미완성 글자를 통째로 지워버렸습니다.


* **해결**: `domEventHandlers` 내부의 `keydown` 핸들러를 완전히 삭제했습니다. 이미 `blockKeymap`에서 조합 중(`view.composing`)일 때 `return false;`를 반환하여 CodeMirror의 개입을 막고 있었으므로, 브라우저 네이티브 IME에 백스페이스 처리를 맡기도록 바로잡았습니다.



---

## 2. 현재 프로젝트의 구조상 문제점 (간헐적 렉 및 OS 통신 오류의 원인)

* **Tauri (WKWebView) + macOS IME의 민감성**: Electron(Chromium)과 달리 Tauri는 macOS 내장 WebKit을 활용합니다. 앱의 메인 UI 스레드가 찰나라도 바빠서 유휴(Idle) 상태를 놓치면, macOS IME 데몬 간 Mach Port IPC 통신(`IMKCFRunLoopWakeUpReliable`) 에러가 터지며 키 입력 신호가 드랍됩니다.
* **매 키입력마다 실행되는 전체 문서 정규식 스캔**: `BlockEditor.tsx`의 `handleBlockUpdate`는 글자 하나가 입력될 때마다 `getMergedContent()`로 전체 블록을 하나로 합친 뒤, 전체 줄을 `split('\n')`하고 루프를 돌며 코드 펜스 및 헤딩(`#`, `##`) 정규식 검사를 전체 문서 대상으로 수행합니다.


* **MindView 마인드맵 재계산 및 SVG 리렌더링 부하**: `updateContent` 디바운스(150ms) 후 `parseMarkdown`을 수행하여 마인드맵 노드 좌표를 재계산합니다. 특히 `WorkspacePage.tsx`에서 마인드맵 패널이 열려 있는 경우, 타이핑 도중 주기적으로 `MindView.tsx`의 SVG 캔버스 전체가 리렌더링되면서 메인 스레드를 점유합니다.



---

## 3. 구조적 최적화 해결 방안

### ① `handleBlockUpdate` Early Return 가드 추가

* 타이핑 중인 현재 블록 텍스트에 `#` 문자가 포함되지 않았고 블록 개수에 변화가 없다면, `getMergedContent()`와 전체 문서 정규식 스캔을 완전히 건너뛰도록 처리합니다.


* 일반 텍스트 입력 시에는 해당 블록의 내용만 Zustand 스토어에 빠르게 업데이트하고 종료하여 메인 스레드 연산을 최소화합니다.



### ② MindView 파싱 및 리렌더링 지연 처리

* `isMindViewOpen` 상태가 `false`일 때는 `updateContent`에서 마인드맵 노드 파싱 및 좌표 계산을 수행하지 않도록 비활성화합니다.


* 마인드맵 패널이 열려 있을 때도 타이핑 중 디바운스 타임아웃을 150ms에서 **300ms~500ms**로 늘려, 사용자가 입력하는 동안에는 메인 스레드가 유휴 상태를 유지하도록 보장합니다.



### ③ Rust 백엔드 스레드 분리 점검

* `saveFile`이나 메타데이터 파일 I/O 실행 시 Rust 단의 메인 UI 스레드를 블로킹하지 않도록 비동기 스레드(`tokio::spawn` / `spawn_blocking`)로 처리되고 있는지 확인합니다.