# DEBUG_STEP_PLAN.md — 단계별 결함 해소 계획

> **최종 갱신**: 2026-08-30 | **대상 버전**: `v0.8.32` | **브랜치**: `fix/vertical-motion-and-verification-tier`
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
| B2 보안 (L1·L4-deny·L3·L2) | 새니타이즈·CSP·Rust 경로 검증·민감 경로 deny 착지 (v0.8.28~0.8.31). **잔여는 §2 Step 1** | [`project/DEBUG_PLAN.md`](project/DEBUG_PLAN.md) (현행) |

### 1.1 완료분 중 이후 작업이 의존하는 사실 3가지

1. **검증 티어가 살아 있다.** T1 은 이번 사이클 전까지 **한 번도 실행 가능한 적이 없었다**(Node 20 에 없는 플래그). 런타임은 Node 24 LTS 로 고정됐다(`.nvmrc`, `engines`). 새 환경은 `nvm use` 로 시작한다.
2. **`ownerTabId` 는 일회용 스캐폴딩이다.** Step 7 의 탭 스코프 스토어가 완성되면 소멸시킨다.
3. **`requireLiteralLeadingDot: false` 는 건드리지 않는다.** Step 1 의 scope 축소에서 가장 흔한 회귀 경로다.

---

## 2. 지금 해결할 것

```
Step 1  B2 잔여 ─┐
Step 2  B3 입력   ├─ 즉시 (독립 · 병렬 가능)
Step 3  A5 불변식 ─┘
        ↓
Step 4  A7 헤딩 정체성  ← 남은 결함 중 유일하게 데이터(undo) 손실
        ↓
Step 5  A1/A2 조정자 일원화 + diff 동기화
        ↓
Step 6  A6 프로파일 → 가상화/스택 판정 게이트
        ↓
Step 7  B4 구조 개편 (P0-3 Stage A-2 → Stage B 탭 스코프 스토어)
```

---

### Step 1 — B2 잔여: 보안 경계 마감

> 배치 B2 의 마지막 조각. 구현은 끝났고 **범위 축소 1건 + 실기 검증 4건**이 남았다.

#### 1-A. L4-scope — `allow: ["**"]` 제거 (미착수)

**[파일 & 라인]** `project/src-tauri/tauri.conf.json` (`app.security.assetProtocol.scope`), `project/src-tauri/capabilities/default.json`

**[현재 상태]**

```json
"scope": { "allow": ["**"], "deny": ["$HOME/.ssh/**", "$HOME/.aws/**", "$HOME/.gnupg/**", "$HOME/.config/**", "$HOME/.env*"] }
```

**[근본 원인]** deny 는 **열거된 것만** 막는다. allow 가 `"**"` 인 한 열거되지 않은 경로(`~/Documents/**` 등)는 그대로 읽힌다. deny 는 완화책이지 경계가 아니다.

**[조치 방안]**
- `allow` 를 워크스페이스 루트 기준으로 좁힌다. Rust `WorkspaceRoot` 상태(L3 에서 도입)가 이미 있으므로 런타임 scope 갱신 경로를 함께 검토한다.
- `capabilities/default.json` 의 **`fs:allow-home-read-recursive` / `fs:allow-home-write-recursive` 2건**도 이 단계 대상이다. L4-deny 커밋이 제거한 8건은 desktop/document/download 6건 + `dialog:allow-message` + `shell:allow-open` 이었고 home 재귀는 남아 있다.
- `requireLiteralLeadingDot: false` **유지**(§1.1-3).

**[Edge Cases & Guards]**
- 워크스페이스 전환 시 scope 재설정 타이밍. 이전 워크스페이스 경로가 살아 있으면 축소의 의미가 없다.
- `.devoras/images` 최초 생성 경로(L3 의 `ensure_inside` 조상 탐색 일반화가 다루는 케이스)가 scope 축소로 다시 깨지지 않는지.

**[DoD]** DEBUG_PLAN 규정대로 **PoC 1시간 선행** 후 판단. 이미지 렌더링 회귀 0건이 절대 조건.

#### 1-B. T3 실기 검증 잔여

| # | 항목 | 상태 | 막힌 이유 |
|---|---|---|---|
| S4 | `asset://.../.ssh/id_rsa` 403 실측 | ❌ | OS 권한(Accessibility·Screen Recording) |
| S5 | 번들 앱에서 이미지·코드블록 육안 확인 | ❌ | 〃 |
| S5 | `pnpm tauri build` 후 HMR 무관 정상 동작 | ❌ | 〃 |
| S2 | 콘솔 CSP 위반 로그·네트워크 0건 | ❌ | Tauri MCP Bridge 가 `tauri://` 커스텀 프로토콜과 비호환 |

**전부 사람이 직접 수행해야 하는 항목이다.** 1-A 를 건드리면 S4·S5 는 어차피 재실행해야 하므로 **1-A 와 묶어서 한 번에** 처리한다.

**[DoD]** 위 4건 실측 + `pnpm test:sanitizer` 14/14 + `cargo test` 6/6 유지.

---

### Step 2 — B3 입력 안정성 (실질 2건)

> **원 정의**: [`DEBUG_PLAN_20260827_025711.md`](claude-history/debug/DEBUG_PLAN_20260827_025711.md) §2 — 티켓 `BUG-08 → BUG-11, BUG-09, BUG-10` · 선행 `B1` · 게이트 `IME 하네스 회귀 0건`
> **선행 조건 충족**: B1 종결됨. 그리고 원래의 순서 제약 `BUG-08 → BUG-11`(키 충돌 해소가 선행)은 **BUG-08 이 G0 로 이미 해소**되어 만족된 상태다.

#### 2-0. 코드 대조 결과 — 4건 중 2건은 이미 소멸

| 티켓 | 계획 내용 | 2026-08-30 실태 |
|---|---|---|
| BUG-20260826-08 비헤딩 블록 키 충돌 | 위치 기반 키 | ✅ **해소** — G0 가 `${parentId}-textblock-${index}` 로 전환 (`project/src/entities/block/model/store.ts:60-65`) |
| BUG-20260826-10 활성 뷰 포인터 null | 소유권 가드 | ✅ **구조적 소멸** — 전역 싱글턴이 `project/src/shared/lib/editorViewRegistry.ts` 로 교체. `unregisterEditorView` 가 `caretHolder.get(paneId) === blockId` 일 때만 정리하므로 무관한 블록 파괴가 포인터를 비우지 않는다 |
| **BUG-20260826-09** 입력당 `onUpdate` 2회 | `domEventHandlers.input` 제거 | ❌ **잔존** |
| **BUG-20260826-11** 병합 regex + 포커스 복원 | `#{1,6}` + 재생성 후 재조회 | ❌ **잔존** |

#### 2-A. BUG-20260826-09 — 키 입력 1회당 `onUpdate` 2회 호출 *(= code_review P1-5)*

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:199-208`(`domEventHandlers.input`) · `:209-227`(`updateListener`)

**[근본 원인]** 일반 타이핑에 대해 **둘 다 발화**하며 각각 `callbacksRef.current.onUpdate` 를 호출한다. `setDirty`·`findOldContent`·`countHeadings`·`updateBlockContent` 가 문자당 두 번 실행되고 150ms 디바운스도 두 번 재설정된다.

**[조치 방안]** `domEventHandlers.input` 핸들러를 **삭제**한다. `updateListener` 가 상위 호환이다 —

| | `input` 핸들러 | `updateListener` |
|---|---|---|
| IME 가드 | `inputEvent.isComposing` 만 | `isImeComposingRef.current` + `update.view.composing` **이중** |
| 외부 트랜잭션 필터 | 없음 | `tr.annotation(Transaction.userEvent) === 'external'` 배제 |
| 문서 변경 판정 | 없음 | `update.docChanged` |

**[Edge Cases & Guards]** 이 수정은 한글 입력 경로를 직접 건드린다. **R3(한글 연속 입력)이 이번 배치의 핵심 위험 지점**이다. `pnpm test:ime` 를 수정 전후로 각각 돌려 비교할 것.

**[DoD]** 타이핑 1회당 `onUpdate` 정확히 1회(계측) · `pnpm test:ime` 회귀 0건 · R3 수동 확인.

#### 2-B. BUG-20260826-11 — 병합 regex 및 포커스 복원 *(= code_review P1-7)*

**[파일 & 라인]** `project/src/entities/block/model/store.ts:215` · `:230-233`

**[근본 원인 — 두 갈래]**

1. `parseHeadingLine` 은 `#{1,6}` 을 인식하는데 `cleanedCurrentText` 는 `replace(/^#{1,4}\s*/, '')` 다. **H5/H6 블록을 병합하면 `##### ` 리터럴이 본문에 남는다.**
2. 더 심각한 쪽은 순서다. `setBlocksFromContent(fullText)` 로 트리를 **재생성한 뒤** `set({ activeBlockId: previousBlock.id })` 를 실행한다. 재생성에서 새 `id` 가 부여되면 그 ID 는 더 이상 존재하지 않고 Backspace 병합 직후 포커스가 사라진다.

**[조치 방안]**

```typescript
const cleanedCurrentText = currentBlock.content.replace(/^#{1,6}\s*/, '');
// ...
get().setBlocksFromContent(fullText, get().ownerTabId ?? undefined);
const rebuilt = flattenTree(get().blocks);           // 재생성 후 "위치"로 해석
set({ activeBlockId: rebuilt[index - 1]?.id ?? null, focusOffset });
```

**[Step 4 와의 관계]** 비헤딩 블록은 G0 로 안정됐지만 **헤딩 블록의 id 는 아직 라벨에서 파생된다**(`project/src/entities/block/model/store.ts:66` `buildHeadingId(parsed.label, …)` — A7). 따라서 헤딩을 병합하면 재생성 시 id 가 바뀔 수 있고, 위 "위치로 재조회" 패치는 **A7 의 부분 완화**이기도 하다. 근본 해소는 Step 4.

**[DoD]** H1~H6 각각 병합 시 헤딩 마크 잔여 0건 · 병합 직후 캐럿이 병합 지점에 존재 · Step 3 의 불변식 단언이 발화하지 않을 것.

---

### Step 3 — A5 중간 불변식 심기 (비용 거의 0, 회수 큼)

> **근거**: [`ARCHITECTURE_FINDINGS.md`](ARCHITECTURE_FINDINGS.md) A5 — 게이트가 **최종 증상만** 관측한다. §9.6 은 T3 실기 한 세션을 통째로 쓰고도 원인에 도달하지 못했고, 같은 버그가 `drift` 라는 중간량을 재자 **한 번의 측정**으로 풀렸다.

개발 빌드 전용 런타임 단언을 게이트마다 하나씩 붙인다. **Step 2 와 같은 커밋에서 처리하는 것을 권장한다** — BUG-11 의 DoD 가 정확히 아래 R3 항목이기 때문이다.

| 최종 증상 게이트 | 붙일 중간 불변식 | 상태 |
|---|---|---|
| R10 수직 이동 델타 ±1 | `drift === 0` | ✅ 적용 완료 |
| **R3 병합 후 캐럿 유지** | **`store.focusOffset === view.selection.main.head`** | ❌ **이번 대상.** 이것만 있었으면 BUG-20260828-02 는 즉시 드러났다 |
| B1 dirty 표시 | `isDirty === (내용 !== 디스크 내용)` | ❌ 저장 **이후**를 보는 케이스가 없어 결함이 숨어 있었다 |
| V3/V4/V6 스크롤 0px | `scrollHeight > clientHeight` (컨테이너가 실제로 넘치는가) | ❌ 아니면 0px 가 공허하게 통과한다 |
| V1~V4 scrollTop 0px | 프레임 간 `block.top` 변화량 = 0 | ❌ |
| G1 캐럿 안정성 | 뷰 인스턴스 동일성(리마운트 0회) | ❌ |

**[Edge Cases & Guards]** 프로덕션 빌드에서 배제될 것(`import.meta.env.DEV` 가드). 단언 실패는 throw 가 아니라 `console.error` + 스택으로 남겨 편집을 중단시키지 않을 것.

---

### Step 4 — A7 헤딩 정체성 분리

> **우선순위 근거**: 남아 있는 구조 결함 중 **유일하게 데이터 손실(undo 히스토리)을 만든다.**

**[파일 & 라인]** `project/src/entities/block/model/store.ts:66` · `project/src/shared/lib/headingId.ts:12` · `project/src/entities/document/lib/parser.ts:53` · `project/src/widgets/BlockEditor/ui/BlockEditor.tsx`(렌더 `key={rootBlock.id}`)

**[근본 원인]** 헤딩 블록의 키가 헤딩 라벨에서 파생된다. T1 로 확인된 사실:

```
'## 원래제목'  →  id x9937oh
'## 바뀐제목'  →  id wi2lrio      ← 제목만 고쳤는데 정체성이 바뀐다
```

렌더가 `key={rootBlock.id}` 이므로 id 가 바뀌면 React 가 언마운트→재마운트하고 정리 함수가 `view.destroy()` 를 호출한다. G0 은 생성 이펙트의 **의존성 배열**에서 `block.id` 를 뺐지만(`BlockEditor.tsx:239`), **React key 를 통한 파괴 경로는 그대로 열려 있다.**

**[완화 요인 — 그래서 지금 당장 터지지는 않는다]** 키 재파생은 헤딩 **개수**가 변할 때만 일어난다(`handleBlockUpdate` 가 `oldHeadingCount !== newHeadingCount` 로 가드). **위험 창**은 "제목을 고친 뒤 어딘가에서 헤딩을 추가/삭제하거나 블록을 병합/분할하는 순간"이며, 그때 그 블록의 undo 히스토리가 조용히 사라진다.

**[조치 방안]** 헤딩도 위치 기반 정체성으로 옮기고 라벨은 **표시용 속성**으로만 둔다. MindNode 링크가 헤딩 라벨 id 에 의존하므로(주석의 "Legacy support for MindNode linking"), **링크용 키와 렌더 정체성 키를 분리**한다. 원칙: **렌더 key 는 절대 내용에서 파생하지 않는다.**

**[Edge Cases & Guards]** `parser.ts:53` 과 `block/store.ts:66` 이 같은 `buildHeadingId` 를 공유하므로(code_review 「잘 유지되고 있는 부분」의 `headingId.ts` 단일화) **양쪽 호출부를 함께** 옮겨야 한다. MindView 의 기존 링크 호환성 확인 필수.

**[DoD]** 제목 변경 → 헤딩 추가/삭제 시나리오에서 편집 중이던 블록의 `EditorView` 인스턴스 동일성 유지(Step 3 의 G1 불변식으로 측정) · undo 히스토리 보존 · MindView 링크 회귀 0건.

---

### Step 5 — A1/A2: 뷰↔스토어 조정자 일원화 + diff 동기화

**[근본 원인 A1]** `useBlockStore`(`block.content`, `focusOffset`, `activeBlockId`)와 각 `EditorView`(`state.doc`, `state.selection`)가 **둘 다 권위를 주장**하고, 조정을 `BlockEditor.tsx` 안의 **서로 다른 두 이펙트**(캐럿 복원 = `useLayoutEffect`, 내용 동기화 = passive `useEffect`)의 실행 순서에 맡긴다. React 는 layout effect 를 passive 보다 먼저 돌리므로 캐럿이 옛 문서 위에 놓인 뒤 문서가 갈린다.

이것이 개별 버그가 아니라 **계열**이라는 근거 — 최근 3건이 전부 "무엇을 하는가"가 아니라 **"어떤 순서로 선언·등록했는가"** 에 정확성이 걸려 있었다. 그 순서는 코드 어디에도 명시돼 있지 않고 주석으로만 방어된다(실제로 `BlockEditor.tsx:241-243`, `:253-255` 에 경고 주석이 있는데도 세 번째가 났다).

**[근본 원인 A2]** `changes: { from: 0, to: currentDoc.length, insert: block.content }` — 문서 전체 치환이 **예외 경로가 아니라 평상시 동기화 경로**다. 커서를 삽입 텍스트 끝으로 이동시키고, undo 입도를 뭉개고, 데코레이션 위치를 무효화하고, 전체 재측정을 강제한다.

**[조치 방안]**
1. 블록 하나의 "원하는 상태"(content + selection + focus)를 **한 객체**로 만들고, 실제 `EditorView` 상태와의 차이를 **한 곳에서 한 번에** 적용한다. 이펙트 두 개 → 조정자 하나.
2. 전체 치환 대신 **최소 차이(diff) 기반 변경**. 블록 내용은 대개 한두 글자만 다르므로 공통 접두/접미를 잘라낸 최소 범위 치환으로 충분하다. 이렇게 하면 커서·undo·데코레이션이 **자동으로** 보존되어 A1 의 조정 부담 자체가 줄어든다.

**[선행]** Step 3 의 `store.focusOffset === view.selection.main.head` 단언이 **먼저** 들어가 있어야 이 리팩터링의 회귀를 즉시 잡을 수 있다.

---

### Step 6 — A6: 마운트 비용 프로파일 → 판정 게이트

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
2. 그 다음에 가상화(E7)를 판정한다. 착수한다면 **높이 캐시 필수** — 높이 캐시 없는 가상화는 BUG-20260828-01(수직 이동 줄 스킵)과 **같은 계열의 결함을 재생산**한다. 윈도 크기는 뷰포트 **±2 화면 높이**, 캐럿 근처에서 마운트/언마운트가 절대 일어나지 않아야 한다.
3. `architecture_stages.md` Stage 3 의 캔버스 뷰포트 컬링과 **동일한 윈도잉 개념을 공유**하도록 설계해 중복 구현을 피한다.

**[결정 게이트 — §0.1 과 연결]**

| 프로파일 결과 | 판정 |
|---|---|
| 초선형 성분이 레이아웃 스래싱이고 **선형 회복 가능** | 현행 구조 유지. 필요 시 가상화(높이 캐시 동반) |
| **선형 회복 불가** (비용이 `EditorView` 생성에 내재) | 「문서당 런타임 1개 + 블록 노드」 구조로의 전환을 **정식 안건화**. 이때 §0.1 의 결정을 재개봉한다 |

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
| BUG-20260828-05 | 한글 IME — 앱 실행/포커스 전환 직후 첫 조합 간헐 실패 | ◻ Todo | **Step 2-A 와 같은 코드 경로**(입력 이벤트). 2-A 착수 시 함께 재현 시도할 것 |
| BUG-20260828-06 | 위젯 `toDOM` 예외가 CodeMirror 뷰·React 서브트리를 붕괴시킴 | ◻ Todo | 데코레이터 중재 인프라(§S.4)와 인접 |
| P1-9 | `.cm-line *` 전역 리셋이 Write Mode 위젯 타이포그래피 무력화 | ◻ B5(독립 배치) | 사용자에게 즉시 보이는 표시 결함. 언제든 착수 가능. 실행 사양서: [`IMPL_PLAN_20260826_2349_widget_typography.md`](claude-history/impl/IMPL_PLAN_20260826_2349_widget_typography.md) |
| Open Q #5 | 데코레이터 중재 인프라(`priority`/`claims`)를 언제 넣을까 | ⏳ 미결정 | `protectedRegions.ts` 의 N² 부채가 그때까지 유지된다. 상세: [`implementation_plan.md`](implementation_plan.md) 「스파이크」 §S.4 |
| P2-4~P2-8 | 코드 품질 (`codeContent` O(N²), `generateId` 충돌, 미종료 펜스, Rust panic 등) | ◻ 미착수 | 영향도 낮음 |
| A4 (T3 심화) | 상시 디버그 채널 | ◻ 미착수 | 없으면 T3 결론이 계속 휘발된다. 검증이 아니라 **기능**이므로 별도 판단 사항 |

---

## 4. 검증 티어와 공통 게이트

### 4.1 티어

| 티어 | 수단 | 실행 |
|---|---|---|
| **T1** 순수 로직 | Node 24 + `scripts/ts-hook.mjs`(`@/` 별칭·확장자 해석) | `pnpm test:t1` (8 하네스) |
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

## 5. 문서 드리프트 — 정정 대상

> 2026-08-30 코드 대조에서 **문서 기술이 실제 코드보다 낡은 것으로 확인된** 항목. 후속 작업 시 "미해결"로 오인하지 말 것.

| 문서 | 위치 | 기술 | 실제 (2026-08-30) |
|---|---|---|---|
| `code_review.md` | §P0-5 본문 (304행~) | "`confirmDiscardIfDirty` / `hasDirtyTabs` / `onCloseRequested` — 소스 트리 전체에 존재하지 않습니다" | **전부 존재.** `project/src/pages/WorkspacePage/lib/confirmClose.ts`, `App.tsx:67`, `WorkspacePage.tsx:66`·`:307`. B1 에서 종결됨 |
| `code_review.md` | §조치 우선순위 요약 | P0-5 를 **2순위**로 배치 | 해소됨. 표 전체가 "v0.8.5 기준" 스냅샷이라 재정렬 필요 |
| `code_review.md` | §P0-3 | "`WorkspacePage.tsx:353` 이 여전히 `<BlockEditor key={activeTab.id} />` **무인자**" | `:359` 에서 **`paneId={pane.id}` 주입 중.** 잔존 결함은 `BlockEditor.tsx:393` 의 `getCurrentFile()` 문서 유추뿐 (§2 Step 7-A) |
| `code_review.md` | §배치별 상태 B3 | "BUG-08·09·10·11" 4건 | **실질 2건** (BUG-08 은 G0, BUG-10 은 레지스트리 도입으로 소멸 — §2 Step 2-0) |
| `code_review.md` | §P1-6 | `setActiveEditorView(null)` 무조건 호출 | 해당 코드 없음. `editorViewRegistry` 로 대체됨 |

---

## 6. 다음 갱신 시점

Step 1 또는 Step 2 종료 시 본 문서의 해당 Step 을 §1 로 내리고, 상세는 `project/DEBUG_PLAN.md` → `claude-history/debug/` 아카이브 경로를 따른다.
