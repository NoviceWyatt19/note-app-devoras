# [Debug] macOS 프레임리스 환경에서 앱 최상단 헤더(Header) 드래그 그랩 영역 부재 오류

## 🚨 1. 발생 현상 (Symptom)
* **상황:** macOS 환경에서 신호등 버튼과의 UI 겹침은 해결되었으나, 앱의 최상단 헤더(Header) 영역을 마우스로 붙잡고 창을 이동시키려고 할 때 그랩(Grab) 및 드래그(Drag) 동작이 작동하지 않아 윈도우를 이동시키기 어렵습니다.
* **구체적 현상:**
  * 앱 최상단의 공통 헤더 바(`h-12` 영역)를 클릭하고 드래그해도 앱 창이 전혀 움직이지 않습니다.
  * 창 이동은 macOS 기본 제공 윈도우 resize border(테두리 극단 영역) 을 통해서만 가능하며, 헤더 영역 전체에서 그랩이 동작하지 않습니다.
  * `data-tauri-drag-region` HTML 속성을 `<header>` 및 자식 요소에 전파해도 여전히 동작하지 않습니다.

## 🔍 2. 원인 분석 및 유추 (Root Cause Analysis)

### 가설 1 (초기): `data-tauri-drag-region` 미적용
* **검증:** 속성 추가 후에도 드래그 불가 → ❌ 원인 아님

### 가설 2 (초기): 자식 요소가 mousedown 이벤트를 가로챔
* **검증:** 모든 자식 `<div>`, `<span>`에 `data-tauri-drag-region` 전파 후에도 동일 증상 → ❌ 원인 아님

### ✅ 확정 원인 (2가지 복합)

**원인 A — `core:window:allow-start-dragging` 권한 누락**
* [capabilities/default.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/src-tauri/capabilities/default.json)에 `"core:default"` 만 등록되어 있었으며, `core:default`는 `window.startDragging()` IPC를 **자동으로 포함하지 않습니다**.
* Tauri 2는 명시적으로 선언되지 않은 IPC 명령을 보안 정책상 **무조건 차단**합니다.
* 결과적으로 `data-tauri-drag-region`이 내부적으로 트리거하는 `startDragging()` 호출이 권한 오류로 조용히 실패했습니다.

**원인 B — 선언적 `data-tauri-drag-region` 단독 방식의 한계**
* Tauri 2에서 `data-tauri-drag-region` 선언적 속성은 권한이 허용된 환경에서도 특정 webview 설정(`titleBarStyle: "Overlay"`)과 함께 사용할 때 이벤트가 무시되는 케이스가 존재합니다.
* **핵심 원인:** IPC 권한 차단(A) + 선언적 속성 단독 방식의 불완전성(B)이 결합된 이중 결함.

## 💡 3. 해결 방법 및 조치 (Resolution)

### 조치 1 — capabilities에 `startDragging` 권한 명시적 등록
* [capabilities/default.json](file:///Users/wyattkim/Desktop/Devoras-Design/project/src-tauri/capabilities/default.json) 수정:
  ```diff
  - "core:default",
  + "core:default",
  + "core:window:allow-start-dragging",
  ```

### 조치 2 — programmatic `startDragging()` 직접 호출 방식으로 전환
* 선언적 속성(`data-tauri-drag-region`)을 유지하면서, `<header>`의 `onMouseDown`에서 `@tauri-apps/api/window`의 `getCurrentWindow().startDragging()`을 **직접 호출**하도록 변경합니다.
* 브라우저(Mock) 환경에서의 충돌 방지를 위해 `isTauri` 가드를 적용하고, dynamic import로 `@tauri-apps/api/window`를 로드합니다.
* [App.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/app/App.tsx) 수정:
  ```typescript
  // 모듈 레벨 — Tauri 2 런타임 감지
  const isTauri =
    typeof window !== 'undefined' &&
    ((window as any).__TAURI__ !== undefined ||
      (window as any).__TAURI_INTERNALS__ !== undefined);

  async function startWindowDrag() {
    if (!isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  }

  // JSX — 헤더에 onMouseDown 핸들러 추가
  <header
    data-tauri-drag-region
    onMouseDown={(e) => { if (e.button === 0) startWindowDrag(); }}
    className="... pl-20 pr-5 select-none cursor-default"
  >
  ```

## 🛡️ 4. 재발 방지 및 검증 (Prevention & Verification)
* **검증 방법:**
  1. `pnpm tauri dev`로 데스크톱 창을 실행합니다.
  2. 최상단 "DEVORAS MVP" 텍스트 및 헤더 내 빈 영역 어느 위치를 클릭·드래그해도 창이 정상 이동됨을 확인합니다. ✅
* **방지 대책:**
  * Tauri 2 창 제어 API(`startDragging`, `minimize`, `close` 등)는 모두 `core:window:allow-*` 형태의 **명시적 capability 권한** 등록이 필요합니다. `core:default`에 포함된다고 가정하지 말 것.
  * 드래그 가능 영역 구현 시 선언적 속성(`data-tauri-drag-region`) 단독보다 **programmatic `startDragging()` 직접 호출**을 병행하는 방식을 표준으로 채택합니다.
  * 향후 헤더에 `<button>` 등 인터랙티브 요소 추가 시, 해당 요소의 `onMouseDown`에 `e.stopPropagation()`을 반드시 추가하여 드래그 핸들러로의 이벤트 버블링을 차단합니다.
