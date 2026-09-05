# 문서 지도 — 어떤 질문에 어느 문서가 답하는가

> **갱신**: 2026-09-04 | **기준선**: v0.9.1 · **Step 8-D 게이트 동결 (`PM-20260904-01`)** — 진행은 §2 의 출시 레인 R1~R7
> **이 문서의 역할**: 문서가 많다. **읽기 전에 어디를 볼지 정하는 데** 쓴다.
> 새 세션은 이 문서 → 해당 문서 순으로 진입한다.

---

## 0. 배치 규칙

2026-09-02 이전에는 계획 문서가 루트와 `project/` 에 규칙 없이 흩어져 있었다. 아래로 통일했다.

| 위치 | 담는 것 | 규칙 |
|---|---|---|
| **루트** | **살아 있는 계획·리뷰·아키텍처 문서** | "지금 판단에 쓰이는 것"만 둔다 |
| **`project/`** | **앱 소스 트리** | **문서를 두지 않는다.** 코드와 `package.json` 등 빌드 산출물만 |
| **`ticket/`** | 티켓 (`{debug,refactor,impl,project,session,request}/`) | `[YYYYMMDD_HHMM]_[주제].yml` · 템플릿 `.agents/new_ticket_templates.md` |
| **`claude-history/`** | **아카이브** — 종결·회전·드리프트된 문서 | 지우지 않고 옮긴다. 파일명에 날짜를 박는다 |
| **`functions/`** | 기능 기획서 (제품 사양) | 로드맵이 참조하는 원 사양 |
| **`.agents/`** | 에이전트 규약 (커밋·버전업·티켓·하네스 규칙) | |

> **왜 루트인가**: `project/` 는 앱의 소스 루트(`package.json` 이 있는 곳)다. 계획 문서가 거기 있으면
> 소스 트리와 문서 트리가 섞여 `git mv` 한 번에 둘 다 흔들린다. 문서는 워크스페이스 루트에 모은다.

---

## 1. 살아 있는 문서 (루트)

### 1.1 지금 무엇을 할 것인가

| 문서 | 답하는 질문 |
|---|---|
| [`DOCUMENTS.md`](DOCUMENTS.md) | **(이 문서)** 어디를 봐야 하는가 |
| [`DEBUG_STEP_PLAN.md`](DEBUG_STEP_PLAN.md) | 배치들의 **순서·의존·게이트**(인덱스). §1 완료 요약 · §2 현재 배치 · §3 원인 파악 절차 · §4 보류 티켓 · §5 검증 티어 · §6 문서 드리프트 |
| [`code_review.md`](code_review.md) | **무엇이 결함인가.** §1 우선순위 · **§9 확정 순서(2026-09-02 개정)** · §10 문서 드리프트 |
| [`architecture_direction_review.md`](architecture_direction_review.md) | **2026-09-02 방향 판단.** 단일 CM vs E7 트레이드오프, 두 신규 문서의 사실 검증 |
| [`function_roadmap.md`](function_roadmap.md) | 제품 기능 로드맵. **「현재 위치」에 확정 순서가 있다** |
| [`DEBUG_PLAN.md`](DEBUG_PLAN.md) | **지금 실행 중인 단일 배치의 상세 사양** — 현재 **Step 8 아키텍처 게이트**(8-A R-1 → 8-B 스파이크 A → 8-C 스파이크 B → 8-D 판정) |
| [`VERIFY_BY_HUMAN.md`](VERIFY_BY_HUMAN.md) | **사람 손이 필요한 미검증 항목.** 자동화 불가분만 남기는 것이 목표 |

### 1.2 왜 이렇게 됐는가 (구조·원인)

| 문서 | 답하는 질문 |
|---|---|
| [`ARCHITECTURE_FINDINGS.md`](ARCHITECTURE_FINDINGS.md) | **왜 반복되는가** — 구조 결함 A1~A7. A1·A2·A5·A7 해소됨. **A6 실측치의 원 출처** |
| [`architecture_stages.md`](architecture_stages.md) | 3계층 하이브리드 아키텍처의 **Stage 1~5 로드맵.** Rust 이관·OffscreenCanvas·Multi-Window 의 원 설계 |
| [`advanced_rendering_optimization.md`](advanced_rendering_optimization.md) | 메모리 생명주기 전략. **§4.1 에 `serialize()`/`hydrate()` 계약 확정됨** |

### 1.3 무엇을 지을 것인가 (사양)

| 문서 | 답하는 질문 |
|---|---|
| [`implementation_plan.md`](implementation_plan.md) | Phase 3.5 Sprint 상세. **Sprint 3 에 R-6 병합됨(2026-09-02)** · ⚠️ **§4A.2~4A.8 이 두 벌 존재하는 구조 결함**(경고 삽입됨, 사용자 판단 대기) |
| [`single_cm_transition.md`](single_cm_transition.md) | **단일 CM 전환 안건.** 채택 확정 아님 — 스파이크 A·B 판정 대기. **§0 에 원본의 메모리 전제 정정이 있다 — 먼저 읽을 것** |
| [`README.md`](README.md) | 앱 개요·실행 방법 |

---

## 2. 지금 열려 있는 결정과 게이트

| ID | 무엇 | 문서 |
|---|---|---|
| `GATE-20260902-01` | **아키텍처 게이트** — 단일 CM vs E7. 스파이크 A·B 판정 대기 | [`ticket/project/20260902_0400_single_cm_gate_reopen.yml`](ticket/project/20260902_0400_single_cm_gate_reopen.yml) |
| `REF-20260902-01` | R-1 React 계층 검증 티어 (게이트 0) | [`ticket/refactor/20260902_0430_react_testing_infra.yml`](ticket/refactor/20260902_0430_react_testing_infra.yml) |
| `SPIKE-20260902-A` | 중첩 카드 시각 재현 — **안건의 생사를 가른다** | [`ticket/impl/20260902_0440_spike_a_nested_card.yml`](ticket/impl/20260902_0440_spike_a_nested_card.yml) |
| `SPIKE-20260902-B` | 오케스트레이터 증분화 (A 통과 후) | [`ticket/impl/20260902_0450_spike_b_orchestrator_incremental.yml`](ticket/impl/20260902_0450_spike_b_orchestrator_incremental.yml) |
| `BUG-20260902-01` | ERD 파싱 실패 시 빈 문서 덮어쓰기 (게이트 무관, 즉시) | [`ticket/debug/20260902_0410_erd_empty_doc_overwrite.yml`](ticket/debug/20260902_0410_erd_empty_doc_overwrite.yml) |
| `TASK-20260903-01` | **8-D Step 1 후속 4건** — INP 폭주 판별 · 하네스 규율 · 카드 픽스처 · 게이트 보강 | [`ticket/impl/20260903_1700_step1_followup_tasks.yml`](ticket/impl/20260903_1700_step1_followup_tasks.yml) |
| 🔴 `PM-20260904-01` | **8-D INP 포렌식 보류 · 출시 레인 재배치** — 플래그 off 경로 조사 중단, 데이터 유실 2건·출시 엔지니어링 우선 | [`ticket/project/20260904_1800_release_lane_hold.yml`](ticket/project/20260904_1800_release_lane_hold.yml) |
| `REL-20260904-01` | **출시 엔지니어링** — macOS 개인 배포 → Homebrew. CI·서명·릴리스 파이프라인 전무 | [`ticket/project/20260904_1840_release_engineering.yml`](ticket/project/20260904_1840_release_engineering.yml) |
| `FEAT-20260904-01` | **자동 저장 off/low/high 배선** — 현재 슬라이더에 소비자가 없다. `BUG-20260902-01` 선행 필수 | [`ticket/impl/20260904_1830_autosave_levels.yml`](ticket/impl/20260904_1830_autosave_levels.yml) |

**사용자 판단 대기 (기존)**: `implementation_plan.md` Sprint 4A 사양 중복 · 퀵 캡처 미해결 5건 · 마인드뷰 메인 뷰 전환.

---

## 3. 아카이브 (`claude-history/`)

| 경로 | 담는 것 |
|---|---|
| `claude-history/debug/` | 회전된 `DEBUG_PLAN` 들 + 종결된 버그 인수인계 |
| `claude-history/review/` | 회전된 `code_review` 들 + 외부 리뷰 |
| `claude-history/impl/` | 종결된 구현 사양서 |
| `claude-history/arch/` | **드리프트된 아키텍처 문서** — 현행 코드와 어긋나 아카이브됨 |
| `claude-history/legacy/` | 초기 기획·인수인계 — 역사적 기록 |

**회전 규칙**
- `DEBUG_PLAN` 교체: 기존을 `claude-history/debug/DEBUG_PLAN_[YYYYMMDD_HHMMSS].md` 로 `git mv` 후 새로 작성
- `code_review` 교체: `claude-history/review/code_review_[datetime].md`
- ⚠️ **파일시스템이 대소문자를 구분하지 않는다** — `CODE_REVIEW.md` 와 `code_review.md` 는 같은 파일이다

### 3.1 2026-09-02 정리에서 옮긴 것

| 이전 위치 | 현재 위치 | 사유 |
|---|---|---|
| `project/VERIFY_BY_HUMAN.md` | `VERIFY_BY_HUMAN.md` | 살아 있는 문서 → 루트 |
| `project/architecture_stages.md` | `architecture_stages.md` | 살아 있는 문서 → 루트 |
| `project/MEMORY_OPTIMIZATION.md` | `single_cm_transition.md` | **승격 + 표제 근거 정정.** 메모리가 아니라 마운트 시간이 판단 축이다 |
| `new_view-point.md` | `claude-history/review/code_review_external_20260831_2221.md` | 외부 냉시작 리뷰. 취할 항목은 티켓으로 뽑음 |
| `project/DEBUG_PLAN.md` | `claude-history/debug/DEBUG_PLAN_20260831_204000.md` | BUG-20260831-01 종결 → 회전 |
| `project/BUG2026082801_handoff.md` | `claude-history/debug/` | 해결됨(2026-08-28) |
| `project/ARCHITECTURE_SKETCH.md` | `claude-history/arch/ARCHITECTURE_SKETCH_20260815.md` | **드리프트** — 제거된 전역 `blockStore` 싱글턴을 기술한다 |
| `project/FUNCTIONS_RELATIONSHIP.md` | `claude-history/arch/FUNCTIONS_RELATIONSHIP_20260815.md` | **드리프트** — 같은 이유(`blockStore.updateBlockContent` 등) |
| `project/dev_history.md` | `claude-history/legacy/dev_history_20260815.md` | 티켓 인덱스가 낡음 |
| `HANDOVER.md` | `claude-history/legacy/HANDOVER_20260825.md` | 세션 인수인계 티켓 체계로 대체됨 |
| `PLAN.md` | `claude-history/legacy/PLAN_20260712_mvp.md` | 원 MVP 기획(2026-07-12). 역사적 기록 |
| `claude-history/impl/…widget_typography 복사본.md` | *(삭제)* | 원본과 **바이트 동일**한 중복 |

> **`claude-history/arch/` 의 두 문서를 되살리려면 다시 그려야 한다** — 링크만 고쳐서는 안 된다.
> 전역 `blockStore` 싱글턴은 Step 7-C(v0.8.49)에서 소멸했고 탭 스코프 스토어로 이관됐다.
> **아직 그 대체 다이어그램이 없다** — 필요해지면 신규 작성 대상이다.

---

## 4. 알려진 문서 드리프트

> **갱신 2026-09-04 (계획 세션 코드 대조).** 「실제」 열은 전부 소스에서 직접 확인한 것이다.

### 4.1 정정 완료 (2026-09-04)

| 위치 | 문서 기술 | 실제 |
|---|---|---|
| `implementation_plan.md` Sprint 3 | 「Base64 이미지 폐기」가 **할 일**로 남아 있었다 | **이미 완료.** `ImageDecorator.ts:62-68` 과 `ReadView.tsx:112-124` 가 로컬 경로를 `convertFileSrc`(Tauri `asset://`)로 변환한다. 남은 base64 는 `ImageDecorator.ts:36` 의 **1×1 투명 플레이스홀더 GIF** 하나뿐이며 이미지 저장 방식과 무관하다 |
| `function_roadmap.md` 다중 탭·스플릿 뷰 | **미구현**으로 기술 | **가로 분할은 동작하고 UI 로도 노출돼 있다.** `store.ts:429 splitPane` · `WorkspacePage.tsx:329` 분할 버튼 |
| `DEBUG_STEP_PLAN.md` §2 | 8-D 를 「지금 해결할 것」으로 기술 | **동결**(`PM-20260904-01`). §2 배너로 정정, 출시 레인 R1~R7 로 전환 |
| `code_review.md` §9 | 순서가 아키텍처 게이트 기준 | **출시 스코프 기준으로 재작성**(§9.0). 이전 판은 §9.1'·§9.2' 로 보존 |

### 4.2 계획 세션 정정 — **세로 분할은 "미구현"이 아니라 "미노출"이다**

PM 보고는 「세로 분할만 잔여」였으나, 코드 대조 결과 **잔여 범위가 그보다 작다.**

| 계층 | 상태 |
|---|---|
| 스토어 | ✅ `store.ts:37` 타입 · `:104` 기본값 · `:448` `layoutDirection` 설정 |
| 레이아웃 | ✅ `WorkspacePage.tsx:224` 가 `flex-col`/`flex-row` 로 분기 · `:271` 테두리 분기 |
| **UI 진입점** | ❌ **없음.** `WorkspacePage.tsx:329` 의 분할 버튼이 `splitPane(pane.id, 'horizontal')` 로 **방향을 하드코딩**한다 |

즉 남은 일은 기능 구현이 아니라 **방향 선택 진입점 하나**다(버튼 분리 또는 컨텍스트 메뉴).
로드맵의 크기 추정을 이에 맞춰 내려야 한다.

### 4.3 기능 사양서 코드 대조 — **R5·R6 두 건** (2026-09-04, Impl 레인 착수 전)

전수 점검이 아니라 **당장 쓰일 둘만** 봤다. **두 건 다 §3(기술 설계)의 전제가 코드와 다르다.**

#### `functions/6_theme_yaml_custom.md` (R5) — 전제 2건 오류, **규모가 사양보다 크다**

| 사양 §3·§4 의 기술 | 실제 (2026-09-04 확인) |
|---|---|
| 「글로벌 `index.css`에 정의된 **HSL 기반 테마 변수**를 JS 단에서 오버라이드」 | **`index.css` 의 CSS 커스텀 속성은 0개, HSL 도 0개다.** 하드코딩 hex **33개** |
| 「Tailwind / Vanilla CSS 변수 세팅 **개편**」 — 기존 변수 체계를 고치는 뉘앙스 | 개편할 변수 체계가 없다. **토큰 계층을 새로 만드는 일**이다 |
| `entities/theme/store.ts` | `entities/theme/` **디렉터리 자체가 없다** |
| `js-yaml` 등 파서 | **의존성 미도입**(`package.json` 에 yaml 없음) |

**단, 변수 계층이 아주 없지는 않다** — `app/styles/erd.css:1-9` 에 `:root` 가 있고 Obsidian 계열
이름(`--background-primary` · `--text-normal` · `--text-accent` 등)을 쓴다. 다만 **ERD 전용으로
갈라져 있고 값이 Tailwind 팔레트와 중복**된다. `implementation_plan.md:1069` 가 이 중복 제거를
이미 항목으로 잡아 뒀다.

> **R5 의 실제 범위** (사양서보다 넓다 — 계획 시 반영 필요):
> `tailwind.config.js` 하드코딩 색 **6개** + `index.css` hex **33개** + `erd.css` hex **7개** +
> TS/TSX 임의값 클래스(`bg-[#0d0e12]` 류) **14개** (최초 보고 9개는 `.ts` 를 빼서 과소집계 — PM 지적) 를 토큰으로 이관하는 **선행 마이그레이션**이 있어야
> YAML 오버라이드가 성립한다. YAML 파서는 그 다음이다.

#### `functions/4_global_search.md` (R6) — 미구현은 정상, 그러나 **설계가 두 문서에서 갈린다**

구현 상태는 사양의 `PLANNED` 와 일치한다(`searchWorkspace` · `GlobalSearch` · Rust 검색 커맨드
**전부 부재** — 드리프트 아님). 문제는 설계 축이다:

| | `functions/4_global_search.md` §3 | `implementation_plan.md` §4A.3 |
|---|---|---|
| 검색 엔진 | **Shared Layer 의 JS 유틸** `searchWorkspace()` | **Rust 검색 엔진 (BufReader 기반)** |
| 파일 내 검색 | 언급 없음 | §4A.5 CodeMirror `SearchCursor` |

기능 사양서는 Rust 를 §4 체크리스트의 **마지막 항목(성능 대비책)** 으로만 언급하는 반면,
`implementation_plan.md` 는 **Rust 를 기본 설계로 확정**해 뒀다. **어느 문서를 읽느냐로 결과가 갈린다.**
게다가 `implementation_plan.md` §4A 는 **사양이 두 벌**이고 「아키텍처 결정: Rust vs JS」는
**두 번째 벌에만** 있다(§4.4).

> **결정 완료 (D9, 2026-09-04)**: **JS 우선. Rust 이관은 실측으로 성능이 문제가 될 때.**
> Rust 검색은 `architecture_stages.md:81` Stage 2 항목이고 출시 후로 미뤄져 있어, 전역 검색을
> Rust 로 지으면 Stage 2 를 출시 앞으로 당기는 것이 된다.
>
> **정정 표기는 세 곳에 붙였다** — Rust 설계가 `4A.3` 한 곳이 아니라 **두 벌에 걸쳐 세 절**에 흩어져
> 있었다: 첫 번째 벌 `4A.3`(`:1133` Rust 엔진 구현) · 두 번째 벌 `4A.3`(`:1642` 아키텍처 결정) ·
> 두 번째 벌 `4A.4`(`:1675` Rust 엔진 구현). **같은 번호지만 내용이 서로 다른 절이다** — 한 곳만
> 고쳤으면 그것이 새 드리프트가 됐다.
>
> **부수 확인**: 두 번째 벌 `4A.3` 의 「`architecture_stages.md` 준수」 프레이밍은 **과장이다.**
> Stage 2 항목(`:89`)은 「파일 검색 **인덱싱**」이고 **아직 체크되지 않은 향후 항목**이라 Phase 3.5 의
> 전역 검색을 Rust 로 지으라고 요구하지 않는다. 같은 문서 `:244` 는 **점진적 도메인별 이관**을 원칙으로
> 못 박는다 — **D9 는 `architecture_stages.md` 와 충돌하지 않는다.**

> **조치**: `implementation_plan.md` 첫 번째 4A 절 앞에 중복 경고를 끌어올렸다(2026-09-04).
> 기존 경고는 두 번째 벌 시작 지점에만 있어 **위에서부터 읽는 사람에게는 보이지 않았다.**
> R6 착수 전에 **Rust vs JS 를 먼저 확정**해야 한다 — 사양 두 벌 문제와 별개의 결정이다.

### 4.4 미정정 (남음)

| 위치 | 내용 | 상태 |
|---|---|---|

| `code_review.md` §2 | T1 하네스 "14종" | 같은 문서 §10 이 정정(실제 13종). 원문은 기록 보존을 위해 유지 |
| `functions/*.md` | 기능 기획서들이 Step 1~7 구조 변경 이전 기술일 가능성 | **미점검** |

### 4.5 §4A 두 벌 — **통합 완료 (2026-09-05).** 아래는 통합 이력이다

> **✅ 해소됨 (`PM-20260904-01` D10, 사용자 결정 2026-09-05).** 아래 표와 분석은 **삭제하지 않고
> 이력으로 남긴다** — 다음 세션이 「왜 이런 구조였나」와 「무엇을 근거로 무엇을 버렸나」를 알아야
> 같은 혼란을 반복하지 않는다.
>
> **통합 방식**: 첫 번째 벌의 번호를 뼈대로 유지(외부 참조 5곳이 이 번호를 가리킨다) ·
> 두 번째 벌 고유분은 `4A.3-a`(결정 원문) · `4A.3-b`(Rust 구현안 B) · `4A.8`(단축키) ·
> `4A.9`(검증 2건) 로 접어 넣음 · 나머지는 첫 벌이 상위집합임을 대조 확인 후 폐기.
> **Rust 자료는 지우지 않고 Phase 4 참고로 강등**(D9).

「두 벌」은 대응 절이 1:1 이라는 뜻으로 읽힌다. **실제로는 절 번호가 어긋난 채 겹쳐 있었다.**

| 절 번호 | 첫 번째 벌 (`:1087~`) | 두 번째 벌 (`:1611~`) |
|---|---|---|
| `4A.3` | **Rust 엔진 구현** (BufReader) `:1133` | **아키텍처 결정** (Rust vs JS) `:1640` |
| `4A.4` | 전역 검색 Store `:1268` | **Rust 엔진 구현** `:1673` |
| `4A.5` | 파일 내 검색 (`SearchCursor`) `:1389` | 프론트엔드 검색 Store `:1794` |
| `4A.6` | **`EditorViewRegistry`** (✅ 이미 구현됨) `:1463` | 검색 패널 UI `:1868` |

**같은 번호가 서로 다른 절을 가리킨다.** 그리고 **시작점도 다르다** — 두 번째 벌은 `4A.2`(신규 파일
목록)부터 시작하고 **`4A.1` 이 아예 없다**(`4A.1` 은 문서 전체에서 `:1106` 한 번만 나온다).

**두 번째 벌에 대응 절이 없는 것 — 셋** (계획 세션·PM 각각 확인):

| 첫 벌에만 있는 절 | 잃으면 무엇이 사라지는가 |
|---|---|
| `4A.1` 목표 및 검색 범위 분리 | **전역 검색과 파일 내 검색의 경계 정의.** 이게 없으면 두 검색이 왜 별개인지가 사라지고, `4A.5`(파일 내 검색)가 왜 필요한지도 함께 흐려진다 |
| `4A.5` 파일 내 검색 (`SearchCursor`) | 검색의 절반 |
| `4A.6` **`EditorViewRegistry`** | **계획이 아니라 기존 구현의 설명이다.** 절 자신이 「Sprint 4B 착수 시 새로 만들지 말고 기존 구현을 확인할 것」이라고 적는다 — **이 절이 사라지면 Sprint 4B 가 이미 있는 것을 다시 만든다** |

> **`EditorViewRegistry` 실재 확인 (2026-09-04)**: `project/src/shared/lib/editorViewRegistry.ts` 가
> 실재하고, 소비자가 **세 곳**이다 — `FormatToolbar.tsx:3` · `BlockEditor.tsx:30`(구 블록 경로) ·
> `SingleDocEditor.tsx:15`(단일 CM 경로). **두 에디터 경로 모두가 이 레지스트리에 등록한다.**
> 문서의 「✅ 이미 구현됨」 주장은 정확하다.
>
> (PM 의 첫 검색이 빈 결과를 낸 것은 대소문자 문제였다 — 파일명은 `editorViewRegistry`,
> 노출 심볼은 `getActiveEditorView` 라 `EditorViewRegistry` 정확 일치가 안 잡힌다. 드리프트 아님.)

> **행 번호는 편집으로 밀린다 — 안정된 기준은 절 제목이다.** 위 번호는 `09b98fb` 시점 값이다.
>
> **⚠️ 기계적 병합 금지.** 번호로 짝지으면 **잘못된 절끼리 합쳐진다.** 해소하려면 절 단위가 아니라
> **내용 단위로** 대응을 다시 잡아야 한다. 이것이 「양쪽에 서로 없는 내용이 있어 기계적 삭제 불가」의
> 구체적 형태다.

**이 사실이 실제로 문제를 일으킬 뻔했다**: D9(전역 검색 JS 우선) 정정을 「§4A.3 에 표기」로만 했다면
두 번째 벌 `4A.4`(Rust 엔진 구현)가 표기 없이 남고, **거기만 읽은 세션이 Rust 로 착수한다.**

> **해소 방향 (PM 권고, `PM-20260904-01` §open_decision_4a_merge · `ee6d437`) — 실행하지 않는다.
> 사용자 결정 사항이고 권고까지가 세션의 몫이다.**
> **내용 단위 통합**(절 번호 기준 자동 병합 금지) · 살릴 것 = 첫 벌의 `4A.1`·파일 내 검색·
> `EditorViewRegistry` + 두 번째 벌의 키보드 단축키 · **Rust 엔진 절 2개는 Phase 4 참고 자료로 강등**
> (D9 으로 출시 스코프의 R6 은 JS 확정) · **기한은 R6 착수 전** — 지금은 아무것도 막지 않는다
> (R6 은 출시 순서 뒤쪽, R5-a 가 먼저).
세 곳 모두에 표기했다(`09b98fb`).

## 5. 규약

| 문서 | 내용 |
|---|---|
| [`.agents/AGENTS.md`](.agents/AGENTS.md) | 커밋 형식 · 버전업 4파일 동시 규칙 · **문서 전용 커밋은 버전을 올리지 않는다** |
| [`.agents/new_ticket_templates.md`](.agents/new_ticket_templates.md) | 티켓 네이밍·ID·YAML 템플릿 |
| [`.agents/harness_rule.md`](.agents/harness_rule.md) | 하네스 작성 규칙 |

> ⚠️ **공유 워킹 트리다.** `git commit` 은 인덱스 전체를 커밋한다. 커밋 직전 `git status --short` 를
> 확인하거나 `git commit -F - -- <경로>` 를 쓴다. 실제 사고: `f48b88c`(캐럿 수정 코드가 로드맵 문서
> 커밋에 흡수됨).
