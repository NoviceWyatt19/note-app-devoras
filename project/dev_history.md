# Devoras Design - Development History

이 문서는 `ticket/request/` 경로를 제외한 모든 개발 및 이슈 티켓의 히스토리를 모아 정리한 아카이브 문서입니다. 프로젝트의 진척 과정과 해결된 기술적 챌린지들을 한눈에 파악할 수 있습니다.

---

## 🛠 Debug History (`ticket/debug/`)
주로 에디터와 UI의 까다로운 엣지 케이스 버그들을 추적하고 해결한 기록입니다.
- **[✅]** `(done)debug_20260719_181239_block_navigation_stale_closure.md` (블록 이동 시 클로저 상태 업데이트 누락 문제)
- **[✅]** `(done)debug_20260719_181239_tauri2_runtime_detection.md` (Tauri2 런타임 환경 감지 로직)
- **[✅]** `(done)debug_20260719_190212_macos_traffic_light_layout_overlap.md` (macOS 트래픽 라이트와 타이틀바 오버랩 수정)
- **[✅]** `(done)debug_20260719_190212_scroll_jump_on_block_designation.md` (블록 포커스 시 스크롤 점프 현상)
- **[✅]** `(done)debug_20260719_191544_block_split_focus_jump.md` (블록 분할 시 포커스 점프)
- **[✅]** `(done)debug_20260719_191544_editor_grab_region_tauri.md` (타이틀바 드래그 영역 문제)
- **[✅]** `fix_macos_traffic_light_overlap_and_vite_compat.md`
- **[✅]** `fix_duplicate_id_and_coordinate_reset.md` (노드 중복 ID 및 좌표 초기화 버그)
- **[✅]** `fix_dirty_on_open_and_cursor_jump_after_split.md`
- **[✅]** `fix_block_split_cursor_jump_to_first_h2.md`
- **[✅]** `fix_enter_key_block_jump_and_codemirror_feedback_loop.md`

## ⚙️ Implementation History (`ticket/impl/`)
핵심 기능 구현 요구사항 및 스펙 정의 문서입니다.
- **[✅]** `(done)imple_setup_and_fsd_structure.md` (FSD 구조 및 스캐폴딩 초기화)
- **[✅]** `(done)imple_tauri2_native_desktop_setup.md` (Tauri 2 + React 설정)
- **[✅]** `(done)impl_h1_h2_block_slicing_and_spatial_metadata.md` (핵심 블록 렌더링 및 메타데이터 설계)
- **[✅]** `(done)impl_20260723_050839_editor_toolbar_and_image.md` (에디터 툴바 및 이미지 어셋 연동)
- **[✅]** `(done)impl_20260723_053100_read_write_mode_and_interactive_preview.md` (읽기/쓰기 모드 토글)
- **[✅]** `(done)impl_20260724_172921_font_size_control.md` (폰트 사이즈 단축키 동적 제어)
- **[✅]** `(done)20260724_173333_impl.yml`

## ♻️ Refactor History (`ticket/refactor/`)
코드 품질 개선 및 기술 부채 상환 기록입니다.
- **[✅]** `(done)refactor_20260720_032225_set_blocks_parent_stack_dry.md` (블록 스택 로직 DRY)
- **[✅]** `(done)refactor_20260720_032225_split_block_dead_code.md` (데드코드 제거)
- **[✅]** `(done)refactor_20260720_033049_block_state_cursor_srp_unification.md` (커서 상태 SRP 분리)
- **[✅]** `refactor_code_fence_isolation.md` (코드 블록 내 구문 격리 처리)
- **[✅]** `refactor_heading_id_unification.md` (헤딩 ID 파싱 유틸리티 통합)
- **[✅]** `refactor_rendering_optimization.md` (렌더링 최적화)
- **[✅]** `20260810_1755_init_luncher.yml`

## 📅 Project / Hist / Session History
MVP 진행 단계별 로드맵 및 스냅샷 기록들입니다.
- `ticket/project/project_20260722_202500_basic_note_app_mvp.md`
- `ticket/project/live_preview_codeblock_troubleshooting.md` (최근 CodeBlock 데코레이션 관련 트러블슈팅 정리)
- `ticket/hist/20260726_2153_korean_ime_compatibility_completion.yml` (한글 IME 이슈 완전 정복 히스토리)
- `ticket/hist/debug/20260811_1754_codemirror_cursor_skip.yml` 등 다수의 CodeMirror 위젯 관련 디버깅 기록
- `ticket/session/session_20260723_050600_functions_1_completion_and_next_step.md`

> **Note**: 본 파일은 플랫폼 이전을 맞이하여 기존 `ticket` 폴더의 내역을 스냅샷 형태로 정리한 것입니다. 향후 추가되는 히스토리는 Claude Code 환경의 규칙에 맞춰 별도로 관리될 수 있습니다.
