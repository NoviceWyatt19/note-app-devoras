# DEBUG_STEP_PLAN.md — 단계별 결함 해소 계획

> **최종 갱신**: 2026-08-30 | **대상 버전**: `v0.8.43` | **브랜치**: `main`
> **입력 문서**: [`code_review.md`](code_review.md) · [`ARCHITECTURE_FINDINGS.md`](ARCHITECTURE_FINDINGS.md) · [`implementation_plan.md`](implementation_plan.md) · [`project/architecture_stages.md`](project/architecture_stages.md) · [`advanced_rendering_optimization.md`](advanced_rendering_optimization.md) · [`function_roadmap.md`](function_roadmap.md) · [`project/DEBUG_PLAN.md`](project/DEBUG_PLAN.md)
> **경로 표기**: 모든 경로는 저장소 루트 기준.
> **성격**: **지금 해결할 것의 실행 순서와 게이트.** 완료분은 §1에 요약만 두고 상세는 아카이브 계획서로 넘긴다.
> **작성 근거**: 본 문서의 모든 "잔존/해소" 판정은 2026-08-30 시점 **실제 코드 대조**로 확인했다. 문서 기술과 코드가 어긋난 항목은 §5에 정정 대상으로 모았다.

---

## 0. 문서 역할 분담

| 문서 | 담당 질문 |
|---|---|
| [`code_review.md`](code_review.md) | **무엇이** 결함인가 (P0~P2 카탈로그, 배치 B0~B4) |
| [`ARCHITECTURE_FINDINGS.md`](ARCHITECTURE_FINDINGS.md) | **왜 반복되는가** (구조적 원인 A1~A7) |
| [`project/DEBUG_PLAN.md`](project/DEBUG_PLAN.md) | 지금 실행 중인 **단일 배치의 상세 사양** (현재 B2) |
| **본 문서** | 배치들의 **순서·의존·게이트** (인덱스) |

### 0.1 아키텍처 방향 결정 (2026-08-30)

착수 전에 "블록당 CodeMirror 구조를 버리고 Notion 형태로 다시 짤 것인가"를 검토했고, **현행 구조 유지(옵션 1)로 결정**했다. 근거만 남긴다.

- A1~A7 **7건 중 4건**(A1 이중 진실 · A7 정체성 파생 · A5 불변식 부재 · A4 검증 티어)은 **에디터 스택과 무관**하다. 리라이트해도 그대로 따라온다.
- 스택 교체로 실제 소멸하는 것은 **A3**(height map drift, CodeMirror 고유)와 **A6**(블록당 인스턴스 비용)뿐이며, A3는 이미 수정·회귀 고정 완료다.
- 마크다운 파일이 디스크의 진실이라는 전제는 MindView·ERD·`headingId`·Rust 전역 검색(Sprint 4A)이 모두 의존하므로, 블록 트리를 진실로 바꾸는 것은 리팩터링이 아니라 **제품 교체**다.
- 단, **A6는 자체 예산을 20~58배 초과**한 측정 실패다. 따라서 §2 Step 6의 프로파일 결과를 **스택 재검토의 공식 결정 게이트**로 둔다.

> **✅ 게이트 통과 (2026-08-30, v0.8.43) — 이 결정은 재개봉되지 않는다.**
> Step 6 의 3-way 판별 실험 결과, **순수 CodeMirror 코어는 선형이고 38배 싸다**(N=200 에서 35.7ms vs 1,363ms). 초선형의 원인은 `EditorView` 생성이 아니라 **Devoras 자체 데코레이터 확장 계층**(`markdownDecorationPlugin` + `codeBlockInteractionPlugin` 의 상호작용)으로 특정됐다.
> 즉 **「블록당 CodeMirror 인스턴스」라는 설계 자체는 무죄**이며, 위 옵션 1(현행 구조 유지) 결정은 **측정으로 뒷받침된 상태**가 됐다. 상세는 §1 의 Step 6 행과 [`project/DEBUG_PLAN.md`](project/DEBUG_PLAN.md) §4-2.

---

## 1. 완료 요약 (기록 보존용 — 상세는 아카이브로)

> 각 항목의 실행 상세·측정치·DoD 는 아래 아카이브 계획서에 있다. 본 문서에서는 재기술하지 않는다.

| 사이클 | 결과 (핵심만) | 아카이브 |
|---|---|---|
| P0 Critical 해소 | B0 공통 인프라(`useDebouncedCallback`, `ownerTabId`, `_snapshotActiveTab`, `openSeq`) 확립. P0-2·P0-4·P0-6 해소 | [`DEBUG_PLAN_20260826_170853.md`](claude-history/debug/DEBUG_PLAN_20260826_170853.md) |
| `asset://` 403 | scope 객체화 + `requireLiteralLeadingDot: false`. **이 옵션은 `.devoras/` 이미지 렌더링의 전제조건이라 이후 어떤 scope 축소에서도 유지해야 한다** | [`DEBUG_PLAN_20260826_174031.md`](claude-history/debug/DEBUG_PLAN_20260826_174031.md) |
| 티켓 인덱스 (B1~B5 정의) | 배치 B1~B5 와 티켓 BUG-01~12 의 **원 정의처**. B3 의 원래 범위도 여기 있다 | [`DEBUG_PLAN_20260827_025711.md`](claude-history/debug/DEBUG_PLAN_20260827_025711.md) |
| 스크롤 점프 보정 (Stage D) | FLIP 앵커 보정 **실패로 폐기**. 비동기 높이 변화는 뒤쫓을 수만 있고 예방 불가 | [`DEBUG_PLAN_20260827_041501.md`](claude-history/debug/DEBUG_PLAN_20260827_041501.md) |
| 편집 표면 상시화 (Option B) | 블록당 `EditorView` 상시 마운트로 전환. `activeBlockId` 가 렌더 트리거에서 **캐럿 파생값**으로 강등. `editorViewRegistry` 도입 | [`DEBUG_PLAN_20260827_044054.md`](claude-history/debug/DEBUG_PLAN_20260827_044054.md) |
| 0.8.11 검증 게이트 (G0~G3) | G0 비헤딩 블록 위치 키 전환. **G3-1 실측 실패** → A6 로 승격. 구조 결함 A1~A7 도출 | [`DEBUG_PLAN_20260828_203337.md`](claude-history/debug/DEBUG_PLAN_20260828_203337.md) |
| B1 데이터 보호 | BUG-04·06·07 종결. **검증이 결함 2건을 추가로 드러냄**(`saveFile` 기준선 미갱신, `openTab` 스냅샷 미커밋) | [`DEBUG_PLAN_20260829_063211.md`](claude-history/debug/DEBUG_PLAN_20260829_063211.md) |
| B2 보안 (L1·L4-deny·L3·L2) | 새니타이즈·CSP·Rust 경로 검증·민감 경로 deny 착지 (v0.8.28~0.8.31) | [`DEBUG_PLAN_20260830_141903.md`](claude-history/debug/DEBUG_PLAN_20260830_141903.md) |
| **Step 1~3** (B2 잔여 · B3 입력 · A5 불변식) | **L4-scope 종결** — `allow: ["**"]` → `allow: []` + 런타임 동적 허용(v0.8.35). **B3 종결** — 4건 중 2건은 착수 전 이미 소멸, `onUpdate` 이중 호출(v0.8.33)·병합 regex/포커스(v0.8.34) 수정. **A5** R3 불변식 착지 | [`DEBUG_PLAN_20260830_185251.md`](claude-history/debug/DEBUG_PLAN_20260830_185251.md) |
| **Step 4** A7 헤딩 정체성 | **종결 (v0.8.39~0.8.41).** 진단이 한 번 틀렸다 정정된 사례 — id 는 애초에 불투명 토큰이었고 결함은 **매칭 키**에 있었다. 2-패스 매칭(콘텐츠 키 + 위치 폴백)으로 **제목 편집·재정렬 양쪽 안정성 동시 확보**. 후속 수정 2건(부모 리네임 시 자식 미보존, 리네임+재정렬 동시 시 id 스왑)은 **최초 구현의 테스트가 통과시킨 밖에서** 발견 | [`project/DEBUG_PLAN.md`](project/DEBUG_PLAN.md) §2 (현행) |
| **Step 5** A1/A2 조정자 | **종결 (v0.8.42).** 두 이펙트(캐럿 복원=layout, 내용 동기화=passive) → 조정자 1개. 문서 전체 치환 → `computeMinimalChange` 최소 diff. **IME 이중 가드가 캐럿 복원 경로에 빠져 있던 것**을 통합 중 발견·보완 | 〃 §3 |
| **Step 6** A6 판정 게이트 | **판정 완료 (v0.8.43) — 세 번째 갈래.** 아키텍처 무죄(순수 CM 선형·38배 저렴), 배치·`content-visibility` 도 답 아님(`display:none` 격리에서도 초선형), 범인은 **데코레이터 확장 계층의 플러그인 간 상호작용**(각 ≈1.2 → 결합 ≈1.97). §0.1 재개봉 불필요, Step 7 현행 전제로 진행. **신규 후속 티켓 발생** | 〃 §4-2 |

### 1.1 완료분 중 이후 작업이 의존하는 사실 3가지

1. **검증 티어가 살아 있다.** T1 은 이번 사이클 전까지 **한 번도 실행 가능한 적이 없었다**(Node 20 에 없는 플래그). 런타임은 Node 24 LTS 로 고정됐다(`.nvmrc`, `engines`). 새 환경은 `nvm use` 로 시작한다.
2. **`ownerTabId` 는 일회용 스캐폴딩이다.** Step 7 의 탭 스코프 스토어가 완성되면 소멸시킨다.
3. **`requireLiteralLeadingDot: false` 는 건드리지 않는다.** Step 1 의 scope 축소에서 가장 흔한 회귀 경로다.

---

## 2. 지금 해결할 것

> **Step 1~6 은 종결됐다** (v0.8.32~0.8.43). 상세는 §1 표의 아카이브 링크를 따른다. 남은 것은 **Step 7 하나**다.

```
Step 7  B4 구조 개편 (7-A → 7-B? → 7-C)
        ├─ 선행 게이트: Step 6 A6 판정 ✅ 통과 (아키텍처 무죄 → 설계 전제 불변)
        └─ 병행 가능(파일 비중첩): A6-후속 데코레이터 계층 · P1-9 · B2 실기 검증
```

**Step 6 판정이 Step 7 에 주는 조건**:
- 7-A·7-C 는 **그대로 진행**한다. 판정이 「블록당 인스턴스」 설계를 무죄로 결론냈으므로 설계 전제가 바뀌지 않는다.
- 가상화(E7)의 조건은 "선형 회복 후 재평가" → **"데코레이터 계층 수정 후 재평가"** 로 바뀌었다. 그 수정 없이 가상화만 넣으면 뷰포트 안의 블록들끼리 여전히 같은 상호작용 비용을 치른다.

---

### Step 7 — B4 구조 개편

> **원 정의**: [`DEBUG_PLAN_20260827_025711.md`](claude-history/debug/DEBUG_PLAN_20260827_025711.md) §2 — `REF-01(1단계) → REF-02 → REF-01(2단계)` · 선행 `B1, B3`

#### 7-A. P0-3 Stage A-2 — 분할 패널 표시 불일치

**[파일 & 라인]** `project/src/pages/WorkspacePage/WorkspacePage.tsx:359` · `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:393`

**[현재 상태 — code_review 기술보다 진전됨]** `WorkspacePage.tsx:359` 는 이미 `<BlockEditor key={activeTab.id} paneId={pane.id} />` 로 **`paneId` 를 주입한다**(Option B 의 레지스트리 키잉 목적). 그러나 `BlockEditor.tsx:393` 은 여전히 `useDocumentStore(s => s.getCurrentFile())` = **활성 패널의 탭**으로 자기 문서를 유추한다. 즉 **배관은 깔렸고 문서 해석만 남았다.**

**[남은 증상]** 두 번째 패널이 자기 `activeTabId` 와 무관하게 활성 패널의 문서를 그린다(탭 바 제목과 본문 불일치). 비활성 패널에 타이핑하면 `ownerTabId` 가드에 걸려 입력이 **조용히 무시**된다(오염 대신 무반응).

**[조치 방안]** `PaneContainer` 가 `<BlockEditor tab={activeTab} isActivePane={pane.id === activePaneId} />` 를 주입하고, **비활성 패널은 `readOnly` 렌더**(내용은 `tab.cache?.rawContent ?? ''`). 전역 `blockStore` 를 편집하는 인스턴스를 상시 1개로 제한하는 것이 목적이다.
- 가드: 패널 포커스 전환(`setActivePane`) 시 이전 활성 패널을 먼저 `_snapshotActiveTab()` 한 뒤 소유권 이전.
- 가드: 동일 파일을 두 패널에 열면 캐시가 갈라지므로 Stage A 에서는 **중복 오픈 시 기존 패널로 포커스 이동**으로 회피.

#### 7-B. REF-02 / P1-3 — 경계 전환 시 `blockStore` 잔존

**[파일 & 라인]** `project/src/entities/workspace/model/store.ts:40, 59` · `project/src/entities/document/model/store.ts:311`

**[현재 상태]** `openWorkspace` / `openWorkspaceByPath` 는 `resetDocumentState()` 만 호출한다. **`resetBlocks` 는 소스 트리에 존재하지 않는다.** `useBlockStore.blocks` 는 이전 워크스페이스 문서의 전체 트리를 유지하며, (a) 앱 생명주기 동안 회수되지 않는 메모리이고 (b) 다음 문서 로드 시 `existingByKey` ID 매칭의 입력이 되어 **문서 간 블록 identity 가 누수**된다. `viewMode` 도 리셋 대상에서 빠져 있다.

**[조치 방안]** `blockStore` 에 `resetBlocks: () => set({ blocks: [], activeBlockId: null, focusOffset: 0, ownerTabId: null })` 를 추가하고 `resetDocumentState` 에서 함께 호출(`viewMode: 'write'` 포함).

> **주의**: REF-01 2단계(탭 스코프 스토어)를 곧바로 진행할 계획이면 **REF-02 는 구조적으로 소멸**하므로 건너뛰어도 무방하다.

#### 7-C. REF-01 2단계 / P0-3 Stage B — 탭 스코프 스토어

`rawContent / blocks / nodes / isDirty / viewMode` 를 `PaneContainer` 내부에서 생성하는 React Context 기반 **탭 스코프 스토어**(`createTabStore(tabId)`)로 이관한다. `ownerTabId` 스캐폴딩은 여기서 소멸한다.

> ⚠️ **반드시 함께 처리할 것**: [`advanced_rendering_optimization.md`](advanced_rendering_optimization.md) **Phase 1(상태 스냅샷)** 과 **동일 지점**이다. 분리해서 진행하면 스냅샷 인터페이스를 **두 번 설계**하게 된다. `serialize()` / `hydrate()` 를 Phase 2 TTL 언마운터의 계약으로 확정할 것.
>
> 부수 효과: 이 계약이 확정되면 그것이 곧 `architecture_stages.md` **Stage 2 Thin Client** IPC 경계(`getBlockTree(tabId)`, `updateBlock(tabId, blockId, content)`)의 초안이 된다. **스레드/프로세스 분리는 여기서부터 싸진다.**

---

## 3. 보류 / 미편입 티켓

> 위 Step 에 들어가지 않았으나 열려 있는 항목. 착수 전 재평가한다.

| ID | 내용 | 상태 | 비고 |
|---|---|---|---|
| BUG-20260828-04 | `---` 라인 ArrowUp 스킵 | ◻ 보류(고립) | A3 수정 후에도 남은 잔여. 재현 조건이 좁다 |
| **A6-후속** *(신규)* | 데코레이터 확장 계층의 **인스턴스 수 축 초선형 상호작용** | ◻ **Todo — 우선도 높음** | Step 6 판정의 산물. `markdownDecorationPlugin`+`codeBlockInteractionPlugin` 동시 사용 시 성장 지수가 개별 ≈1.2 에서 결합 ≈1.97 로 치솟는다(N=200 에서 1,363ms, 순수 CodeMirror 대비 38배). **레이아웃과 무관** — `display:none` 격리에서도 재현. **N=200 / 300ms 예산 미달의 유일한 원인**이며, 가상화(E7)는 이 수정 뒤에 재평가한다. 아래 Open Q #5 의 `protectedRegions.ts` N² 부채(문서 **길이** 축)와 같은 뿌리인지는 **미확인**. 재현: `project/src/widgets/BlockEditor/__tests__/mount_cost_t2_harness.ts` |
| BUG-20260828-05 | 한글 IME — 앱 실행/포커스 전환 직후 첫 조합 간헐 실패 | ◻ Todo | Step 2-A·Step 5 가 같은 코드 경로(입력 이벤트·조정자)를 정리했다. **재현 재시도 가치 있음** — 이미 소멸했을 가능성 |
| BUG-20260828-06 | 위젯 `toDOM` 예외가 CodeMirror 뷰·React 서브트리를 붕괴시킴 | ◻ Todo | 데코레이터 중재 인프라(§S.4)와 인접 |
| P1-9 | `.cm-line *` 전역 리셋이 Write Mode 위젯 타이포그래피 무력화 | ◻ B5(독립 배치) | 사용자에게 즉시 보이는 표시 결함. 언제든 착수 가능. 실행 사양서: [`IMPL_PLAN_20260826_2349_widget_typography.md`](claude-history/impl/IMPL_PLAN_20260826_2349_widget_typography.md) |
| Open Q #5 | 데코레이터 중재 인프라(`priority`/`claims`)를 언제 넣을까 | ⏳ 미결정 | `protectedRegions.ts` 의 N² 부채가 그때까지 유지된다. **위 A6-후속과 함께 조사할 것** — 같은 뿌리일 수 있다. 상세: [`implementation_plan.md`](implementation_plan.md) 「스파이크」 §S.4 |
| **P2-5** `generateId` | `Math.random` 7자 base36 충돌 | ◻ 미착수 — **P2→P1 재평가 권장** | A7 이후 **역할이 바뀌었다.** id 가 2-패스 매칭이 재파싱을 가로질러 운반하는 **정체성 그 자체**가 되어, 충돌 결과가 "리마운트"에서 **"오매칭"**(남의 undo 히스토리 상속)으로 악화된다. `crypto.randomUUID()` 교체 비용은 사실상 0 |
| P2-4·P2-6~P2-8 | 코드 품질 (`codeContent` O(N²), 미종료 펜스, Rust panic 등) | ◻ 미착수 | 영향도 낮음 |
| A4 (T3 심화) | 상시 디버그 채널 | ◻ 미착수 | 없으면 T3 결론이 계속 휘발된다. 검증이 아니라 **기능**이므로 별도 판단 사항 |

---

## 4. 검증 티어와 공통 게이트

### 4.1 티어

| 티어 | 수단 | 실행 |
|---|---|---|
| **T1** 순수 로직 | Node 24 + `scripts/ts-hook.mjs`(`@/` 별칭·확장자 해석) | `pnpm test:t1` (**9 하네스** — Step 5 에서 `test:diff` 추가) |
| **T2** 레이아웃 | `MockFileSystem` 덕에 앱이 Chromium 에서 그대로 구동 | `pnpm dev` + playwright |
| **T3** 실기 | 설정 변경 없이 콘솔 한 줄 | `pnpm tauri:dev` → `tauri_t3_harness.ts` |

```bash
pnpm test:t1
```

```bash
cd project/src-tauri && cargo test
```

T3 하네스 실행:

```bash
pnpm tauri:dev
```

콘솔에서:

```
const t3 = await import('/src/widgets/BlockEditor/__tests__/tauri_t3_harness.ts'); await t3.run()
```

> **한계 명시**: T3 하네스의 클릭은 합성 `MouseEvent` 다. 사람이 직접 클릭한 교차 확인이 있으면 더 좋다. 다만 게이트가 보는 것은 클릭이 유발하는 포커스·DOM 변화가 스크롤을 흔드는가이고, 그 경로는 합성 이벤트로도 동일하게 탄다.

### 4.2 배치 종료 시 공통 회귀

| # | 항목 | 기준 |
|---|---|---|
| R1 | 문서 열기 → 편집 → `Cmd+S` | 디스크 반영 및 dirty 해제 |
| R2 | 탭 3개 전환 왕복 | 각 탭 내용 유지, 교차 오염 0건 |
| **R3** | **한글 연속 입력** | **조합 끊김 · 텍스트 증식 0건** (Step 2-A 의 핵심 위험) |
| R4 | `.devoras/images` 이미지 | Read/Write 양쪽 렌더링 (0.8.5 회귀 방지 — Step 1 의 핵심 위험) |
| R5 | 좌우 분할 후 패널 닫기 | 탭 병합 정상, 최소 1패널 유지 |
| R6 | 워크스페이스 전환 | 이전 문서 내용 잔존 0건 |

### 4.3 커밋 규칙

`.agents/AGENTS.md` 에 따라 커밋 전 패치 버전업(`project/package.json` · `project/src-tauri/Cargo.toml` · `project/src-tauri/tauri.conf.json` + `Cargo.lock` 동시 갱신). **티켓 1건 = 커밋 1건**을 원칙으로 하고 커밋 메시지에 티켓 ID 를 포함한다.

```
fix(0.8.33): 입력당 onUpdate 이중 호출 제거 (BUG-20260826-09)
```

---

## 5. 문서 드리프트 — **정정 완료 (2026-08-30)**

> 이전 판이 열거한 `code_review.md` 드리프트 5건은 **본 갱신에서 전부 반영됐다.** 아래는 처리 결과 기록이며, 새로 발견되는 드리프트만 이 표에 추가한다.

| 문서 | 항목 | 처리 |
|---|---|---|
| `code_review.md` | §P0-5 "`confirmDiscardIfDirty` 등이 존재하지 않는다" | ✅ 이미 **[해결 (확인 필요)]** 로 표기돼 있음 — 실제 코드와 일치 |
| `code_review.md` | §조치 우선순위 요약이 v0.8.5 스냅샷 | ✅ **v0.8.43 기준으로 재정렬.** 13항목 중 9건 해소 확인, 열려 있는 것만 9항목으로 축소 |
| `code_review.md` | §P0-3 `WorkspacePage.tsx:353` 무인자 기술 | ✅ 잔존 결함이 `BlockEditor.tsx:393` 문서 유추뿐임을 §P0-3 에 반영(Step 7-A) |
| `code_review.md` | §배치별 상태 B3 "4건" | ✅ **종결**로 갱신 — 실질 2건이었고 둘 다 수정 완료 |
| `code_review.md` | §P1-6 `setActiveEditorView(null)` | ✅ **[구조적 소멸]** 로 표기. 해당 코드가 소스 트리에 없음을 명시 |
| `code_review.md` | P1-4·P1-5·P1-7·P2-3 이 표기 없이 미해결로 읽힘 | ✅ 각 절에 해소 커밋·회귀 가드와 함께 ✅ 표기 추가 |
| `code_review.md` | A1·A2·A5·A6·A7 항목 부재 | ✅ 「Step 1~6 사이클」 절 신설 |
| `implementation_plan.md` | §4A.2~4A.8 이 **두 벌 존재**(1090~1568행 / 1571~1854행) | ⚠️ **미처리 — 사용자 판단 필요.** 어느 쪽이 유효 사양인지 확인 후 정리 |

---

## 6. 다음 갱신 시점

**Step 7 종료 시** 본 문서의 Step 7 을 §1 로 내린다. 그 시점에 §2 는 비므로, 다음 배치(A6-후속 · P1-9 · 잔여 P2)를 §2 로 승격할지 판단한다.

상세는 `project/DEBUG_PLAN.md` → `claude-history/debug/` 아카이브 경로를 따른다. **문서 전용 갱신은 버전을 올리지 않는다**(`.agents/AGENTS.md` 「버전업 예외」).
