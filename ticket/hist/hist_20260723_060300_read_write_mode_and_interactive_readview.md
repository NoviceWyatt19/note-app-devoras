🎫 HISTORY TICKET: HIST-20260723-03
UPDATE: 2026-07-23 06:03
PROJECT: Devoras (Devoras-Design)
VERSION/MILESTONE: v0.3.1 / Read-Write Mode 전환 및 대화형 ReadView 구현 마일스톤

━━━━━━━

■ 1. EXECUTIVE SUMMARY (주요 요약)

작업 목적: 에디터에 Write Mode (자유 편집)와 Read Mode (대화형 카드 프리뷰) 전환 기능을 구축하고, Read Mode에서 마크다운/자산 이미지 렌더링, 블록 드래그 앤 드롭 순서 변경, 텍스트 드래그 플로팅 서식 주입 및 더블클릭 포커스 인계를 구현 완료.

주요 성과:
- [v0.3.1] `marked` (v18.0.7) 파서 도입 및 `ReadView.tsx` 대화형 읽기 모드 전용 컴포넌트 신규 개발.
- [v0.3.1] HTML5 Native Drag & Drop API 활용 블록 재배치 (`blockStore.reorderBlocks`) 및 마크다운 파일 원본 동기화.
- [v0.3.1] Read Mode 텍스트 선택 드래그 감지 서식 주입 및 더블클릭 시 해당 위치 커서로 Write Mode 포커스 전환 연동.
- [v0.3.1] `documentStore.viewMode` 상태(`read` | `write`) 추가 및 `FormatToolbar` Read/Edit 토글 버튼 배치.
- [v0.3.1] 빌드 및 타입 검사 통과 및 관련 티켓 정리 (`(done)impl_20260723_053100`).

■ 2. ARCHITECTURE & CONTEXT CHANGES (구조 및 맥락 변경점)

새로 추가된 모듈/엔티티:
- `project/src/widgets/BlockEditor/ui/ReadView.tsx`: 대화형 마크다운 렌더링, HTML5 드래그 앤 드롭 카드 재배치, 더블클릭 포커스 스위칭 컴포넌트.
- `refactor_20260723_055929_write_mode_inline_rendering_extensibility.md`: Write Mode CodeMirror 인라인 마크다운 렌더링 확장 티켓.

수정/파기된 기존 로직:
- `project/src/entities/document/model/store.ts`: `viewMode` 상태 및 토글/변경 액션 추가, 파일 전환 시 `write` 모드 자동 리셋.
- `project/src/entities/block/model/store.ts`: `reorderBlocks(fromIdx, toIdx)` 메서드 추가.
- `project/src/widgets/BlockEditor/ui/FormatToolbar.tsx`: 우측 Read/Edit 토글 아이콘 추가 및 Write 모드 전용 툴바 가시성 제어.
- `project/src/widgets/BlockEditor/ui/BlockEditor.tsx`: `viewMode`에 따른 `ReadView` / `BlockEditorView` 조건부 렌더링.
- `project/src/app/styles/index.css`: `.rv-content` 프리뷰 마크다운 UI 스타일 가이드 추가.

주요 의사결정 기록(ADR):
- **Interactive Reading View**: Read Mode에서 텍스트 직접 타이핑은 제한하되, 카드 블록 마우스 드래그 순서 재배치와 텍스트 드래그 서식/하이라이트 선택을 수용하여 대화형 독서 경험 극대화.
- **Double-Click Switch**: Read Mode의 특정 카드 더블클릭 시 `activeBlockId`를 지정하며 Write Mode로 쾌속 전환.

■ 3. CURRENT PROGRESS & STATUS (현재 진행 상황)

[x] [완료] `functions/1` 파일 관리 고도화 (`v0.2.12`)
[x] [완료] `functions/2` 에디터 서식 툴바 & 로컬 이미지 자산 첨부 (`v0.3.0`)
[x] [완료] Read/Write Mode 전환 & 대화형 ReadView 렌더러 (`v0.3.1`)
[ ] [진행중] Write Mode CodeMirror 인라인 마크다운 렌더링(Decoration & Checkbox Widget) 리팩터링 (`refactor_20260723_055929`)
[ ] [대기] `functions/3` 다중 파일 탭 지원 및 스플릿 뷰

■ 4. KNOWN ISSUES & TECHNICAL DEBT (알려진 이슈 및 기술 부채)

버그/리팩토링 필요 구간:
- Write Mode에서 볼드/이탤릭/취소선 문법 기호가 raw text로 노출되는 현상을 CodeMirror 6 Mark Decoration 및 Checkbox Widget으로 라이브 스타일링하도록 리팩터링 준비 필요 (`refactor_20260723_055929`).

제약 사항:
- Read Mode 블록 드래그 재배치 후 개행(`\n`) 동기화 시 마크다운 파싱 구조 손상 여부 지속 검증.

■ 5. NEXT STEP BRIEFING FOR DEV CHAT (다음 개발 챗을 위한 브리핑)

즉시 수행할 작업:
- `refactor_20260723_055929_write_mode_inline_rendering_extensibility.md` 티켓을 바탕으로 CodeMirror 6 Inline Markdown Decoration 및 Checkbox Widget 렌더링 리팩터링 수행.

참조할 주요 파일/경로:
- project/src/widgets/BlockEditor/ui/ReadView.tsx
- project/src/widgets/BlockEditor/ui/BlockEditor.tsx
- project/src/entities/document/model/store.ts
- project/src/entities/block/model/store.ts
- project/package.json
