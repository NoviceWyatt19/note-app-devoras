# Session Bridge (세션 인수인계)

## Current Status Summary (최근 수행 작업)
- **현재 버전 / 마일스톤**: v0.4.6 / MVP 이미지 첨부 버그 수정 완료
- **최근 주요 변경점**: 
  - **[Bug Fix #1 — 치명적]** `BlockEditor.tsx` drop 핸들러: macOS Finder 드래그 시 `File.type === ""` 반환으로 이미지 감지 실패 문제 수정 → `isImageFile()` 헬퍼 + `resolveMimeType()` 헬퍼로 확장자 기반 폴백 추가
  - **[Bug Fix #2]** `imageAsset.ts` custom-folder 정책: `subDir=""` 로 인해 파일명만 반환되던 버그 수정 → 절대 경로(`targetDir/fileName2`) 직접 조립하여 반환
  - **[Bug Fix #3]** `ReadView.tsx` resolveAssetPaths: 절대 경로 src(`/custom/images/img.png`)를 변환 시 workspacePath 중복 삽입되던 버그 수정 → `/`로 시작하는 경로는 workspacePath 없이 바로 `asset://localhost{path}` 변환
  - 격리형 하네스 테스트 스크립트 작성 및 실행 완료 (`image_asset_harness.ts`) — 32 tests, 0 failures
  - `pnpm build` TS 컴파일 + Vite 번들 검증 완료 (exit code 0)

## Handover & Next Task Briefing (다음 작업자/세션 전달사항)
- **우선 진행할 작업**: 
  1. `BUG-20260803-01`: tauri build 네이티브 환경 한글 IME 합성 딜레이 해결을 위한 Raw Input / Worker 스레드 분리 아키텍처 개편
  2. `FEATURE-TOOLBAR`: 마크다운 서식 툴바 컴포넌트 확장 및 기능 점검
  3. `FEATURE-CONFIG-UI`: WorkspaceConfig(이미지 저장 정책) 설정 UI 노출 및 영속성 연동
- **주의 사항**:
  - `BlockEditor` 및 `MindView`는 반드시 `getCurrentFile()` 헬퍼를 통해 현재 파일 접근.
  - `isImageFile()`은 `File` 인터페이스의 `type`과 `name` 프로퍼티를 모두 사용하므로, 향후 paste 핸들러에도 동일하게 적용할 수 있음 (현재 paste는 ClipboardData API가 항상 MIME 제공하여 문제 없음).
  - `image_asset_harness.ts`를 `tsx`로 실행: `tsx src/shared/lib/fs/__tests__/image_asset_harness.ts` (`npm install -g tsx` 필요)