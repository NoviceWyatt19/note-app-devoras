# DEBUG_PLAN.md — Step 4~7 배치 (구조 결함 해소)

> **대상**: `project/` (Devoras `v0.8.38`)
> **상위 인덱스**: [`DEBUG_STEP_PLAN.md`](../DEBUG_STEP_PLAN.md) §2 Step 4 · Step 5 · Step 6 · Step 7
> **입력 문서**: [`ARCHITECTURE_FINDINGS.md`](../ARCHITECTURE_FINDINGS.md) (A1·A2·A6·A7) · [`code_review.md`](../code_review.md) (P0-3·P1-3) · [`advanced_rendering_optimization.md`](../advanced_rendering_optimization.md) · [`architecture_stages.md`](architecture_stages.md)
> **직전 배치**: Step 1~3 — 종결, [`claude-history/debug/DEBUG_PLAN_20260830_185251.md`](../claude-history/debug/DEBUG_PLAN_20260830_185251.md)
> **성격**: 앞 배치와 달리 **엄격한 직렬 의존**이다. Step 4→5→6→7 순서를 지키지 않으면 뒤 단계가 앞 단계의 회귀를 감지할 수 없다.

---

## 0. 한 줄 요약

Step 1~3 이 **증상**을 껐다면, 이 배치는 **증상을 계속 만들어내는 구조** 넷을 끈다.

- **Step 4 (A7)** — ✅ 완료. 렌더 key(`EditorBlock.id`)는 애초에 불투명 토큰이었지만 재파싱 시 매칭이 라벨에 묶여 있어 제목을 고치면 정체성이 바뀌었다. 2-패스 매칭(콘텐츠 키 우선 + 위치 폴백)으로 교체 — 제목 편집·재정렬(드래그앤드롭) 양쪽 다 id 안정.
- **Step 5 (A1/A2)** — 스토어와 `EditorView` 가 둘 다 권위를 주장하고, 조정을 두 이펙트의 **실행 순서**에 맡긴다. 최근 버그 3건이 전부 이 계열이었다.
- **Step 6 (A6)** — 마운트 비용이 예산의 **20~58배**이고 **초선형**이다. 프로파일 결과가 아키텍처 재검토의 공식 결정 게이트다.
- **Step 7 (B4)** — 전역 `blockStore` 를 탭 스코프로 이관한다. `ownerTabId` 스캐폴딩이 여기서 소멸한다.

---

## 1. 실행 순서 & 게이트

```
Step 4  A7 헤딩 정체성 분리
        ↓  (렌더 key 안정 = 5의 회귀를 관측 가능하게 만드는 전제)
Step 5  A1/A2 조정자 일원화 + diff 동기화
        ↓  (전체 치환 제거 = 6의 프로파일에서 노이즈 제거)
Step 6  A6 프로파일 → 가상화/스택 판정 게이트
        ↓  (판정 결과가 7의 범위를 결정)
Step 7  B4 구조 개편 (7-A → 7-B? → 7-C)
```

**직렬인 이유**를 명시한다 — 앞 배치처럼 병렬로 착수하면 안 된다.

| 경계 | 앞 단계가 뒤 단계에 주는 것 |
|---|---|
| 4 → 5 | 렌더 key 가 안정돼야 5의 리팩터링이 만든 회귀와 "key 때문에 리마운트됐다"를 **구분**할 수 있다 |
| 5 → 6 | 전체 문서 치환이 남아 있으면 6의 프로파일이 **측정 대상을 오염**시킨다(재측정 강제가 스래싱과 섞인다) |
| 6 → 7 | 6의 판정이 "스택 교체"로 나오면 7-C 의 설계 전제가 통째로 바뀐다 |

| 순서 | 작업 | 게이트 | 커밋 |
|---|---|---|---|
| 1 | ✅ **Step 4** 헤딩 매칭 2-패스 전환(콘텐츠 키 + 위치 폴백) | T1 K4/K5/K7 통과 + MindView 무변경(회귀 불가) — 실기 undo 확인만 이월 | 커밋 대기 |
| 2 | **Step 5** 조정자 일원화 + diff 동기화 | R3 불변식 미발화 + R1~R6 | `refactor(x.x.x): 뷰↔스토어 조정자 일원화 (A1/A2)` |
| 3 | **Step 6** 프로파일 → 판정 | 아래 §4 결정 게이트 표 판정 기록 | `chore(x.x.x): 마운트 비용 프로파일 결과 (A6)` |
| 4 | **Step 7-A** 분할 패널 문서 해석 | 탭 바 제목과 본문 일치 + R5 | `fix(x.x.x): 분할 패널 표시 불일치 (P0-3 Stage A-2)` |
| 5 | **Step 7-C** 탭 스코프 스토어 | R2·R6 + `ownerTabId` 소멸 | `refactor(x.x.x): 탭 스코프 스토어 (REF-01 2단계)` |

> **7-B 는 조건부다.** 7-C 를 곧바로 진행하면 REF-02 는 **구조적으로 소멸**한다. 7-C 착수가 확정이면 건너뛴다.

---

## 2. Step 4 — A7 헤딩 정체성 분리

> **우선순위 근거**: 남아 있는 구조 결함 중 **유일하게 데이터 손실(undo 히스토리)을 만든다.**

**[파일 & 라인]** `project/src/entities/block/model/store.ts:66` · `project/src/shared/lib/headingId.ts:12` · `project/src/entities/document/lib/parser.ts:53` · `project/src/widgets/BlockEditor/ui/BlockEditor.tsx`(렌더 `key={rootBlock.id}`)

**[근본 원인]** 헤딩 블록의 키가 헤딩 라벨에서 파생된다. T1 로 확인된 사실:

```
'## 원래제목'  →  id x9937oh
'## 바뀐제목'  →  id wi2lrio      ← 제목만 고쳤는데 정체성이 바뀐다
```

렌더가 `key={rootBlock.id}` 이므로 id 가 바뀌면 React 가 언마운트→재마운트하고 정리 함수가 `view.destroy()` 를 호출한다. G0 은 생성 이펙트의 **의존성 배열**에서 `block.id` 를 뺐지만(`BlockEditor.tsx:239`), **React key 를 통한 파괴 경로는 그대로 열려 있다.**

**[완화 요인 — 그래서 지금 당장 터지지는 않는다]** 키 재파생은 헤딩 **개수**가 변할 때만 일어난다(`handleBlockUpdate` 가 `oldHeadingCount !== newHeadingCount` 로 가드). **위험 창**은 "제목을 고친 뒤 어딘가에서 헤딩을 추가/삭제하거나 블록을 병합/분할하는 순간"이며, 그때 그 블록의 undo 히스토리가 조용히 사라진다.

**[조치 방안]** 헤딩도 **위치 기반 정체성**으로 옮기고 라벨은 **표시용 속성**으로만 둔다. MindNode 링크가 헤딩 라벨 id 에 의존하므로(주석의 "Legacy support for MindNode linking"), **링크용 키와 렌더 정체성 키를 분리**한다.

> **원칙: 렌더 key 는 절대 내용에서 파생하지 않는다.**

**[구현 중 정정 — 진단이 한 겹 더 있었다]** 착수해 보니 `EditorBlock.id` 는 애초에 `buildHeadingId(...)` 그 자체가 아니라 **`generateId()` 로 만든 불투명 랜덤 토큰**이었다(`block/store.ts:25`). `buildHeadingId` 는 **매 재파싱마다 old/new 블록을 매칭해 그 랜덤 id 를 이어받을지 결정하는 매칭 키**였을 뿐 — 즉 "렌더 key 는 내용에서 파생하지 않는다"는 원칙은 이미 구조적으로 지켜지고 있었고, 진짜 결함은 **"제목이 바뀌면 매칭이 실패해 새 랜덤 id 가 발급된다"**는 더 좁은 문제였다.

이 재진단이 설계를 바꿨다: id 생성 자체를 위치 기반으로 만들면(순수 포지셔널) 제목 편집은 고쳐지지만 **재정렬이 대신 깨진다** — `reorderBlocks()`(드래그앤드롭, `ReadView.tsx:360` 이 호출하는 **실사용 기능**)로 헤딩을 옮기면 형제 순번이 바뀌어 그 헤딩과 그 뒤 형제들이 전부 새 id 를 받는다. 매칭을 위치로 해도 결과는 수학적으로 동일하다(위치 키로 매칭 = 위치로 생성, 한 번의 키 함수로는 두 속성을 동시에 만족 못함).

최종 채택안은 **2-패스 매칭**이다(`buildHeadingId`·`generateId` 는 그대로 두고 매칭 로직만 이관):

1. **Pass 1** — 기존 그대로 콘텐츠 키(라벨+조상경로, `buildHeadingId`)로 old↔new 매칭. 라벨이 그대로면 어디로 옮겨져도 다시 잡힌다 → **재정렬 안정**.
2. **Pass 2** — Pass 1 에서 못 잡힌(=콘텐츠가 실제로 바뀐) old/new 만 (부모, 레벨) 로 묶어 만난 순서대로 대응시켜 옛 id 를 물려받는다 → **제목 편집 안정**(보통 그 그룹엔 편집된 블록 하나만 남는다).

`parser.ts:53` 은 **전혀 건드리지 않았다** — `buildHeadingId` 자체는 변경 없이 그대로 두 호출부(파서의 `MindNode.id` 계산, 스토어의 매칭 키 계산)가 계속 같은 함수를 공유하므로 "두 벌 정체성 체계" 위험이 애초에 발생하지 않는다. MindView 쪽은 코드 변경 0건이라 회귀 위험이 구조적으로 없다.

**[Edge Cases & Guards]**

- **MindView 의 기존 링크 호환성**: `parser.ts` 무변경으로 자동 충족.
- Step 2-B 의 "재생성 후 위치로 재조회" 패치는 **방어적으로 그대로 유지**했다(project-1f 권고) — 이제는 대부분 트리거되지 않아야 정상이지만, 2-패스 매칭이 놓치는 예외(부모가 바뀌는 이동 등)에 대한 안전망으로 남긴다.
- Pass 2 는 (부모, 레벨) 로 스코프해 서로 다른 레벨의 "짝 없는" 블록끼리 잘못 엮이는 것을 막았다.

**[DoD]** 제목 변경 → 헤딩 추가/삭제 시나리오에서 편집 중이던 블록의 `EditorView` **인스턴스 동일성 유지**(아래 §9.2 G1 계측 + T1 `block_key_stability_harness.ts` K4/K5 로 측정) · undo 히스토리 보존(뷰 인스턴스가 파괴되지 않으므로 구조적으로 보존 — 실기 확인은 사람 손) · MindView 링크 회귀 0건(코드 무변경으로 충족) · **재정렬 안정성**(K7, 이번에 추가로 발견한 요구사항) 회귀 0건.

**[상태]** ✅ 코드 완료(`entities/block/model/store.ts`, `shared/lib/headingId.ts` 무변경, `widgets/BlockEditor/ui/BlockEditor.tsx` G1 로그 추가). T1 `test:blockkey` K1~K8 전부 통과(`ff3912d`).

**[중첩 케이스 — project-1f 발견, 같은 커밋 사이클 안에서 수정]** 2-패스 매칭을 실제로 돌려보니 부모 헤딩만 리네임해도 **자식 헤딩들**은 pass 1(조상경로에 옛 라벨이 남음)·pass 2(부모 그룹키가 새 라벨) 양쪽 다 놓쳐 undo 를 잃는 게 확인됐다 — 부모 자신은 보존되지만 A7 증상이 한 단계 아래에서 그대로 살아 있었던 것. `deriveKeysWithParentStack` 이 문서 순서로 훑어 부모가 항상 자식보다 먼저 처리된다는 점을 이용해, pass 2 가 부모를 매칭하는 순간 "새 부모키 → 옛 부모키" 번역(`parentKeyTranslation`)을 기록하고 자식의 그룹키 조회 전에 거치도록 했다(정방향 1패스, fixpoint 불필요). K8 로 고정.

실기(T3) 확인 — undo 보존·실제 리마운트 0회 육안 확인 — 은 사람 손 필요, `VERIFY_BY_HUMAN.md` 로 이월.

---

## 3. Step 5 — A1/A2: 뷰↔스토어 조정자 일원화 + diff 동기화

**[근본 원인 A1 — 이중 권위]** `useBlockStore`(`block.content`, `focusOffset`, `activeBlockId`)와 각 `EditorView`(`state.doc`, `state.selection`)가 **둘 다 권위를 주장**하고, 조정을 `BlockEditor.tsx` 안의 **서로 다른 두 이펙트**의 실행 순서에 맡긴다.

- 캐럿 복원 = `useLayoutEffect`
- 내용 동기화 = passive `useEffect`

React 는 layout effect 를 passive 보다 **먼저** 돌리므로 **캐럿이 옛 문서 위에 놓인 뒤 문서가 갈린다.**

이것이 개별 버그가 아니라 **계열**이라는 근거 — 최근 3건이 전부 "무엇을 하는가"가 아니라 **"어떤 순서로 선언·등록했는가"** 에 정확성이 걸려 있었다. 그 순서는 코드 어디에도 명시돼 있지 않고 **주석으로만 방어**된다(실제로 `BlockEditor.tsx:241-243`, `:253-255` 에 경고 주석이 있는데도 세 번째가 났다).

**[근본 원인 A2 — 평상시 전체 치환]**

```typescript
changes: { from: 0, to: currentDoc.length, insert: block.content }
```

문서 전체 치환이 **예외 경로가 아니라 평상시 동기화 경로**다. 커서를 삽입 텍스트 끝으로 이동시키고, undo 입도를 뭉개고, 데코레이션 위치를 무효화하고, 전체 재측정을 강제한다.

**[조치 방안]**

1. 블록 하나의 **"원하는 상태"**(content + selection + focus)를 **한 객체**로 만들고, 실제 `EditorView` 상태와의 차이를 **한 곳에서 한 번에** 적용한다. **이펙트 두 개 → 조정자 하나.**
2. 전체 치환 대신 **최소 차이(diff) 기반 변경**. 블록 내용은 대개 한두 글자만 다르므로 공통 접두/접미를 잘라낸 최소 범위 치환으로 충분하다. 이렇게 하면 커서·undo·데코레이션이 **자동으로** 보존되어 **A1 의 조정 부담 자체가 줄어든다.**

**[선행 — 이미 충족됨]** Step 3 의 `store.focusOffset === view.selection.main.head` 단언이 **먼저** 들어가 있어야 이 리팩터링의 회귀를 즉시 잡을 수 있다. 해당 불변식은 `2ec8a85` 에서 착지했다.

**[Edge Cases & Guards]**

- **IME 조합 중에는 diff 를 적용하지 않는다.** 조합 중 문서 치환은 Step 2-A 가 막 해소한 한글 입력 붕괴를 되살린다. `isImeComposingRef` + `view.composing` 이중 가드를 조정자 진입부에 그대로 가져갈 것.
- 외부 트랜잭션(`Transaction.userEvent === 'external'`) 배제 규칙을 조정자로 이관한다 — `updateListener` 가 이미 하고 있는 판정을 잃지 말 것.
- 리팩터링 도중 **주석으로만 방어되던 순서 제약을 코드로 승격**한다. 조정자가 단일 진입점이 되면 순서는 주석이 아니라 함수 본문의 문장 순서가 된다.

**[DoD]** R3 불변식 미발화 · 타이핑 중 undo 입도 유지(문자 단위로 뭉개지지 않음) · §6.2 R1~R6 전부 통과 · `pnpm test:ime` 회귀 0건.

---

## 4. Step 6 — A6: 마운트 비용 프로파일 → 판정 게이트

**[측정 실패 — T2(Chromium) 실측. WKWebView 는 더 느릴 가능성이 높으므로 하한으로 읽을 것]**

| N (블록) | 스토어 로직 | 마운트 완료 | 블록당 |
|---|---|---|---|
| 25 | 0.4 ms | 1,015 ms | 40.6 ms |
| 50 | 0.5 ms | 2,271 ms | 45.4 ms |
| 100 | 1.6 ms | 5,677 ms | 56.8 ms |
| **200** | **1.6 ms** | **7,024 ~ 17,423 ms** | **35 ~ 87 ms** |

예산은 **N=200 에서 300ms 이하** → **20~58배 초과**. 메모리는 블록당 42~98KB 로 예산(150KB) 내이므로 **문제는 오직 시간**이다.

**[두 가지 사실이 계획을 바꾼다]**

1. **스토어/파싱 최적화는 의미가 없다.** N=200 에서 스토어 로직 1.6ms — 비용의 거의 100%가 `EditorView` 생성이다.
2. **비용이 초선형이다**(성장 지수 ≈ 1.37). 각 인스턴스 생성이 이미 마운트된 문서 전체에 비례하는 일을 하고 있다는 뜻 — **레이아웃 스래싱** 형태다. (원인 귀속은 **추정**이며 프로파일이 필요하다.)

**[조치 순서 — 가상화로 직행하지 않는다]**

1. **먼저 레이아웃 스래싱을 프로파일한다.** 가상화보다 훨씬 싼 수단(마운트 배치 처리, `content-visibility: auto`, 생성 중 측정 지연)으로 상당 부분이 회수될 수 있다. **선형으로만 되돌려도 N=200 이 8초 → 1초대다.**
2. 그 다음에 가상화(E7)를 판정한다. 착수한다면 **높이 캐시 필수** — 높이 캐시 없는 가상화는 BUG-20260828-01(수직 이동 줄 스킵)과 **같은 계열의 결함을 재생산**한다. 윈도 크기는 뷰포트 **±2 화면 높이**, **캐럿 근처에서 마운트/언마운트가 절대 일어나지 않아야 한다.**
3. [`architecture_stages.md`](architecture_stages.md) Stage 3 의 캔버스 뷰포트 컬링과 **동일한 윈도잉 개념을 공유**하도록 설계해 중복 구현을 피한다.

**[결정 게이트 — `DEBUG_STEP_PLAN.md` §0.1 과 연결]**

| 프로파일 결과 | 판정 |
|---|---|
| 초선형 성분이 레이아웃 스래싱이고 **선형 회복 가능** | **현행 구조 유지.** 필요 시 가상화(높이 캐시 동반) |
| **선형 회복 불가** (비용이 `EditorView` 생성에 내재) | 「문서당 런타임 1개 + 블록 노드」 구조로의 전환을 **정식 안건화.** 이때 §0.1 의 결정을 재개봉한다 |

**[DoD]** 프로파일 결과와 위 표의 **판정을 문서에 기록**한다. 판정 없이 Step 7 로 넘어가지 않는다 — 이 게이트가 이 배치의 존재 이유다.

---

## 5. Step 7 — B4 구조 개편

> **원 정의**: [`DEBUG_PLAN_20260827_025711.md`](../claude-history/debug/DEBUG_PLAN_20260827_025711.md) §2 — `REF-01(1단계) → REF-02 → REF-01(2단계)` · 선행 `B1, B3`(둘 다 종결)

### 5-A. P0-3 Stage A-2 — 분할 패널 표시 불일치

**[파일 & 라인]** `project/src/pages/WorkspacePage/WorkspacePage.tsx:359` · `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:393`

**[현재 상태 — code_review 기술보다 진전됨]** `WorkspacePage.tsx:359` 는 이미 `<BlockEditor key={activeTab.id} paneId={pane.id} />` 로 **`paneId` 를 주입한다**(Option B 의 레지스트리 키잉 목적). 그러나 `BlockEditor.tsx:393` 은 여전히 `useDocumentStore(s => s.getCurrentFile())` = **활성 패널의 탭**으로 자기 문서를 유추한다. 즉 **배관은 깔렸고 문서 해석만 남았다.**

**[남은 증상]** 두 번째 패널이 자기 `activeTabId` 와 무관하게 활성 패널의 문서를 그린다(탭 바 제목과 본문 불일치). 비활성 패널에 타이핑하면 `ownerTabId` 가드에 걸려 입력이 **조용히 무시**된다(오염 대신 무반응).

**[조치 방안]** `PaneContainer` 가 `<BlockEditor tab={activeTab} isActivePane={pane.id === activePaneId} />` 를 주입하고, **비활성 패널은 `readOnly` 렌더**(내용은 `tab.cache?.rawContent ?? ''`). **전역 `blockStore` 를 편집하는 인스턴스를 상시 1개로 제한하는 것이 목적이다.**

**[Edge Cases & Guards]**

- 패널 포커스 전환(`setActivePane`) 시 **이전 활성 패널을 먼저 `_snapshotActiveTab()`** 한 뒤 소유권 이전.
- 동일 파일을 두 패널에 열면 캐시가 갈라지므로 Stage A 에서는 **중복 오픈 시 기존 패널로 포커스 이동**으로 회피.

### 5-B. REF-02 / P1-3 — 경계 전환 시 `blockStore` 잔존 *(조건부)*

**[파일 & 라인]** `project/src/entities/workspace/model/store.ts:40, 59` · `project/src/entities/document/model/store.ts:311`

**[현재 상태]** `openWorkspace` / `openWorkspaceByPath` 는 `resetDocumentState()` 만 호출한다. **`resetBlocks` 는 소스 트리에 존재하지 않는다.** `useBlockStore.blocks` 는 이전 워크스페이스 문서의 전체 트리를 유지하며, (a) 앱 생명주기 동안 회수되지 않는 메모리이고 (b) 다음 문서 로드 시 `existingByKey` ID 매칭의 입력이 되어 **문서 간 블록 identity 가 누수**된다. `viewMode` 도 리셋 대상에서 빠져 있다.

**[조치 방안]**

```typescript
resetBlocks: () => set({ blocks: [], activeBlockId: null, focusOffset: 0, ownerTabId: null })
```

를 `blockStore` 에 추가하고 `resetDocumentState` 에서 함께 호출(`viewMode: 'write'` 포함).

> ⚠️ **건너뛰기 판단**: 5-C(탭 스코프 스토어)를 곧바로 진행할 계획이면 **REF-02 는 구조적으로 소멸**하므로 건너뛰어도 무방하다. 5-C 착수가 불확실할 때만 5-B 를 먼저 넣는다.

### 5-C. REF-01 2단계 / P0-3 Stage B — 탭 스코프 스토어

`rawContent / blocks / nodes / isDirty / viewMode` 를 `PaneContainer` 내부에서 생성하는 **React Context 기반 탭 스코프 스토어**(`createTabStore(tabId)`)로 이관한다. **`ownerTabId` 스캐폴딩은 여기서 소멸한다.**

> ⚠️ **반드시 함께 처리할 것**: [`advanced_rendering_optimization.md`](../advanced_rendering_optimization.md) **Phase 1(상태 스냅샷)** 과 **동일 지점**이다. 분리해서 진행하면 스냅샷 인터페이스를 **두 번 설계**하게 된다. `serialize()` / `hydrate()` 를 **Phase 2 TTL 언마운터의 계약으로 확정**할 것.
>
> **부수 효과**: 이 계약이 확정되면 그것이 곧 [`architecture_stages.md`](architecture_stages.md) **Stage 2 Thin Client** IPC 경계(`getBlockTree(tabId)`, `updateBlock(tabId, blockId, content)`)의 초안이 된다. **스레드/프로세스 분리는 여기서부터 싸진다.**

**[DoD]** R2(탭 3개 전환 왕복 교차 오염 0) · R6(워크스페이스 전환 잔존 0) · `ownerTabId` 가 소스 트리에서 소멸 · `serialize()`/`hydrate()` 계약 문서화.

---

## 6. 위험 및 주의

1. **Step 5 는 한글 입력 경로를 정면으로 건드린다.** Step 2-A 가 막 해소한 영역이다. 조정자에 IME 이중 가드를 옮기지 않으면 조합이 깨진다. `pnpm test:ime` 를 리팩터링 전후로 비교할 것.
2. ~~Step 4 는 `buildHeadingId` 호출부 2곳을 함께 옮긴다.~~ **(완료 시점에 정정)** 실제로는 `buildHeadingId` 를 손대지 않고 `block/store.ts` 의 **매칭 로직**만 2-패스로 바꿨다 — `parser.ts` 무변경이라 "두 벌 정체성 체계" 위험 자체가 발생하지 않았다. §2 참고.
3. **Step 6 의 판정을 생략하지 말 것.** "일단 가상화부터"는 이 배치가 명시적으로 금지하는 경로다. 프로파일 없이 착수하면 원인 귀속이 추정인 채로 큰 구조를 바꾸게 된다.
4. **Step 7-C 는 되돌리기 비싸다.** Step 6 판정이 "스택 교체 안건화"로 나오면 7-C 설계 전제가 바뀌므로 **판정 이후에 착수**한다.
5. **`ownerTabId` 는 일회용 스캐폴딩이다.** 5-C 전까지 새 코드가 여기 의존하는 것을 늘리지 말 것.
6. **워크스페이스 scope 는 append-only 다.** 직전 배치 Step 1-A 의 잔여 리스크 — 세션 중 연 모든 워크스페이스 루트가 허용 상태로 남는다(Tauri `Scope` 에 제거 API 없음). 7 에서 워크스페이스 경계를 건드릴 때 이 사실을 전제로 둘 것.

---

## 7. 이월 항목 (직전 배치에서 미종결)

> Step 1~3 배치는 코드 작업을 전부 끝냈으나 **사람 손이 필요한 실기 검증이 남았다.** 상세와 수행 절차는 [`VERIFY_BY_HUMAN.md`](VERIFY_BY_HUMAN.md) 에 있다. 본 배치와 **독립적으로** 진행 가능하다.

| # | 항목 | 상태 |
|---|---|---|
| 1 | S5 번들 앱 이미지·코드블록 육안 확인 | ⚠️ 사용자 실기 보고 있었으나 **재현 안 됨** — 재발 시 재보고 |
| 2 | S5 `pnpm tauri build` 후 HMR 무관 정상 동작 | ❌ 사람 손 |
| 3 | S2 네트워크 요청 0건 | ⚠️ 불확정 — `asset://` 가 Resource Timing 에 안 잡힘. OS 레벨 계측 필요 |
| 4 | S2 **프로덕션** `csp` 자체 재확인 | ❌ 자동 검증은 `devCsp`(더 느슨) 기준이었음 |
| 5 | 워크스페이스 밖 드래그·드롭 이미지 — 기능 + 핫픽스 재검증 | ⚠️ 진행 중 |
| 6 | R7 `.devoras/images` 렌더 자동 게이트 재실행 | ❌ 미실행 |

> **완료 시**: `VERIFY_BY_HUMAN.md` 의 결과를 반영하고 해당 문서를 삭제한다.

---

## 8. 보류 / 미편입 티켓

> 위 Step 에 들어가지 않았으나 열려 있는 항목. **착수 전 재평가한다.**

| ID | 내용 | 상태 | 비고 |
|---|---|---|---|
| BUG-20260828-04 | `---` 라인 ArrowUp 스킵 | ◻ 보류(고립) | A3 수정 후에도 남은 잔여. 재현 조건이 좁다 |
| BUG-20260828-05 | 한글 IME — 앱 실행/포커스 전환 직후 첫 조합 간헐 실패 | ◻ Todo | **Step 5 와 같은 코드 경로**(입력 이벤트). 5 착수 시 함께 재현 시도할 것 |
| BUG-20260828-06 | 위젯 `toDOM` 예외가 CodeMirror 뷰·React 서브트리를 붕괴시킴 | ◻ Todo | 데코레이터 중재 인프라(§S.4)와 인접 |
| P1-9 | `.cm-line *` 전역 리셋이 Write Mode 위젯 타이포그래피 무력화 | ◻ B5(독립 배치) | 사용자에게 즉시 보이는 표시 결함. **언제든 착수 가능.** 실행 사양서: [`IMPL_PLAN_20260826_2349_widget_typography.md`](../claude-history/impl/IMPL_PLAN_20260826_2349_widget_typography.md) |
| Open Q #5 | 데코레이터 중재 인프라(`priority`/`claims`)를 언제 넣을까 | ⏳ 미결정 | `protectedRegions.ts` 의 N² 부채가 그때까지 유지된다. 상세: [`implementation_plan.md`](../implementation_plan.md) 「스파이크」 §S.4 |
| P2-4~P2-8 | 코드 품질 (`codeContent` O(N²), `generateId` 충돌, 미종료 펜스, Rust panic 등) | ◻ 미착수 | 영향도 낮음 |
| A4 (T3 심화) | 상시 디버그 채널 | ◻ 미착수 | 없으면 T3 결론이 계속 휘발된다. 검증이 아니라 **기능**이므로 별도 판단 사항 |

---

## 9. 검증 티어와 공통 게이트

### 9.1 티어

| 티어 | 수단 | 실행 |
|---|---|---|
| **T1** 순수 로직 | Node 24 + `scripts/ts-hook.mjs`(`@/` 별칭·확장자 해석) | `pnpm test:t1` (8 하네스) |
| **T2** 레이아웃 | `MockFileSystem` 덕에 앱이 Chromium 에서 그대로 구동 | `pnpm dev` + playwright |
| **T3** 실기 | 설정 변경 없이 콘솔 한 줄 | `pnpm tauri:dev` → `tauri_t3_harness.ts` |

> **런타임 고정**: Node 24 LTS(`.nvmrc`, `engines`). 새 환경은 `nvm use` 로 시작한다.

```bash
pnpm test:t1
```

```bash
cd project/src-tauri && cargo test
```

T3 하네스:

```bash
pnpm tauri:dev
```

콘솔에서:

```
const t3 = await import('/src/widgets/BlockEditor/__tests__/tauri_t3_harness.ts'); await t3.run()
```

### 9.2 중간 불변식 (A5) — 이 배치에서 심을 것

> Step 3 에서 R3·R10 이 착지했다. **나머지는 해당 게이트를 건드리는 Step 에서 함께 심는다.**

| 게이트 | 중간 불변식 | 심을 시점 |
|---|---|---|
| R10 수직 이동 델타 ±1 | `drift === 0` | ✅ 적용 완료 |
| R3 병합 후 캐럿 유지 | `store.focusOffset === view.selection.main.head` | ✅ 적용 완료(`2ec8a85`) |
| **G1 뷰 인스턴스 동일성** | **리마운트 0회** | **✅ 적용 완료 — T1(`test:blockkey` K4/K5/K7) + DEV `console.debug` 생성/파괴 로그(`BlockEditor.tsx`)** |
| B1 dirty 표시 | `isDirty === (내용 !== 디스크 내용)` | Step 7-C(탭 스코프 이관 시) |
| V3/V4/V6 스크롤 0px | `scrollHeight > clientHeight` | Step 6(프로파일 중) |
| V1~V4 scrollTop 0px | 프레임 간 `block.top` 변화량 = 0 | Step 6 |

**[공통 규칙]** `import.meta.env.DEV` 가드로 프로덕션 배제 · 실패는 throw 가 아니라 `console.error` + 스택.

### 9.3 배치 종료 시 공통 회귀

| # | 항목 | 기준 |
|---|---|---|
| R1 | 문서 열기 → 편집 → `Cmd+S` | 디스크 반영 및 dirty 해제 |
| **R2** | **탭 3개 전환 왕복** | **각 탭 내용 유지, 교차 오염 0건** (Step 7 의 핵심) |
| **R3** | **한글 연속 입력** | **조합 끊김 · 텍스트 증식 0건** (Step 5 의 핵심 위험) |
| R4 | `.devoras/images` 이미지 | Read/Write 양쪽 렌더링 |
| **R5** | **좌우 분할 후 패널 닫기** | **탭 병합 정상, 최소 1패널 유지** (Step 7-A 의 핵심) |
| **R6** | **워크스페이스 전환** | **이전 문서 내용 잔존 0건** (Step 7-B/C 의 핵심) |

### 9.4 커밋 규칙

`.agents/AGENTS.md` 를 따른다. 코드 변경 커밋은 **커밋 전 패치 버전업**(`project/package.json` · `project/src-tauri/Cargo.toml` · `project/src-tauri/tauri.conf.json` + `Cargo.lock` 동시 갱신). **문서만 변경한 커밋은 버전을 올리지 않는다.** **티켓 1건 = 커밋 1건**을 원칙으로 하고 커밋 메시지에 티켓 ID 를 포함한다.

```
fix(0.8.39): 헤딩 정체성 분리 (A7)
```

> **동시 작업 주의**: 이 저장소는 여러 세션이 같은 워킹 트리를 공유한다. `git add -A` 대신 **경로를 명시해 스테이징**하고, `Cargo.lock`·`lib.rs` 처럼 충돌하기 쉬운 파일은 커밋 직전에 `git status` 로 확인할 것.

---

## 10. DoD (배치 종료 조건)

**Step 4 (A7)**

- [x] 헤딩 렌더 key(`EditorBlock.id`)가 내용에서 파생되지 않음 — 애초에 `generateId()` 불투명 토큰이었고, 이번에 매칭 로직을 2-패스(콘텐츠 키 우선 + 위치 폴백)로 고쳐 제목 편집으로도 안 바뀌게 함
- [x] `parser.ts:53` · `block/store.ts:66` 관계 확인 — `parser.ts` 무변경, `buildHeadingId` 그대로 공유(매칭 키로 축소 확인). 두 벌 정체성 체계 위험 없음
- [x] 제목 변경 → 헤딩 추가/삭제 시 `EditorView` 인스턴스 동일성 유지 — T1(K4/K5) + G1 DEV 로그로 계측
- [ ] undo 히스토리 보존 확인 — 뷰 인스턴스 비파괴로 구조적 보장, **실기(T3) 확인은 사람 손 필요**
- [x] MindView 링크 회귀 0건 — `parser.ts` 코드 변경 0건으로 구조적 충족
- [x] (신규 발견) 재정렬(`reorderBlocks`, 드래그앤드롭) id 안정성 — K7 로 확인, 순수 위치 기반안이었다면 회귀했을 것

**Step 5 (A1/A2)**

- [ ] 두 이펙트 → 조정자 1개로 통합
- [ ] 전체 문서 치환 제거, 최소 diff 치환으로 전환
- [ ] IME 이중 가드 · `external` 트랜잭션 배제 규칙 조정자로 이관
- [ ] R3 불변식 미발화 · `pnpm test:ime` 회귀 0건
- [ ] 타이핑 중 undo 입도 유지

**Step 6 (A6)**

- [ ] 레이아웃 스래싱 프로파일 완료 (가상화 착수 **이전**)
- [ ] §4 결정 게이트 표의 **판정을 문서에 기록**
- [ ] 판정이 "선형 회복 가능"이면 회수 수단 적용 후 N=200 재측정

**Step 7 (B4)**

- [ ] **7-A** 비활성 패널이 자기 탭 문서를 그림 (탭 바 제목과 본문 일치)
- [ ] **7-A** 비활성 패널 `readOnly` · 패널 전환 시 `_snapshotActiveTab()` 선행
- [ ] **7-B** 5-C 착수 확정 시 **건너뜀**을 문서에 기록 / 미확정이면 `resetBlocks` 추가
- [ ] **7-C** 탭 스코프 스토어 이관 · `ownerTabId` 소스 트리에서 소멸
- [ ] **7-C** `serialize()` / `hydrate()` 계약 문서화 (Phase 2 TTL 언마운터와 공유)

**공통**

- [ ] §9.3 R1~R6 전부 통과
- [ ] `pnpm test:t1` 8 하네스 · `cargo test` 유지

---

## 11. 다음 갱신 시점

Step 4 또는 Step 5 종료 시 [`DEBUG_STEP_PLAN.md`](../DEBUG_STEP_PLAN.md) 의 해당 Step 을 §1 완료 요약으로 내린다. 본 배치가 종결되면 이 문서는 `claude-history/debug/DEBUG_PLAN_[datetime].md` 로 아카이브한다.

> **Step 6 의 판정이 "스택 교체 안건화"로 나오는 경우**, 다음 문서는 DEBUG_PLAN 이 아니라 **아키텍처 전환 안건서**가 된다. `DEBUG_STEP_PLAN.md` §0.1 의 결정을 그때 재개봉한다.
