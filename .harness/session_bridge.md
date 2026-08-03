# Session Bridge (세션 인수인계)

## Current Status Summary (최근 수행 작업)
- **현재 버전 / 마일스톤**: v0.4.6 / MVP 이미지 첨부 & 저장 정책 연동
- **최근 주요 변경점**: 
  - `WorkspaceConfig` / `ImageSavePolicy` 타입 정의 (`entities/workspace/model/types.ts`) 신규 생성
  - `shared/lib/fs/imageAsset.ts` — 3가지 저장 정책(workspace-root-hidden / current-file-relative / custom-folder) 기반 동적 경로 계산 유틸 신규 생성
  - `shared/api/fs.ts` — `saveImageAsset` 시그니처에 `subDir` 파라미터 추가 (Mock/Tauri 양쪽 업데이트)
  - `entities/workspace/model/store.ts` — `config: WorkspaceConfig` 상태 및 `setConfig` 액션 추가
  - `BlockEditor.tsx` — paste/drop 이미지 핸들러를 `saveImageAssetWithPolicy` 유틸로 교체, 현재 파일 경로 연동
  - `ReadView.tsx` — `resolveAssetPaths` 정규식 기반으로 확장하여 3가지 정책 경로 모두 `asset://` 변환 처리
  - `pnpm build` TS 빌드 및 Vite 번들 검증 완료 (exit code 0)

## Handover & Next Task Briefing (다음 작업자/세션 전달사항)
- **우선 진행할 작업**: 
  1. `BUG-20260803-01`: tauri build 네이티브 환경 한글 IME 합성 딜레이 해결을 위한 Raw Input / Worker 스레드 분리 아키텍처 개편
  2. `FEATURE-TOOLBAR`: 마크다운 서식 툴바 컴포넌트 확장 및 기능 점검
  3. (선택) 설정 UI에서 `WorkspaceConfig.imageSavePolicy`를 사용자가 변경할 수 있도록 UI 노출
- **주의 사항 및 블로커**:
  - `BlockEditor` 및 `MindView`는 스토어의 구 버전 `currentFile` 직접 참조 대신 반드시 `getCurrentFile()` 헬퍼 함수를 호출해야 함.
  - 탭 전환 시 `BlockEditor`에 텍스트가 바인딩되도록 `useEffect` 기반 `setBlocksFromContent(rawContent)` 동기화 로직 유지 필요.
  - `imageAsset.ts`의 `current-file-relative` 정책은 현재 `getCurrentFile()?.path`를 기준으로 동작하므로, 파일 경로가 null인 경우 `assets/images/` 폴백으로 동작함.