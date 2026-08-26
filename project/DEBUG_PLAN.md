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
| P0-5 | dirty 탭 무경고 종료 | ✅ **해결 (확인 필요)** | [BUG-20260826-04](../ticket/debug/20260826_1740_dirty_tab_close_guard.yml) |
| P0-6 | 드래그 재정렬 문서 손상 | ✅ 해결 (`843ff42`) | [BUG-20260826-05](../ticket/hist/debug/20260826_1740_readview_reorder_subtree_resolved.yml) |
| P1-1 | 경로 접두사 매칭 오염 | ✅ **해결 (확인 필요)** | [BUG-20260826-06](../ticket/debug/20260826_1740_path_prefix_matching.yml) |
| P1-2 | `isDirty` 저장 기준선 부재 | ✅ **해결 (확인 필요)** | [BUG-20260826-07](../ticket/debug/20260826_1740_dirty_baseline_savedcontent.yml) |
| P1-3 | 워크스페이스 전환 시 `blockStore` 잔존 | 🔴 **유효** | [REF-20260826-02](../ticket/refactor/20260826_1740_blockstore_reset_on_context_switch.yml) |
| P1-4 | 비헤딩 블록 키 충돌 (커서 유실) | 🔴 **유효** | [BUG-20260826-08](../ticket/debug/20260826_1740_block_key_collision.yml) |
| P1-5 | 입력당 `onUpdate` 2회 호출 | 🔴 **유효** | [BUG-20260826-09](../ticket/debug/20260826_1740_duplicate_onupdate_dispatch.yml) |
| P1-6 | 언마운트 시 전역 활성 뷰 null | 🔴 **유효** | [BUG-20260826-10](../ticket/debug/20260826_1740_active_editor_view_null_on_unmount.yml) |
| P1-7 | 병합 regex(H5/H6) · 포커스 복원 | 🔴 **유효** | [BUG-20260826-11](../ticket/debug/20260826_1740_merge_heading_regex_and_focus.yml) |
| P1-8 | 이미지 base64 인라인 | ✅ 해결 (`843ff42`+`091ee49`) | [REF-20260826-03](../ticket/hist/debug/20260826_1740_image_base64_to_asset_protocol_resolved.yml) |
| **P1-9** | **`.cm-line *` 가 위젯 타이포그래피 무력화 (신규)** | 🔴 **유효** | [BUG-20260826-12](../ticket/debug/20260826_2330_widget_typography_collapse.yml) |

**실행 대상 11건** (🔴 10 + 🟠 1) / **해결 완료 4건**.

> **2026-08-26 23:30 추가** — P1-9 는 코드 리뷰가 아니라 사용자 UX 신고에서 출발해 재현·계측으로 확인된 신규 회귀다. 상세는 §2 B5.

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
| **B5** | Write Mode 위젯 표시 정확성 (Stage 1 only) | BUG-12 | 없음 (독립) | 앱 테마 포함 하네스 7케이스 + 라인 높이 수정 전과 동일 |

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

### B5 — Write Mode 위젯 타이포그래피 붕괴 (신규 · 독립 배치)

> 티켓: [BUG-20260826-12](../ticket/debug/20260826_2330_widget_typography_collapse.yml) · 심각도 P1 · 회귀 도입 `ce6b96c`(0.6.1)
> **실행 사양서**: [claude-history/impl/IMPL_PLAN_20260826_2349_widget_typography.md](../claude-history/impl/IMPL_PLAN_20260826_2349_widget_typography.md) — 구현 담당 에이전트는 이 문서만 읽으면 된다.

#### 신고된 증상

코드펜스 `|title|="제목"` 의 타이틀이 **블록을 편집하기 시작하면 사라진다**.
블록이 포커스되지 않은 동안에는 보이므로 "작업을 시작하면 없어진다"로 관측된다.

#### 계측된 실제 범위

증상은 타이틀 하나가 아니라 **Write Mode 데코레이터 위젯 전반**이다.
앱의 `editorThemeCompartment` 테마를 포함한 상태로 `getComputedStyle` 계측한 결과:

| 대상 | 설계값 | 실제 | 판정 |
|---|---|---|---|
| 코드블록 헤더 언어 라벨 (`text-[11px]`) | 11px | **0px (0×0)** | 완전 소실 |
| 코드블록 헤더 타이틀 (`text-[12px]`) | 12px | **0px (0×0)** | **← 신고된 증상** |
| `Copied!` 피드백 (`text-[10px]`) | 10px | **0px (0×0)** | 완전 소실 |
| 헤딩 배지 `.cm-heading-badge` | 0.65rem (10.4px) | 14px | 35% 확대 |
| 이미지 캡션 `.cm-image-caption` | 0.85em (11.9px) | 14px | 축소 미적용 |
| H1 `.cm-h1` | 35px | 14px | **0.8.8 H1 디자인이 Write Mode 에 미반영** |
| 인라인 코드 `.cm-inline-code` | 0.88em | 12.32px | ✅ 유일한 생존자 |

#### 근본 원인

`BlockEditor.tsx:115` / `:225` 의

```ts
'.cm-line *': { fontSize: 'inherit', lineHeight: 'inherit', verticalAlign: 'baseline' }
```

가 원인이다. CodeMirror 테마는 셀렉터에 테마 클래스를 붙여 `.ͼN .cm-line *` 로 컴파일되므로
명시도가 **(0,2,1)** 이다. 위젯 내부의 일반 CSS 클래스와 Tailwind 유틸리티는 **(0,1,0)** 이라
전부 패배한다.

피해가 두 갈래로 갈린다.

- **① 0 으로 붕괴** — 코드블록 헤더가 놓이는 라인은 `orchestrator.ts:152` 의
  `.cm-code-block-widget-line { font-size: 0 !important }` 를 받는다(라인 잔여 높이 제거 목적).
  `.cm-line *` 가 자손 전체를 `inherit` 으로 만들어 **위젯 서브트리가 통째로 0px 를 상속**한다.
  헤더 바 자체는 padding 으로 35px 를 유지하므로 사용자에게는 "빈 바"로 보인다.
- **② 조용한 크기 덮어쓰기** — `index.css` 에 정의된 위젯 타이포그래피가 에디터 기본 폰트로 대체된다.

#### 해법을 가리키는 단서

`.cm-inline-code` 만 살아남는다. 이 클래스는 `orchestrator.ts` 의
`EditorView.baseTheme({'&.cm-editor .cm-inline-code': …})` 로 정의되어
`.ͼ1.cm-editor .cm-inline-code` = **(0,3,0)** 이 되고 `.cm-line *` 를 이긴다.

> **baseTheme 로 정의된 위젯 스타일은 이기고, 일반 CSS / Tailwind 클래스는 진다.**

#### 회귀 가드 (반드시 유지)

`ce6b96c`(0.6.1) 의 원래 목적은 *"인라인 위젯이 line-height 를 흔들어 헤딩 생성 시 캐럿이 튀는 문제"* 해소다.
**리셋을 단순 제거하는 수정은 금지**한다. 축소하되 원래 목적은 보존해야 한다.

#### 후보안 실측 비교 (완료 — 재조사 불필요)

4개 안을 페이지 리로드로 격리해 계측했다. 상세 수치는 [인수인계 문서](../claude-history/impl/IMPL_PLAN_20260826_2349_widget_typography.md) §4.

| | A. 현행 | B. 리셋 제거만 | C. 리셋 제거 + 표적 정규화 | **D. 리셋 유지 + baseTheme 재선언** |
|---|---|---|---|---|
| 헤더 타이틀 | 0px / 0×0 | 12px / **43×0** ⚠ | 12px / 43×18 ✅ | 12px / 43×18 ✅ |
| `.cm-h1` | 14px | 35px | 35px | 14px (불변) |
| 라인 높이 (평문/H1/H2/체크박스) | 19.6/19.6/19.6/19.6 | 19.6/**49**/**24.5**/19.6 | 19.6/**49**/**24.5**/19.6 | 19.6/19.6/19.6/19.6 |
| 0.6.1 캐럿 회귀 위험 | — | 있음 | 있음 | **없음** |

- **B 는 함정** — `fontSize` 만 보면 고쳐진 듯하나 `line-height:0` 이 상속되어 높이가 0 이다.
  하네스는 반드시 `rect.height > 0` 을 검사할 것.
- **D 채택 (Stage 1)** — 라인 메트릭이 현행과 완전히 동일해 0.6.1 회귀 여지가 구조적으로 없다.
- **C 는 보류 확정** (2026-08-26 결정) — 헤딩 크기를 Write Mode 에 반영하는 것은 0.6.1 이 억제한
  캐럿 점프를 되살리는 것이다. **DEBUG_PLAN 전 항목 해소 + `architecture_stages.md` Stage 3(Worker) ·
  Stage 4(Multi-Window) 스레드 분리 완료 후** 근본 해소한다. 편집 입력 경로가 렌더링과 격리되면
  재현 조건 자체가 줄어 난이도가 떨어진다.
  → **`.cm-line *` 리셋은 이번 작업에서 건드리지 않는다.** `.cm-h1` 35px 의 Write Mode 미적용은
  의도된 잔존 상태로 둔다.

#### 실행 순서 (Stage 1)

1. 테마 리터럴을 `createEditorTheme(settings)` 모듈 상수로 추출 — `:115` 와 `:225` 가 동일 리터럴 복제라
   한쪽만 고치면 **설정을 바꾸기 전까지 증상이 남는다**. 이 정리가 선행되어야 한다.
2. `.cm-line *` 를 CodeMirror 하이라이트 토큰만 겨냥하도록 축소.
3. 위젯 타이포그래피를 `decorationBaseTheme` 로 이전 (코드블록 헤더 → 헤딩 배지 → 이미지 캡션 → `.cm-h1`).
4. 위젯 루트에 명시적 폰트 기준을 두어 `font-size:0` 상속을 차단.

#### 이 결함이 남긴 교훈 (프로세스)

0.8.8 작업에서 H1 35px 을 "검증 완료"로 보고했으나, 검증 하네스가 **앱 테마를 포함하지 않아** 통과했다.
Write Mode 시각 검증 하네스는 `editorThemeCompartment` 테마를 반드시 포함해야 한다.
포함하지 않은 하네스는 이 결함군을 **구조적으로 탐지할 수 없다**.

---

## 4. 해결 완료 아카이브

아래 4건은 `v0.8.4` / `v0.8.5` 에서 이미 해소되었다. 회귀 방지를 위해 Done 티켓으로 보존한다.

- [BUG-20260826-02](../ticket/hist/debug/20260826_1740_opentab_cache_bypass_resolved.yml) — `openTab` 캐시 우회 (`843ff42`)
- [BUG-20260826-03](../ticket/hist/debug/20260826_1740_debounce_timer_cleanup_resolved.yml) — 디바운스 타이머 정리 (`843ff42`)
- [BUG-20260826-05](../ticket/hist/debug/20260826_1740_readview_reorder_subtree_resolved.yml) — 서브트리 재정렬 (`843ff42`)
- [REF-20260826-03](../ticket/hist/debug/20260826_1740_image_base64_to_asset_protocol_resolved.yml) — asset 프로토콜 전환 (`843ff42` + `091ee49`)

이전 계획서: `claude-history/debug/DEBUG_PLAN_20260826_170853.md` (P0 초안), `claude-history/debug/DEBUG_PLAN_20260826_174031.md` (asset:// 403 — 완료)
