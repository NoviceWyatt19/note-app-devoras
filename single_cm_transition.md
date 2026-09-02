# 단일 CodeMirror 전환 — 안건 문서

> **핵심 아이디어**: 내부적으로는 하나의 문서 = 하나의 CodeMirror,
> 시각적으로만 블록 카드 UI를 데코레이터로 렌더링한다.
>
> **상태**: 정식 안건 (2026-09-02 승격, `GATE-20260902-01`). **채택 확정 아님 — 스파이크 A·B 판정 대기.**
> **원본**: `project/MEMORY_OPTIMIZATION.md`. 승격하며 **표제 근거를 정정**했다 — §0.
> **대조 분석**: [`architecture_direction_review.md`](architecture_direction_review.md) · [`ticket/project/20260902_0400_single_cm_gate_reopen.yml`](ticket/project/20260902_0400_single_cm_gate_reopen.yml)

---

## 0. 승격 시 정정된 것 — 먼저 읽을 것

이 문서의 원본은 **메모리 절감**을 전환 근거로 제시했다. **그 근거는 틀렸다.**

| 원본 주장 | 프로젝트 실측 (`ARCHITECTURE_FINDINGS.md:205`) |
|---|---|
| 인스턴스당 ~600KB · 문서당 ~18MB | **블록당 42~98KB** — 예산(150KB) **이내** |
| "메모리 ~90% 절감이 전환의 이유" | **메모리는 한 번도 실패한 예산이 아니다** |

**실패한 예산은 오직 시간이다** — N=200 에서 마운트 7,024~17,423ms (예산 300ms, 23~58배 초과).

**그럼에도 이 안건이 살아 있는 진짜 이유**는 `DEBUG_STEP_PLAN.md` §3-A-2 가 확정한 원인 축이다:

> 초선형의 원인은 **동시에 살아 있는 `EditorView` 인스턴스 수**다. 데코레이터가 하나도 없는 베어 조건도 **누적** 마운트 시 지수 1.763(N=100, 737ms)이고, **생성 횟수는 같고 누적만 없앤** 조건은 0.938(선형, 92ms) — 8배 차이.

**단일 CM 은 그 수를 N→1 로 구조적으로 고정한다.** 부수 이점이 하나 더 있는데 원본이 강조하지 않았다 — **뷰포트 렌더링의 높이 맵을 CodeMirror 가 소유하므로, E7 가상화가 필수 동반으로 요구하는 높이 캐시를 우리가 구현하지 않아도 된다**(BUG-20260828-01 계열 재생산 위험 회피).

> **이 문서를 "메모리 최적화"로 읽지 말 것.** 판단 축은 **마운트 시간의 초선형**이다. §1 의 메모리 수치는 원본 보존을 위해 남겨두되 **신뢰하지 않는다** — §0 의 실측이 우선한다.

### 0.1 이 안건은 두 번 기각된 적이 있다

| 시점 | 기각 기록 | 근거 | 현재 상태 |
|---|---|---|---|
| 2026-08-27 | `architecture_stages.md:56` — **"Option A(문서 전체 단일 CM)"** | *"H2/H3 를 중첩 라운드 카드로 렌더하는 현재 시각 디자인을 평면 라인 목록으로는 표현할 수 없다"* | **측정된 적 없는 단언.** → **스파이크 A 가 정확히 이것을 잰다** |
| 2026-08-30 | `DEBUG_STEP_PLAN.md` §0.1 — "재개봉되지 않는다" | "순수 CM 은 선형이고 38배 싸다 → 블록당 인스턴스 설계는 무죄" | **무효.** §3-A-2 가 귀속을 뒤집었다 — 그 관측은 **동시 생존 수를 늘리지 않은 조건**에서 나왔다 |

**§0.1 은 근거가 소멸했고, Option A 는 근거가 검증된 적이 없다.** 그래서 **스파이크 A 가 이 안건의 생사를 가른다** — 2026-08-27 의 단언이 맞으면 안건은 그때 판단이 옳았던 것으로 종결된다.

> 한편 §0.1 이 기각한 "Notion 형태"는 **이 안건이 아니다.** 그것은 블록 트리를 진실로 삼는 구조였고, 이 안건은 정반대로 `rawContent` 를 유일 진실로 삼는다 — §0.1 이 지키려던 "마크다운이 디스크의 진실"이라는 전제를 **더 충실히** 만족한다. **§0.1 을 근거로 이 안건을 다시 닫지 말 것.**

---

## 1. 현재 구조 vs 제안 구조

> ⚠️ 아래 메모리 수치는 **원본 그대로이며 실측과 어긋난다.** §0 을 우선한다. DOM 노드 수 주장은 방향이 맞다.

### 현재: N개 CodeMirror 인스턴스

```
문서 "example.md" (30 블록)
  ├─ CodeMirrorBlock #1  ← EditorView + EditorState + history + 12 decorators
  ├─ CodeMirrorBlock #2  ← EditorView + EditorState + history + 12 decorators
  ├─ CodeMirrorBlock #3  ← EditorView + EditorState + history + 12 decorators
  │  ...
  └─ CodeMirrorBlock #30 ← EditorView + EditorState + history + 12 decorators

  메모리: 30 × ~600KB = ~18MB (이 문서 하나에)
  DOM 노드: 30 × ~200개 = ~6000개
```

### 제안: 1개 CodeMirror 인스턴스

```
문서 "example.md" (동일 내용)
  └─ EditorView (단 1개)
       ├─ EditorState (문서 전체)
       ├─ history (통합 undo/redo)
       ├─ 12 decorators (기존 것 재사용)
       └─ BlockVisualDecorator (NEW: 카드 UI 데코레이션)

  메모리: 1 × ~1.5MB = ~1.5MB
  DOM 노드: CodeMirror가 뷰포트 내 라인만 렌더 (~200개)
```

> **메모리 절감: 문서 하나당 ~90% 감소**

---

## 2. 왜 가능한가 — 이미 갖추어진 기반

현재 코드베이스에 이 전환을 가능하게 하는 기반이 **이미 존재**합니다:

### 2.1 CodeMirror 6의 내장 가상화

CodeMirror 6는 **자체적으로 뷰포트 기반 렌더링**을 합니다:
- 화면에 보이는 라인만 DOM에 렌더링
- 스크롤 시 필요한 라인만 추가/제거
- 10만 줄 문서도 문제없이 처리

현재 구조에서는 이 장점을 **전혀 활용하지 못하고 있습니다** — 블록마다 작은 CM을 만들어 React가 전부 마운트하니까요.

### 2.2 데코레이터 시스템이 블록 시각화를 할 수 있음

`CodeBlockDecorator`가 이미 하고 있는 것:
- 여러 라인에 걸쳐 배경색 적용 (`cm-code-block-line`)
- 첫/끝 라인에 둥근 모서리 (`cm-code-block-top`, `cm-code-block-bottom`)
- 위젯으로 헤더 바 삽입 (`CodeBlockHeaderWidget`)

**정확히 같은 패턴**으로 "블록 카드"를 구현할 수 있습니다.

### 2.3 `HeadingDecorator`가 이미 구조를 인식

`HeadingDecorator.ts`는 이미 `H1~H6` 라인을 감지하여 스타일을 입히고 있습니다. 이것을 확장하여 "이 헤딩부터 다음 헤딩까지가 하나의 블록"이라는 범위 데코레이션을 추가하면 됩니다.

---

## 3. 무엇이 단순해지는가 (제거 가능한 복잡성)

> ⚠️ **주의 (2026-09-02 검증) — 아래 표는 ReadView 를 계산에 넣지 않았다.**
>
> `ReadView.tsx` 는 블록 단위 **드래그 재정렬**을 제공하고, 재정렬은 `join → 재파싱 → 2-패스 재매칭`을 탄다. 따라서 **`resolveBlocksFromContent` · `buildTreeFromChunks` · `flattenTree` · `deriveBlockKey` / 2-패스 매칭은 전부 잔존한다**(`ReadView.tsx:302,345,352,358` 확인). Step 4(A7)의 성과물은 살아남는다.
>
> 정확한 표현은 **"제거"가 아니라 "쓰기 경로에서 소비자 소멸, ReadView 전용으로 축소"** 다.
>
> **진짜로 소멸하는 것**(확인함): `CodeMirrorBlock` · 블록 간 포커스 이동 · 블록 병합 · `focusToken`/A1-A2 조정자 · `updateBlockContent`(→ **R-2 가 통째로 소멸**) · `editorViewRegistry` 의 blockId 축 · `handleBlockUpdate` 헤딩 수 비교.

### 제거할 수 있는 것들 *(원본 표 — 위 주의와 함께 읽을 것)*

| 현재 존재하는 것 | 역할 | 단일 CM에서 |
|-----------------|------|------------|
| `resolveBlocksFromContent()` | 텍스트 → 블록 트리 변환 + 2-패스 ID 매칭 | **제거** — 블록 분할 자체가 불필요 |
| `buildTreeFromChunks()` | 평탄 블록 → 트리 조립 | **제거** |
| `flattenTree()` | 트리 → 평탄 배열 (수시 호출) | **제거** — 트리 구조 자체가 불필요 |
| `deriveBlockKey()` / 2-패스 매칭 | 블록 ID 안정성 (A7) | **제거** — ID 개념 자체가 불필요 |
| `CodeMirrorBlock` 컴포넌트 | 블록별 CM 인스턴스 관리 | **제거** — CM이 1개 |
| `BlockNode` 컴포넌트 | 트리 구조 재귀 렌더링 | **제거** |
| 블록 간 포커스 이동 (ArrowUp/Down) | 블록 경계에서 이전/다음 블록으로 | **제거** — 자연스러운 커서 이동 |
| 블록 병합 (Backspace at start) | 앞 블록과 합치기 | **제거** — 그냥 일반 Backspace |
| `editorViewRegistry` | paneId+blockId → EditorView 조회 | **단순화** — paneId → EditorView |
| `consumedFocusTokenRef` / A1-A2 조정자 | CM↔Store 캐럿 동기화 | **대폭 단순화** |
| `handleBlockUpdate` (헤딩 수 비교) | 헤딩이 바뀌면 트리 재분할 | **제거** — 데코레이터가 자동 반영 |

### 단순해지는 데이터 흐름

**현재** (복잡):
```
키 입력 → CodeMirrorBlock.onUpdate
  → updateBlockContent(id, text)     // 트리에서 노드 찾아 교체
  → 헤딩 수 비교
    → [변경됨] flattenTree → getMergedContent → setContent → resolveBlocksFromContent
      → 2-패스 ID 매칭 → buildTreeFromChunks → 전체 리렌더
    → [변경없음] syncContent (디바운스)
      → flattenTree → map → join → rawContent 갱신
```

**제안** (단순):
```
키 입력 → CodeMirror 자체 처리 (끝)
  → updateListener (디바운스)
    → rawContent = doc.toString()
    → updateContentForTab(tabId, rawContent)
```

---

## 4. "블록 카드" 시각화 — 새 데코레이터로 구현

### 4.1 `BlockCardDecorator` 설계

`CodeBlockDecorator`의 패턴을 그대로 차용합니다:

```typescript
class BlockCardDecorator implements SyntaxDecorator {
  readonly name = 'block-card';

  createDecorations(state: EditorState): DecorationSet {
    const doc = state.doc;
    const decs: Range<Decoration>[] = [];

    // H1/H2/H3 위치를 스캔하여 "블록 범위"를 결정
    const blocks = scanBlockRanges(doc);

    for (const block of blocks) {
      // 블록 레벨에 따른 카드 스타일
      const cardClass = `cm-block-card cm-block-level-${block.level}`;

      // 블록의 각 라인에 배경/보더 스타일 적용
      for (let ln = block.startLine; ln <= block.endLine; ln++) {
        const line = doc.line(ln);
        let cls = cardClass;
        if (ln === block.startLine) cls += ' cm-block-card-top';
        if (ln === block.endLine) cls += ' cm-block-card-bottom';
        decs.push(Decoration.line({ class: cls }).range(line.from));
      }
    }

    return Decoration.set(decs, true);
  }
}
```

### 4.2 CSS로 카드 UI 재현

```css
/* H2 블록 카드 — 현재 BlockNode의 level 2 스타일과 동일 */
.cm-block-level-2 {
  background: #141520;
  margin-left: 1.25rem;
  margin-right: 1.25rem;
  border-left: 1px solid rgba(255,255,255,0.08);
  border-right: 1px solid rgba(255,255,255,0.08);
}
.cm-block-level-2.cm-block-card-top {
  border-top: 1px solid rgba(255,255,255,0.08);
  border-radius: 1rem 1rem 0 0;
  padding-top: 1.25rem;
  margin-top: 1.5rem;
}
.cm-block-level-2.cm-block-card-bottom {
  border-bottom: 1px solid rgba(255,255,255,0.08);
  border-radius: 0 0 1rem 1rem;
  padding-bottom: 1.25rem;
}

/* H3 블록 카드 — 중첩 카드 */
.cm-block-level-3 {
  background: #1d1f30;
  margin-left: 2rem;
  margin-right: 2rem;
  /* ... */
}
```

> **핵심**: CodeMirror의 `Decoration.line()`은 `.cm-line`에 클래스를 추가하는 것이라, 현재 코드펜스 블록과 **정확히 같은 방식**으로 카드 UI를 만들 수 있습니다.

---

## 5. 남는 과제와 해결 방안

### 5.1 MindView / MindNode 연동

MindView는 문서의 헤딩 구조를 `MindNode[]`로 필요로 합니다.

**해결**: `parseMarkdown(rawContent)`는 이미 **rawContent에서 직접** 노드를 파싱합니다. 블록 트리에 의존하지 않으므로 그대로 사용 가능합니다.

### 5.2 ReadView (읽기 모드)

ReadView는 현재 `blocks`를 순회하며 `renderBlockToHtml`을 호출합니다.

**해결**: ReadView 진입 시 `rawContent`를 단순히 블록 단위로 잘라서 렌더링하면 됩니다. 이것은 **표시 전용 파싱**이므로 비용이 낮고, 현재의 `resolveBlocksFromContent`보다 훨씬 단순한 함수로 대체 가능합니다. 혹은 ReadView도 단일 HTML 렌더링으로 단순화할 수 있습니다.

### 5.3 블록 단위 드래그 앤 드롭 (ReadView)

ReadView의 블록 재정렬 기능은 읽기 모드 전용입니다.

**해결**: ReadView 진입 시 표시용 블록을 파싱하여 드래그 앤 드롭을 처리하고, 결과를 rawContent로 다시 조합하면 됩니다. 현재와 로직이 거의 동일합니다.

### 5.4 Undo/Redo 범위

**현재**: 블록별 독립 undo (H2를 편집하다 undo하면 그 블록만 되돌림)
**전환 후**: 문서 전체 undo (일반적인 텍스트 에디터 동작)

**판단**: 대부분의 마크다운 에디터(Notion, Obsidian, Typora)는 **문서 단위 undo**입니다. 블록별 undo가 사용자에게 더 자연스러운 경우는 매우 드뭅니다. 오히려 "블록 A를 편집하다 블록 B를 수정하고 undo하면 B만 되돌아가는" 현재 동작이 혼란스러울 수 있습니다.

### 5.5 tabStore 단순화

`tabStore.ts`의 대부분의 메서드가 **불필요해지거나 대폭 단순화**됩니다:

| 메서드 | 변경 |
|--------|------|
| `setContent` | rawContent 세팅 + nodes 파싱만 (blocks 제거) |
| `syncRawContentFromBlocks` | **제거** |
| `getMergedContent` | `() => get().rawContent` (trivial) |
| `updateBlockContent` | **제거** |
| `mergeBlockWithPrevious` | **제거** |
| `focusBlock` | CM의 특정 offset으로 커서 이동 |
| `reorderBlocks` | ReadView 전용으로 이동 |

---

## 6. 전환 전략 — **스파이크 게이트 선행** (2026-09-02 개정)

> **원본의 "Step 1: 프로토타입 3~5일" 순서는 폐기했다.** 그대로 가면 §7.1 의 두 블로커에서 막힌다.
> 개정 근거: [`architecture_direction_review.md`](architecture_direction_review.md) §2.4·§2.5·§7.3

```
게이트 0  R-1 (@testing-library/react + jsdom)      ← 착수됨 (사용자 결정 2026-09-02)
   │       회귀망이 가장 약한 시점에 최대 구조 변경을 하지 않는다. 단일 CM 과 독립이다
   ↓
게이트 A  스파이크 A — 중첩 카드 시각 재현            ← 이 안건의 생사를 가른다
   │       실패 → 안건 종결, E7 로 복귀 (스파이크 B 도 불필요)
   ↓
게이트 B  스파이크 B — 오케스트레이터 증분화 설계
   │       실패 → 안건 종결, E7 로 복귀
   ↓
Step 1~3  아래 전환 단계 (A·B 통과 후에만)
```

**A → B 순서인 이유**: A 가 실패하면 B 를 잰 비용이 통째로 버려진다. A 는 CSS·데코레이션 실험이라 B(오케스트레이터 재설계)보다 싸고, 판정이 육안으로 즉시 난다. **비싼 쪽을 뒤에 둔다.**

### 게이트 A — 중첩 카드 시각 재현 (`SPIKE-20260902-A`)

`Decoration.line()` 만으로 L2 카드 안에 L3 카드가 들어앉고 **L2 의 좌/우 테두리가 L3 구간을 관통해 연속**되는 그림이 나오는가. 2026-08-27 `architecture_stages.md:56` 이 "표현할 수 없다"고 단언한 바로 그 지점이며, **그 단언은 측정된 적이 없다.**

**판정 기준**: 현행 `BlockNode` 렌더 결과와 육안 동등. 미달이면 안건 종결.

### 게이트 B — 오케스트레이터 증분화 설계 (`SPIKE-20260902-B`)

§7.1 의 블로커 ②. **판정 기준**: N=200 문서에서 키 입력 1회·화살표 1회의 데코레이션 재빌드 비용이 N 에 비례하지 않을 것.

---

### Step 1: 단일 CM 에디터 프로토타입 (게이트 A·B 통과 후)

1. `SingleDocEditor` 컴포넌트 신규 작성
   - 문서 전체를 하나의 `EditorView`로
   - **게이트 B 가 확정한 증분 오케스트레이터**를 사용한다 — 원본이 적은 "12개 데코레이터 전부 재사용(그대로 동작)"은 **거짓이다**(§7.1 ②)
   - `BlockCardDecorator` 추가 (게이트 A 가 확정한 방식)
2. `BlockEditor`에서 `viewMode === 'write'` 분기를 `SingleDocEditor`로 교체
3. 기존 블록 로직은 건드리지 않음 (ReadView가 아직 사용)

> **이 단계를 되돌릴 수 있게 유지한다.** 7-C 를 C-1~C-5 로 쪼개 싱글턴 제거를 C-4 에 둔 패턴을 재사용한다 — 분기 교체로 시작하므로 기존 쓰기 경로를 남긴 채 병행 가능하다.

### Step 2: 데이터 흐름 단순화

1. `tabStore`에서 쓰기 경로의 `blocks` 의존 제거
2. `rawContent`가 유일한 진실의 원천
3. `flattenTree`, `resolveBlocksFromContent` 등 블록 관련 순수 함수를 **ReadView 전용으로 축소** — **제거가 아니다**(§3 주의)
4. MindView 연동은 `parseMarkdown(rawContent)`로 유지 (이미 그렇다 — 변경 없음)

### Step 3: 정리

1. `entities/block/model/store.ts` → ReadView 전용 유틸로 축소
2. `CodeMirrorBlock`, 쓰기 경로 `BlockNode` 제거
3. **T1 하네스 재작성** — 13종 중 최소 5종(`blockkey`·`caretstability`·`tabstore`·`diff`·`vertical_motion`)이 현행 아키텍처 불변식을 인코딩한다
4. A1/A2 조정자·`focusToken`·`editorViewRegistry` 의 blockId 축 제거

---

## 7. 위험 요소와 완화 방안

### 7.1 착수 전 반드시 해소해야 할 블로커 2건 (원본에 없던 것)

| # | 블로커 | 근거 | 게이트 |
|---|---|---|---|
| ① | **중첩 카드가 실제 중첩 DOM 이다** — `BlockNode`(`BlockEditor.tsx:398-459`)는 재귀이고 L2(`p-5 rounded-2xl`) 안에 L3(`p-4 rounded-xl`)가 들어앉는다. `Decoration.line()` 이 만드는 것은 **평면 형제 `.cm-line`** 이다. 원본이 선례로 든 `CodeBlockDecorator` 는 **중첩 없는 단일 레벨**이라 이 패턴을 증명하지 않는다 | 코드 확인 | **스파이크 A** |
| ② | **오케스트레이터가 문서 전체를 훑는다** — `orchestrator.ts:27-46` 의 `buildAll` 은 `0 ~ doc.length` 를 12개 데코레이터로 스캔하고 `:331` 에서 **`docChanged` 뿐 아니라 `tr.selection` 에서도** 전량 재실행된다. 소스 주석이 스스로 *"Devoras splits blocks into separate CodeMirror instances, doc.length is small enough"* 라고 전제를 밝혀 뒀다 — **단일 CM 이 그 전제를 직접 파괴한다** | 코드 확인 | **스파이크 B** |

**②의 구조적 어려움** — 뷰포트 한정 빌드는 `ViewPlugin`(`view.visibleRanges`)을 요구하는데 **다중 라인 `Decoration.replace` 는 `StateField` 를 요구한다.** 현행이 `StateField` 인 이유가 정확히 그것이고(`orchestrator.ts:317` 주석), 그 다중 라인 replace 는 실재한다(`LatexDecorator.ts:161-172`, KaTeX 블록 펜스). 게다가 데코레이터들이 **커서 위치를 읽으므로**(`LatexDecorator.ts:164` `cursorInside` — 마크업 노출/은닉 UX 의 본질) 셀렉션 재빌드를 그냥 끌 수도 없다.

> **방치하면 마운트의 O(N^1.76) 을 입력당 O(N)×12 로 바꾸는 거래가 된다.** 원본 §4.1 의 예제 코드가 정확히 이 함정에 빠져 있다(`scanBlockRanges(doc)` 로 문서 전체 스캔). R-2 를 없애면서 같은 형태를 데코레이터 계층에 새로 만드는 셈이다.
>
> 이것은 `Open Q #5`(`protectedRegions` N² 부채)와 **같은 지점**이다 — 단일 CM 은 그 부채를 문서 전체 규모로 확대한다. 스파이크 B 는 두 문제를 함께 푸는 기회이기도 하다.

### 7.2 그 밖의 위험 (원본 표 + 재평가)

| 위험 | 원본 평가 | **재평가** |
|------|---|---|
| 카드 시각화 품질 | 중간 — "CodeBlockDecorator 가 이미 증명" | **높음 — 근거 기각.** §7.1 ① · 2026-08-27 에 이미 이 이유로 기각된 전력이 있다 |
| 긴 문서(1만줄+)에서 CM6 성능 | 낮음 | **낮음 (유지)** — CM6 자체는 문제없다. 다만 §7.1 ② 가 해소되어야 성립한다 |
| 블록별 undo 동작 변경 | 낮음 | **낮음 (유지)** — 문서 단위 undo 가 업계 표준. 단 **사용자에게 보이는 동작 변경**이므로 릴리스 노트 대상 |
| ReadView의 블록 파싱 비용 | 낮음 | **낮음 (유지)** |
| IME(한글) 호환성 | 중간 — "그대로 사용" | **중간 (유지, 근거는 약함)** — 3중 래치는 **블록당 뷰 전제로 조립**됐고 "그대로 동작"은 검증된 바 없다. BUG-20260828-05 가 열려 있다. **이 프로젝트에서 IME 회귀는 가장 비싼 결함군이다** |
| **T1 회귀망 재작성** | *(원본에 없음)* | **중간 — 신규.** 13종 중 최소 5종이 대상. R-1 을 먼저 세우는 이유 |
| **되돌리기 난이도** | *(원본에 없음)* | **중간 — 신규.** E7 은 플래그로 끌 수 있는 형태가 가능하나 이 전환은 아니다. Step 1 을 분기 교체로 유지해 완화한다 |

---

## 8. 결론 (2026-09-02 개정)

> **"하나의 문서 = 하나의 CodeMirror, 보여줄 때만 블록"은 A6 의 정답 후보다** — 메모리 최적화가 아니라.

**맞는 것**: 겨눈 축이 정확하다. §3-A-2 가 확정한 원인은 동시 생존 `EditorView` 수이고, 단일 CM 은 그것을 N→1 로 고정한다. E7 가상화가 "창 크기로 상한"하는 것을 이쪽은 "1 로 고정"한다 — **같은 축을 더 강하게 공격하면서, 높이 캐시 구현 부담까지 라이브러리로 넘긴다.**

**틀린 것**: 메모리 근거(§0). 그리고 "복잡성의 구조적 제거"는 **절반만 참**이다 — ReadView 재정렬이 `flattenTree`·`resolveBlocksFromContent`·2-패스 매칭을 계속 쓰므로 Step 4(A7)의 성과물은 전부 살아남는다(§3 주의).

**미확정**: §7.1 의 두 블로커. **둘 다 원본에 없었고, 둘 다 이 제안의 진짜 가격표다.**

> **판단**: 스파이크 A·B 를 먼저 재고 나서 E7 과 비교한다. 이것이 이 프로젝트가 Step 6 에서 비싸게 배운 순서다 — **처방을 측정보다 먼저 쓰지 않는다.** 그리고 2026-08-27 의 Option A 기각은 정확히 그 규칙을 어긴 사례였다("표현할 수 없다"를 재지 않고 단언했다). 스파이크 A 는 그 부채를 갚는 일이기도 하다.
