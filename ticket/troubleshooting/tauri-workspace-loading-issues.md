# Troubleshooting: Tauri 앱 초기 로드 및 워크스페이스 상태 동기화 이슈

본 문서는 Devoras 프로젝트 개발 중 발생한 핵심 렌더링 지연 및 상태 꼬임 문제와 그 해결 과정을 기록합니다.

## 1. Tauri 초기 실행 시 하얀 화면 (White Screen Flash) 및 데드락 이슈

### 문제 현상
- 앱을 최초 실행할 때 React가 렌더링되기 전 OS 수준에서 웹뷰 창이 먼저 떠버려 하얀 화면이 눈에 거슬리게 나타남.
- 이를 해결하기 위해 `tauri.conf.json`에서 `"visible": false`로 창을 숨기고, React의 `App.tsx` 초기 렌더링(마운트)이 끝난 후 Rust 커맨드를 호출하여 창을 띄우도록 설정(`Start Hidden & Reveal` 패턴).
- **데드락 발생:** 화면 렌더링 완료를 보장받기 위해 `document.fonts.ready`와 `requestAnimationFrame`을 사용했으나, **OS에서 창이 숨김(Hidden/Invisible) 처리되어 있으면 브라우저 엔진이 리소스 절약을 위해 `requestAnimationFrame`을 영원히 실행하지 않는 특성** 때문에 창이 영원히 뜨지 않는 현상 발생.

### 해결 방법
- `tauri.conf.json`의 `"visible": false` 설정은 유지하여 OS 단의 하얀 화면을 완벽히 차단.
- `App.tsx`에서 데드락을 유발하는 `requestAnimationFrame` 로직을 제거하고, 순수하게 `setTimeout(..., 100)`을 사용하여 React가 레이아웃을 파싱할 최소한의 시간만 대기한 후 창을 노출시키도록 수정.

---

## 2. 워크스페이스 전환 시 로딩 무한 루프 및 상태 꼬임 (TypeError)

### 문제 현상
- 워크스페이스 경로를 변경했을 때, 이전 워크스페이스의 탭과 파일 트리가 여전히 남아있고 파일 탐색기 상단의 새로고침 로딩 아이콘만 무한히 도는 버그 발생.

### 원인 파악
- 로직 꼬임의 핵심은 `documentStore.ts`의 `resetDocumentState` 함수 미구현이었습니다.
- 워크스페이스 이동 시 이전 파일과 탭을 비우기 위해 `useDocumentStore.getState().resetDocumentState()`를 호출했으나, TypeScript `interface`에만 선언되어 있고 Zustand `create` 내부에는 **실제 구현체가 누락**되어 있었습니다.
- 런타임에서 해당 함수 호출 시 `TypeError`가 발생했고, 예외 처리에 의해 다음 단계인 `await get().scanWorkspace()`가 실행되지 못한 채 catch 블록으로 빠지게 되었습니다. 결국 이전 워크스페이스의 상태가 그대로 남고 스캔이 중단되어 로딩이 영원히 도는 결과를 낳았습니다.

### 해결 방법
- `documentStore.ts` 내부에 `resetDocumentState` 로직을 정확히 구현하여 모든 탭(`panes`)과 활성 노드, 공간 데이터 등을 초기화(`[]`, `""` 등)하도록 수정했습니다.

---

## 3. 워크스페이스 전환 방식 개선 (Full Remount ➔ State Reset)

### 문제 현상
- 이전에는 워크스페이스 변경 시 `App.tsx`에서 `<WorkspacePage key={workspacePath} />`와 같이 React의 `key` 속성을 갱신하여 전체 컴포넌트 트리를 강제로 파괴(unmount)하고 다시 생성(remount)했습니다.
- 이 방식은 사이드 이펙트에 의존하게 만들고 깜빡임을 유발하며 불필요한 전체 화면 렌더링 뷰(Loading Overlay)를 도입하게 만드는 등 안티 패턴에 가까웠습니다.

### 해결 방법
- React 트리 파괴에 의존하지 않고, `store` 내부에서 데이터를 비우는 명시적 흐름으로 변경했습니다.
- 워크스페이스 변경 함수(`openWorkspace`) 실행 시:
  1. 즉시 `files` 배열을 비우고 `isLoading`을 `true`로 설정 (화면 트리가 부드럽게 지워지고 로딩 아이콘 표시)
  2. `resetDocumentState()`로 열려있던 기존 문서 탭 제거
  3. `scanWorkspace()`를 직접 명시적으로 대기(`await`)하여 새 파일을 가져옴
- 전체 화면을 덮는 불쾌한 로딩 뷰를 삭제하고 파일 탐색기 내부의 자연스러운 스피너로 대체하여 사용자 경험을 대폭 개선했습니다.

---

## 4. 초기 실행 시 이전 워크스페이스 강제 복원 방지

### 문제 현상
- 앱을 최초 실행 시 브라우저 캐시(`localStorage`)에 저장된 이전 워크스페이스 경로를 자동으로 불러와 로드하는 현상 발생. 
- 이는 의도하지 않은 기획이었습니다.

### 해결 방법
- `workspaceStore.ts` 시작 시 `localStorage.getItem('devoras_workspace_path')`를 불러와 초기값으로 셋팅하는 로직을 제거하고, 항상 `null`로 초기화하도록 변경했습니다.
- 앱을 완전히 껐다 켜면 항상 "폴더 선택하기" 초기 스플래시 화면이 보이도록 정상화했습니다.
