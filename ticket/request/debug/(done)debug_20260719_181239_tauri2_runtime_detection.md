# [Debug] Tauri 2 환경에서 로컬 실행(TauriFileSystem) 대신 웹 실행(MockFileSystem)으로 강제 폴백되는 오류

## 🚨 1. 발생 현상 (Symptom)
* **상황:** Tauri를 사용한 로컬 데스크톱 실행 환경임에도 불구하고, 실제 파일 시스템 API(`TauriFileSystem`) 대신 웹 브라우저용 가상 파일 시스템(`MockFileSystem`)으로 강제 폴백하여 작동하고 있습니다.
* **구체적 현상:**
  * 로컬 디렉터리를 탐색 및 로드하지 못하고 `/mock-workspace` 경로의 Mock 파일 데이터가 노출됩니다.
  * Tauri 데스크톱 클라이언트로 실행했으나 웹 브라우저 기반의 Mock 레이아웃과 데이터가 지속해서 유지되는 현상이 발생합니다.

## 🔍 2. 원인 분석 및 유추 (Root Cause Analysis)
* **가설 1:** 플랫폼 탐지 로직인 `isTauri` 변수가 Tauri 2 환경에서 올바르게 작동하지 않아 `false`로 평가됨.
* **확인 결과:** 
  * [fs.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/api/fs.ts) 파일 최하단에서 Tauri 환경을 감지하는 조건문:
    ```typescript
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
    ```
  * Tauri 2 버전에 들어서며 `window.__TAURI__` 전역 변수는 보안상의 이유 및 경량화 정책으로 인해 기본 설정에서 정의되지 않도록 변경되었습니다. (tauri.conf.json 내에 별도로 `withGlobalTauri: true` 설정을 명시해야만 노출됨)
  * 이로 인해 데스크톱 앱 내에서 실행 중임에도 `window.__TAURI__ === undefined`이 되므로, 자동으로 `MockFileSystem` 객체가 할당되어 웹 데모 모드로 전환되는 문제가 나타났습니다.
* **핵심 원인:** Tauri 2 기본 사양에 맞지 않는 구형 `isTauri` 감지 로직 적용 및 전역 Tauri 객체 부재.

## 💡 3. 해결 방법 및 조치 (Resolution)
* **조치 내용:**
  * Tauri 2에서 웹뷰 내부에 항상 주입하는 IPC 통신 포트인 `window.__TAURI_INTERNALS__` 객체의 존재 여부를 함께 체크하여 Tauri 2 런타임을 감지할 수 있도록 `isTauri` 로직을 보완합니다.
  * 이렇게 수정하면 Tauri 1(하위 호환)과 Tauri 2 환경을 모두 정상적으로 안정성 있게 감지할 수 있습니다.
* **수정 코드 제안:**
  * [fs.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/api/fs.ts) line 192 수정:
  ```typescript
  // Tauri 1의 __TAURI__ 및 Tauri 2의 __TAURI_INTERNALS__ 검출 조건 결합
  const isTauri =
    typeof window !== 'undefined' &&
    ((window as any).__TAURI__ !== undefined ||
      (window as any).__TAURI_INTERNALS__ !== undefined);
  ```

## 🛡️ 4. 재발 방지 및 검증 (Prevention & Verification)
* **검증 방법:** 
  1. 수정 후 `pnpm tauri dev` 명령을 통해 Tauri 앱을 구동합니다.
  2. 구동 시 가상 폴더(`/mock-workspace`)가 아닌 실제 로컬 파일 선택기(Dialog)가 활성화되는지 확인합니다.
  3. 로컬 마크다운 문서를 열어 실제 로컬 디스크 파일이 성공적으로 읽고 쓰여지는지 확인합니다.
* **방지 대책:** Tauri 환경인지 감지해야 하는 공유 인프라 레이어의 유틸리티 작성 시, Tauri 2 공식 명세서에 준하는 런타임 식별 조건을 준수하여 코드를 작성합니다.
