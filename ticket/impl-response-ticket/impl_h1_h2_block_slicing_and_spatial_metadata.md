# Ticket: impl_h1_h2_block_slicing_and_spatial_metadata
**Status**: COMPLETED
**Target Release**: v0.1.2
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표

기존 `\n\n`(단락) 기준 블록 분할 정책을 폐기하고, 마크다운 H1(`# `) 및 H2(`## `) 헤딩을 경계선으로 삼아 에디터 블록(CodeMirror 인스턴스)을 슬라이싱하는 구조로 전환한다.
아울러 사용자 노트 원문(.md)에 HTML 주석으로 좌표를 직접 삽입하던 방식을 폐기하고, 워크스페이스 내 별도 메타데이터 파일(`.devoras/spatial.json`)에 좌표 데이터를 독자적으로 관리하는 이원화 저장 구조를 구축한다.
macOS 플랫폼 타깃에 맞게 단축키와 UI 안내 문구를 `Cmd+S` 기준으로 전면 통일한다.

## 2. 구현 상세

### A. FileSystem API 확장 — 메타데이터 분리 저장 인터페이스
- [project/src/shared/api/fs.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/api/fs.ts)에 `readSpatialMetadata`, `writeSpatialMetadata` 메서드를 추가했습니다.
- **인터페이스 서명**:
  ```typescript
  readSpatialMetadata(workspacePath: string): Promise<Record<string, Record<string, { x: number; y: number }>>>;
  writeSpatialMetadata(workspacePath: string, metadata: Record<...>): Promise<void>;
  ```
- **Mock 구현**: `localStorage`의 `devoras_spatial` 키에 JSON으로 직렬화·역직렬화.
- **Tauri 구현**: 워크스페이스 루트 내 `.devoras/` 디렉토리를 생성(`mkdir`)하고, `spatial.json` 파일에 직렬화·역직렬화. `.devoras/` 하위 파일은 사용자 노트 원문에 영향을 주지 않음.

### B. 마크다운 파서 정제
- [project/src/entities/document/lib/parser.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts)에서 HTML 주석(`<!-- x: N, y: N -->`) 파싱 및 직렬화 코드를 완전히 제거했습니다.
- 파서는 이제 헤딩 계층 구조만 순수하게 추출하며, 좌표 정보는 별도 메타데이터 파일에서만 결합됩니다.

### C. 문서 스토어 이원화 저장 리팩터링
- [project/src/entities/document/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts)의 `loadFile` 액션을 다음과 같이 개선했습니다:
  1. 마크다운 파일 원문 읽기 → `rawContent`
  2. `.devoras/spatial.json` 읽기 → 해당 파일의 좌표 맵 조회
  3. 파싱된 노드 리스트와 좌표 맵을 결합(`alignedNodes`) 후 스토어에 반영
  4. `isDirty: false`로 초기화
- `saveFile` 액션도 이원화 방식으로 재작성:
  1. 사용자 원문(.md)을 주석 없이 순수하게 저장
  2. `.devoras/spatial.json`에 현재 파일의 좌표 데이터만 갱신하여 저장

### D. H1/H2 기준 블록 슬라이싱 정책 도입
- [project/src/entities/block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)의 `setBlocksFromContent`를 개편했습니다.
  - 기존: `\n\n` 단락 기준 분할 (코드 블록·표 내부 빈 줄에 오작동)
  - 변경: `# ` 또는 `## ` 로 시작하는 줄을 만나면 새 블록을 시작하는 슬라이싱 정책 적용
  - `H3`~`H6`은 상위 H1/H2 블록의 내부 콘텐츠로 그대로 보존
- `mergeBlockWithPrevious`에서 `H1` 또는 `H2` 접두사를 정규식(`/^(##?)\s*/`)으로 제거한 뒤 이전 블록 콘텐츠에 병합

### E. macOS 단축키 및 UI 통일
- [project/src/pages/WorkspacePage/WorkspacePage.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/pages/WorkspacePage/WorkspacePage.tsx)의 저장 단축키 감지 및 사용자 안내 문구를 Windows(`Ctrl+S`) → macOS(`Cmd+S`) 기준으로 전면 교체했습니다.

## 3. 관련 파일 변경 목록
- **MODIFY**:
  - [project/src/shared/api/fs.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/api/fs.ts)
  - [project/src/entities/document/lib/parser.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts)
  - [project/src/entities/document/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts)
  - [project/src/entities/block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [project/src/pages/WorkspacePage/WorkspacePage.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/pages/WorkspacePage/WorkspacePage.tsx)
