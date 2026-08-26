# DEBUG_PLAN.md — code_review P0 · P1 결함 해소 실행 계획 (티켓 인덱스)

> **대상**: `project/` (Devoras `v0.8.5` — package.json / Cargo.toml / tauri.conf.json 정렬 완료)
> **입력 문서**: [`code_review.md`](../code_review.md) §P0-1~P0-6, §P1-1~P1-8
> **직전 계획서 아카이브**: `claude-history/debug/DEBUG_PLAN_20260826_174031.md` (asset:// 403 / dot 디렉터리 — **완료**)
> **경로 표기**: 저장소 루트 기준
> **⚠️ 재검증 완료**: 리뷰 작성 시점은 `v0.8.2`. 아래 상태는 **현재 `v0.8.5` 코드로 14개 항목을 전수 재확인**한 결과이며, 이미 해결된 4건은 실행 대상에서 제외했다.

---

## 0. 재검증 결과 요약

| # | 항목 | v0.8.5 상태 | 티켓 |
|---|---|---|---|
| P0-1 | 마크다운 HTML 주입 → 코드 실행 / FS 노출 | 🔴 **유효** | [BUG-20260826-01](../ticket/debug/20260826_1740_markdown_html_injection_and_fs_scope.yml) |
| P0-2 | `openTab` 캐시 우회 미저장 소실 | ✅ 해결 (`843ff42`) | [BUG-20260826-02](../ticket/hist/debug/20260826_1740_opentab_cache_bypass_resolved.yml) |
| P0-3 | 분할 패널 전역 상태 공유 | 🟠 **범위 축소 후 유효** | [REF-20260826-01](../ticket/refactor/20260826_1740_pane_scoped_document_state.yml) |
| P0-4 | 디바운스 타이머 교차 오염 | ✅ 해결 (`843ff42`) | [BUG-20260826-03](../ticket/hist/debug/20260826_1740_debounce_timer_cleanup_resolved.yml) |
| P0-5 | dirty 탭 무경고 종료 | 🔴 **유효** | [BUG-20260826-04](../ticket/debug/20260826_1740_dirty_tab_close_guard.yml) |
| P0-6 | 드래그 재정렬 문서 손상 | ✅ 해결 (`843ff42`) | [BUG-20260826-05](../ticket/hist/debug/20260826_1740_readview_reorder_subtree_resolved.yml) |
| P1-1 | 경로 접두사 매칭 오염 | 🔴 **유효** | [BUG-20260826-06](../ticket/debug/20260826_1740_path_prefix_matching.yml) |
| P1-2 | `isDirty` 저장 기준선 부재 | 🔴 **유효** | [BUG-20260826-07](../ticket/debug/20260826_1740_dirty_baseline_savedcontent.yml) |
| P1-3 | 워크스페이스 전환 시 `blockStore` 잔존 | 🔴 **유효** | [REF-20260826-02](../ticket/refactor/20260826_1740_blockstore_reset_on_context_switch.yml) |
| P1-4 | 비헤딩 블록 키 충돌 (커서 유실) | 🔴 **유효** | [BUG-20260826-08](../ticket/debug/20260826_1740_block_key_collision.yml) |
| P1-5 | 입력당 `onUpdate` 2회 호출 | 🔴 **유효** | [BUG-20260826-09](../ticket/debug/20260826_1740_duplicate_onupdate_dispatch.yml) |
| P1-6 | 언마운트 시 전역 활성 뷰 null | 🔴 **유효** | [BUG-20260826-10](../ticket/debug/20260826_1740_active_editor_view_null_on_unmount.yml) |
| P1-7 | 병합 regex(H5/H6) · 포커스 복원 | 🔴 **유효** | [BUG-20260826-11](../ticket/debug/20260826_1740_merge_heading_regex_and_focus.yml) |
| P1-8 | 이미지 base64 인라인 | ✅ 해결 (`843ff42`+`091ee49`) | [REF-20260826-03](../ticket/hist/debug/20260826_1740_image_base64_to_asset_protocol_resolved.yml) |

**실행 대상 10건** (🔴 9 + 🟠 1) / **해결 완료 4건**.

### P0-3 이 "범위 축소"인 이유

`843ff42`(0.8.4)가 **피해**는 차단했다 — `blockStore.ownerTabId` 소유권 검사, `saveFile(paneId, tabId)` 대상 명시화, `updateContentForTab` 분리로 **다른 탭 파일에 엉뚱한 내용이 저장되는 경로는 막혔다**.
남은 것은 **표시 정확성**이다. `BlockEditor` 는 여전히 `getCurrentFile()`(활성 패널의 탭)로 자기 문서를 유추하므로(`BlockEditor.tsx:355`), 좌우 분할 시 **두 패널이 같은 문서를 렌더링**한다. 데이터 손상이 아닌 UX 결함으로 심각도를 낮춰 REF 티켓으로 이관했다.

---

## 1. 실행 순서 & 게이트

| Batch | 목적 | 티켓 | 선행 | 게이트 |
|---|---|---|---|---|
| **B1** | 사용자 데이터 보호 | BUG-04, BUG-06, BUG-07 | 없음 | 각 하네스 통과 + 수동 시나리오 |
| **B2** | 보안 경계 확립 | BUG-01 | 없음 (B1 과 병렬 가능) | 0.8.5 이미지 렌더링 회귀 0건 |
| **B3** | 에디터 입력 안정성 | BUG-08 → BUG-11, BUG-09, BUG-10 | B1 | IME 하네스 회귀 0건 |
| **B4** | 구조 개편 | REF-01(1단계) → REF-02 → REF-01(2단계) | B1, B3 | 단일 패널 사용 흐름 회귀 0건 |

### 배치 내 의존 관계

- **BUG-08 → BUG-11**: 키 충돌이 해소되어야 병합 후 포커스 복원의 재현 조건이 안정된다. 순서를 지킬 것.
- **BUG-07 ↔ REF-01**: 둘 다 `document/model/store.ts` 의 `updateContent` 계열을 건드린다. BUG-07 을 **먼저** 끝내고 REF-01 에 착수해야 충돌이 없다.
- **REF-02 ⊂ REF-01(2단계)**: 스코프 스토어 전환이 끝나면 REF-02 는 구조적으로 소멸한다. REF-01 2단계를 곧바로 진행할 계획이면 REF-02 는 **건너뛰어도 무방**하다.
- **REF-01 1단계 ↔ 렌더링 최적화**: [`advanced_rendering_optimization.md`](../advanced_rendering_optimization.md) Phase 1(상태 스냅샷)과 동일 지점이다. **반드시 함께 설계**할 것.

---

## 2. 배치별 상세

### B1 — 사용자 데이터 보호 (최우선)

| 티켓 | 한 줄 요약 | 핵심 수정 지점 |
|---|---|---|
| [BUG-20260826-04](../ticket/debug/20260826_1740_dirty_tab_close_guard.yml) | dirty 탭 종료 가드 (Cmd+W · X · 앱 종료) | `WorkspacePage.tsx:58-64, 302` |
| [BUG-20260826-06](../ticket/debug/20260826_1740_path_prefix_matching.yml) | 경로 경계 매칭 유틸 도입 | `document/model/store.ts:416, 433, 450` |
| [BUG-20260826-07](../ticket/debug/20260826_1740_dirty_baseline_savedcontent.yml) | `savedContent` 기준선 도입 | `document/model/store.ts:523, 568` |

### B2 — 보안 경계 (외부 파일 공유/배포 전 필수)

| 티켓 | 한 줄 요약 | 핵심 수정 지점 |
|---|---|---|
| [BUG-20260826-01](../ticket/debug/20260826_1740_markdown_html_injection_and_fs_scope.yml) | 새니타이저 + CSP + Rust 경로 검증 + scope 축소 | `ReadView.tsx:16/35/41/97`, `tauri.conf.json:40`, `lib.rs:12` |

> **0.8.5 회귀 주의**: `requireLiteralLeadingDot: false` 는 `.devoras/` 이미지 렌더링의 전제 조건이다. scope 를 좁히더라도 **이 옵션은 유지**할 것. 상세 근거는 아카이브 계획서 `DEBUG_PLAN_20260826_174031.md` §4 참조.

### B3 — 에디터 입력 안정성

| 티켓 | 한 줄 요약 | 핵심 수정 지점 |
|---|---|---|
| [BUG-20260826-08](../ticket/debug/20260826_1740_block_key_collision.yml) | 비헤딩 블록 위치 기반 키 | `block/model/store.ts:48` |
| [BUG-20260826-11](../ticket/debug/20260826_1740_merge_heading_regex_and_focus.yml) | `#{1,6}` 수정 + 재생성 후 포커스 재조회 | `block/model/store.ts:205, 218-223` |
| [BUG-20260826-09](../ticket/debug/20260826_1740_duplicate_onupdate_dispatch.yml) | `domEventHandlers.input` 제거 | `BlockEditor.tsx:174-183` |
| [BUG-20260826-10](../ticket/debug/20260826_1740_active_editor_view_null_on_unmount.yml) | 활성 뷰 포인터 소유권 가드 | `BlockEditor.tsx:229-233` |

### B4 — 구조 개편

| 티켓 | 한 줄 요약 | 핵심 수정 지점 |
|---|---|---|
| [REF-20260826-01](../ticket/refactor/20260826_1740_pane_scoped_document_state.yml) | 탭 prop 주입(1단계) → 탭 스코프 Context(2단계) | `WorkspacePage.tsx:353`, `BlockEditor.tsx:355` |
| [REF-20260826-02](../ticket/refactor/20260826_1740_blockstore_reset_on_context_switch.yml) | 경계 전환 시 `blockStore` 초기화 | `workspace/model/store.ts:35, 51` |

---

## 3. 공통 검증 절차

### 3.1 하네스 우선 원칙

`ticket/reference/new_ticket_templates.md` §3 하네스 규격에 따라, 각 티켓은 **UI 빌드 없이 단일 로직을 검증하는 하네스**를 먼저 작성한다. 모든 하네스 실행 명령은 `project/` 에서:

```bash
node --experimental-strip-types <harness_path>
```

기존 하네스 참고: `project/src/shared/lib/fs/__tests__/image_asset_harness.ts`, `project/src/widgets/BlockEditor/__tests__/ime_isolation_harness.ts`

### 3.2 배치 종료 시 공통 회귀 체크

| # | 항목 | 기준 |
|---|---|---|
| R1 | 문서 열기 → 편집 → `Cmd+S` | 디스크 반영 및 dirty 해제 |
| R2 | 탭 3개 전환 왕복 | 각 탭 내용 유지, 교차 오염 0건 |
| R3 | 한글 연속 입력 | 조합 끊김 · 텍스트 증식 0건 |
| R4 | `.devoras/images` 이미지 | Read/Write 양쪽 렌더링 (0.8.5 회귀 방지) |
| R5 | 좌우 분할 후 패널 닫기 | 탭 병합 정상, 최소 1패널 유지 |
| R6 | 워크스페이스 전환 | 이전 문서 내용 잔존 0건 |

### 3.3 커밋 규칙

`.agents/AGENTS.md` 에 따라 커밋 전 패치 버전업(`0.8.5 → 0.8.6 …`) 및 `package.json` / `Cargo.toml` / `tauri.conf.json`(+`Cargo.lock`) 동시 갱신. 티켓 1건 = 커밋 1건을 원칙으로 하고, 커밋 메시지에 티켓 ID 를 포함한다.

```
fix(0.8.6): dirty 탭 종료 가드 추가 (BUG-20260826-04)
```

---

## 4. 해결 완료 아카이브

아래 4건은 `v0.8.4` / `v0.8.5` 에서 이미 해소되었다. 회귀 방지를 위해 Done 티켓으로 보존한다.

- [BUG-20260826-02](../ticket/hist/debug/20260826_1740_opentab_cache_bypass_resolved.yml) — `openTab` 캐시 우회 (`843ff42`)
- [BUG-20260826-03](../ticket/hist/debug/20260826_1740_debounce_timer_cleanup_resolved.yml) — 디바운스 타이머 정리 (`843ff42`)
- [BUG-20260826-05](../ticket/hist/debug/20260826_1740_readview_reorder_subtree_resolved.yml) — 서브트리 재정렬 (`843ff42`)
- [REF-20260826-03](../ticket/hist/debug/20260826_1740_image_base64_to_asset_protocol_resolved.yml) — asset 프로토콜 전환 (`843ff42` + `091ee49`)

이전 계획서: `claude-history/debug/DEBUG_PLAN_20260826_170853.md` (P0 초안), `claude-history/debug/DEBUG_PLAN_20260826_174031.md` (asset:// 403 — 완료)
