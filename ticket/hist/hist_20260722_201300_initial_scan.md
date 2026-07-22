🎫 HISTORY TICKET: HIST-20260722-01
UPDATE: 2026-07-22 20:13
PROJECT: Devoras (Devoras-Design)
VERSION/MILESTONE: v0.2.12 / 데스크톱 MVP Phase 1

━━━━━━━

■ 1. EXECUTIVE SUMMARY (주요 요약)

작업 목적: Tauri 2 데스크톱 MVP 환경 구축, CodeMirror 6 다중 블록 에디터 상태/커서 조율 안정화, macOS UI 타이틀바 레퍼런스 이슈 정비 및 parent-stack DRY 리팩터링 완료.

주요 성과:
- [v0.2.10 ~ v0.2.12] setBlocksFromContent 커서 관리 책임 분리 및 absoluteCursorPos 포커스 복원 일원화, deriveKeysWithParentStack DRY 리팩터링 완료.
- [v0.2.8 ~ v0.2.9] 블록 분할 후 커서 포커스 점프 버그 해결 및 Tauri 2 창 드래그 헤더 영역 활성화, macOS 신호등 버튼 겹침 해결.
- [v0.2.6 ~ v0.2.7] Tauri 2 데스크톱 런타임 셋업 완료 및 티켓 디렉터리 세분화 체계 마련.

■ 2. ARCHITECTURE & CONTEXT CHANGES (구조 및 맥락 변경점)

새로 추가된 모듈/엔티티:
- project/src/entities/block/model/store.ts (`deriveKeysWithParentStack` 헬퍼 분리)
- ticket/ 구조 세분화 (`debug`, `impl`, `refactor`, `request`, `reference`, `hist`)

수정/파기된 기존 로직:
- `splitBlock`의 중복/데드 코드 제거 및 커서 복원 흐름 단일화.
- parent-stack 파생 루프 중복 작성(newKeys, existingByKey)을 deriveKeysWithParentStack 헬퍼 함수로 통합.

주요 의사결정 기록(ADR):
- FSD (Feature-Sliced Design) 아키텍처 수용 (`app`, `pages`, `widgets`, `entities`, `shared`).
- Markdown 원본을 내용/계층의 유일 원본(Single Source of Truth)으로 두고 노드 좌표는 `<!-- devoras:spatial {...} -->` 주석 형태로 저장.
- 주요 대형 라이브러리(React 19, Tailwind 4, ESLint 9 등) 마이그레이션 보류 (`held_for_major_migration`).

■ 3. CURRENT PROGRESS & STATUS (현재 진행 상황)

[x] [완료] Tauri 2 데스크톱 네이티브 셋업 및 파일 탐색기 연동 (v0.2.6)
[x] [완료] CodeMirror 6 다중 블록 에디터 상태/커서 SRP 분리 및 포커스 점프 버그 해결 (v0.2.10)
[x] [완료] parent-stack 파생 루프 DRY 리팩터링 (v0.2.12)
[ ] [진행중] Single Block Mode 옵션 선택 기능 검토 (refactor_20260722_195402_single_block_mode_option.md)
[ ] [대기] 마인드맵 노드 드래그 좌표 동기화 및 SVG/DOM 인터랙션 고도화

■ 4. KNOWN ISSUES & TECHNICAL DEBT (알려진 이슈 및 기술 부채)

버그/리팩토링 필요 구간:
- `refactor_code_fence_isolation.md`: 코드 블록 내 Enter/Backspace 시 에디터 분할/병합 격리 로직 적용 필요.
- `refactor_heading_id_unification.md`: 헤딩 ID 생성 및 매칭 파서 유일성 강화.
- `refactor_rendering_optimization.md`: 마인드맵 렌더링 디바운싱 및 트리 구조 갱신 최적화.

제약 사항:
- Node/React/Tauri 주요 종속성 대규모 업그레이드는 stability 테스트 후 마이그레이션 예정.

■ 5. NEXT STEP BRIEFING FOR DEV CHAT (다음 개발 챗을 위한 브리핑)

즉시 수행할 작업:
- `ticket/request/refactor/refactor_20260722_195402_single_block_mode_option.md` 요구사항 검토 및 구현 분판 작성 또는 차기 마인드맵 노드 드래그 좌표 연동 설계.

참조할 주요 파일/경로:
- project/src/entities/block/model/store.ts
- project/package.json
- PLAN.md
