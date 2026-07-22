# [Debug] macOS 신호등(Traffic Light) 창 제어 버튼과 App Header UI 중첩 오류

## 🚨 1. 발생 현상 (Symptom)
* **상황:** macOS 환경에서 무제한 타이틀바 오버레이(`titleBarStyle: Overlay`) 옵션을 설정하여 앱을 실행했을 때, 좌측 최상단 영역의 macOS 신호등 제어 버튼(닫기, 최소화, 최대화)이 앱의 최상단 헤더 영역(`App.tsx`의 `<header>`) 및 로고 텍스트인 "DEVORAS MVP"와 겹쳐서 표시됩니다.
* **구체적 현상:**
  * 신호등 버튼의 둥근 원형 아이콘들이 로고 텍스트 "DEVORAS" 위에 직접 겹쳐 렌더링되어 텍스트 가독성이 훼손되고 미관을 해칩니다.
  * 윈도우 드래그 영역으로 헤더가 작동하지 않아 윈도우 이동을 헤더 영역 드래그로 수행할 수 없습니다.
* **증거 자료:** 사용자가 첨부한 UI 렌더링 스크린샷 참고.

## 🔍 2. 원인 분석 및 유추 (Root Cause Analysis)
* **가설 1:** 최상단 공통 헤더의 좌측 패딩이 신호등 너비(약 78px)를 충분히 확보하지 못해 발생함.
* **확인 결과:** 
  * [App.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/app/App.tsx)의 헤더 마크업:
    ```typescript
    <header className="h-12 bg-darkPanel border-b border-darkBorder flex items-center justify-between px-5 select-none">
    ```
  * `px-5` 패딩은 좌우로 20px의 여백만을 줍니다. 따라서 좌상단에 오버레이 방식으로 강제 삽입되는 macOS 신호등 버튼 영역(약 78px)을 회피하지 못하고 텍스트가 시작됩니다.
  * 또한, 헤더 영역에 `data-tauri-drag-region` 속성이 부재하여 해당 탑 바를 마우스로 드래그해서 앱 창을 이동시킬 수 없습니다.
* **핵심 원인:** 공통 헤더 영역의 좌측에 신호등 버튼 여백(`pl-20`) 미반영 및 Tauri 드래그 리전 미등록.

## 💡 3. 해결 방법 및 조치 (Resolution)
* **조치 내용:**
  * [App.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/app/App.tsx)의 공통 헤더 패딩 설정을 `px-5`에서 `pl-20 pr-5` (또는 `pl-24` 정도로 여유롭게 지정)로 변경하여 텍스트의 시작점을 우측으로 밀어냅니다.
  * 헤더 태그에 `data-tauri-drag-region` 속성을 할당하여 macOS에서 창 이동 시 탑 헤더 바 전체를 드래그 핸들로 쓸 수 있게 수정합니다.
* **수정 코드 제안:**
  * [App.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/app/App.tsx) line 7 수정:
    ```diff
    -      <header className="h-12 bg-darkPanel border-b border-darkBorder flex items-center justify-between px-5 select-none">
    +      <header 
    +        data-tauri-drag-region 
    +        className="h-12 bg-darkPanel border-b border-darkBorder flex items-center justify-between pl-20 pr-5 select-none"
    +      >
    ```

## 🛡️ 4. 재발 방지 및 검증 (Prevention & Verification)
* **검증 방법:** 
  1. `pnpm tauri dev`를 통해 macOS 데스크톱 윈도우 환경에서 앱을 켭니다.
  2. 신호등 버튼 우측으로 "DEVORAS MVP" 텍스트와 라벨 배치가 안전하게 밀려나 겹치지 않고 온전하게 표현되는지 확인합니다.
  3. 헤더 영역을 마우스로 잡고 드래그했을 때 윈도우 창이 정상적으로 드래그 이동되는지 확인합니다.
* **방지 대책:** 무제한 프레임리스 오버레이(`titleBarStyle: Overlay`)를 적용할 때에는 최상단 헤더 및 좌측 상단 영역에 신호등 회피 패딩(`pl-20` 이상)과 윈도우 드래그 가능 영역(`data-tauri-drag-region`)을 필수로 구현할 것을 개발 설계 체크리스트에 포함시킵니다.
