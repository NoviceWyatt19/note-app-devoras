🎫 HISTORY TICKET: HIST-20260723-02
UPDATE: 2026-07-23 05:22
PROJECT: Devoras (Devoras-Design)
VERSION/MILESTONE: v0.3.0 / 에디터 서식 툴바 & 로컬 이미지 자동 첨부 마일스톤

━━━━━━━

■ 1. EXECUTIVE SUMMARY (주요 요약)

작업 목적: 마크다운 서식 적용을 보조하는 FormatToolbar와 클립보드 붙여넣기(`Cmd+V`) 및 드래그 앤 드롭을 통한 로컬 이미지 자동 첨부(`assets/images/`) 기능 구현 완료.

주요 성과:
- [v0.3.0] 에디터 서식 툴바(`FormatToolbar.tsx`) 추가 및 포커스 유지 처리 (`onMouseDown e.preventDefault`).
- [v0.3.0] 로컬 자산 파일 저장 API (`saveImageAsset`) 및 Tauri `assetProtocol` / `fs:allow-write-file` 권한 추가.
- [v0.3.0] Active CodeMirror View 싱글턴 관리 (`activeEditorView.ts`) 및 paste/drop 이벤트 인터셉트 구현.
- [v0.3.0] `pnpm build` 타입 체크 및 빌드 검증 통과.

■ 2. ARCHITECTURE & CONTEXT CHANGES (구조 및 맥락 변경점)

새로 추가된 모듈/엔티티:
- `project/src/shared/lib/activeEditorView.ts`: 현재 포커스된 CodeMirror 뷰 싱글턴 추적
- `project/src/shared/lib/imageUtils.ts`: `generateImageFileName()`, `toAssetUrl()` 자산 경로 유틸
- `project/src/widgets/BlockEditor/ui/FormatToolbar.tsx`: Bold, Italic, Strikethrough, Link, CodeBlock, Table 서식 툴바

수정/파기된 기존 로직:
- `project/src/shared/api/fs.ts`: `saveImageAsset()` 구현 (Tauri / Mock / Interface), `assets/images/` 디렉터리 자동 생성.
- `project/src/widgets/BlockEditor/ui/BlockEditor.tsx`: FormatToolbar UI 통합, view lifecycle 감지, paste/drop 이미지 이벤트 핸들러 바인딩.
- `project/src-tauri/capabilities/default.json`: `fs:allow-write-file` 권한 추가.
- `project/src-tauri/tauri.conf.json`: `assetProtocol: { enable: true, scope: ["**"] }` 활성화.

주요 의사결정 기록(ADR):
- **Toolbar Focus Retention**: 툴바 버튼 클릭 시 에디터 포커스를 잃지 않도록 `onMouseDown`에 `preventDefault` 적용 및 뷰 파괴 시에만 active view 클리어.
- **Async Image Insertion**: paste/drop 발생 시 즉시 `e.preventDefault()`로 기본 동작을 차단하고 비동기 이미지 저장 완료 후 CodeMirror `dispatch`로 마크다운 태그 인라인 주입.

■ 3. CURRENT PROGRESS & STATUS (현재 진행 상황)

[x] [완료] `functions/1` 파일 관리 고도화 (`v0.2.12`)
[x] [완료] `functions/2` 에디터 서식 툴바 & 로컬 이미지 자동 첨부 (`v0.3.0`)
[ ] [대기] `functions/3` 다중 파일 탭 지원 및 스플릿 뷰
[ ] [대기] `functions/9` H1 루트-H2 메인 카드 파서 정교화 및 중첩 박스 마인드 뷰

■ 4. KNOWN ISSUES & TECHNICAL DEBT (알려진 이슈 및 기술 부채)

버그/리팩토링 필요 구간:
- 이미지 태그(`![image](assets/images/...)`) 마크다운 삽입은 동작하나, 에디터 내 이미지 미리보기(WYSIWYG/Preview)는 차후 미리보기 모드 연동 필요.

제약 사항:
- Tauri 바이너리 패키징 빌드 시 `assetProtocol` 런타임 권한 동작 지속적 검증 필요.

■ 5. NEXT STEP BRIEFING FOR DEV CHAT (다음 개발 챗을 위한 브리핑)

즉시 수행할 작업:
- `functions/3_tabs_and_split_view.md` 구현 티켓 발행 또는 H1 최상위 루트 & H2 메인 카드 블록 파서 구체화.

참조할 주요 파일/경로:
- project/src/widgets/BlockEditor/ui/FormatToolbar.tsx
- project/src/widgets/BlockEditor/ui/BlockEditor.tsx
- project/src/shared/lib/activeEditorView.ts
- project/src/shared/lib/imageUtils.ts
- project/src/shared/api/fs.ts
