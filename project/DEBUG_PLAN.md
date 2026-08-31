# DEBUG_PLAN.md — 블록 내 타이핑 시 캐럿 이탈 (BUG-20260831-01)

> **대상**: `project/` (Devoras `v0.8.48`)
> **직전 배치**: Step 4~7 구조 개편 — [`DEBUG_PLAN_20260831_191946.md`](../claude-history/debug/DEBUG_PLAN_20260831_191946.md) (7-C C-5 진행 중이었음)
> **입력**: 사용자 실기 보고 (2026-08-31)
> **성격**: **원인이 코드 대조로 특정된 단일 결함.** 조사가 아니라 수정과 회귀 고정이 과제다.
> **상태**: Todo — 실행은 `project-b8` (7-C 종료 후 착수)

---

## 0. 증상 (사용자 보고)

| # | 조건 | 증상 |
|---|---|---|
| S1 | **H1 블록**에서 텍스트 입력 | 캐럿이 `# Note` 의 **`#` 앞으로 튄다** |
| S2 | **H2~H3 블록**에서 텍스트 입력 | 입력한 글자가 **캐럿 오른쪽에 쌓이며 기존 텍스트를 밀어낸다** — 입력 순서가 뒤집힌 것처럼 보인다(FILO) |

---

## 1. 근본 원인 — `focusOffset` 을 상태로 읽지만 명령으로만 쓴다

**한 줄**: 스토어의 `focusOffset` 은 **블록 전환 시점에만** 기록되는데, Step 5 조정자는 그것을 **매 렌더의 캐럿 정답**으로 취급한다. 일반 타이핑 중에는 아무도 갱신하지 않으므로 낡은 값이 남고, 조정자가 **키 입력마다 캐럿을 그 낡은 위치로 되돌린다.**

### 1.1 증거 — `focusOffset` 을 쓰는 곳이 5곳뿐이고, 그중 타이핑 경로가 없다

`focusBlock(id, offset)` 이 `focusOffset` 을 기록하는 유일한 경로다. 호출부 전수:

| 위치 | 시점 |
|---|---|
| `BlockEditor.tsx:471` · `:473` | 방향키로 **이전/다음 블록 이동** |
| `BlockEditor.tsx:504` | 초기 진입(첫 블록) |
| `BlockEditor.tsx:609` | **헤딩 개수 변화**로 트리 재분할이 일어난 경우 |
| `ReadView.tsx:335` | Read 모드에서 블록 클릭 |

**타이핑에도, Write 모드에서 블록 안을 클릭할 때도 `focusOffset` 은 갱신되지 않는다.**

### 1.2 증거 — `handleBlockUpdate` 가 오프셋을 받고도 버린다

`BlockEditor.tsx:540` 은 `cursorOffset` 을 인자로 받는다(`updateListener` 가 `:217` 에서 실제 캐럿을 넘겨준다). 그런데 —

```
updateBlockContent(id, text);              // 내용만 갱신
if (oldHeadingCount !== newHeadingCount) {
  …
  focusBlock(targetId, targetOffset);      // ← 헤딩 개수가 바뀔 때만 기록
} else {
  syncContent();                           // ← 일반 타이핑. cursorOffset 이 버려진다
}
```

**일반 타이핑 경로(`else`)에서 `cursorOffset` 은 사용되지 않는다.**

### 1.3 증거 — 조정자가 낡은 값으로 캐럿을 되돌린다

`BlockEditor.tsx:271-296`(A1/A2 조정자, deps `[block.content, isFocused, focusOffset]`):

```
const contentChanged = currentDoc !== block.content;
if (!contentChanged) {
  if (!isFocused) return;
  const targetOffset = Math.min(focusOffset, length);       // ← 낡은 값
  if (currentAnchor !== targetOffset) {
    view.dispatch({ selection: { anchor: targetOffset, … } });  // ← 캐럿을 되돌린다
  }
  …
}
```

### 1.4 한 글자 입력의 실제 흐름

```
1. 'a' 입력 → 뷰: doc="## Notea", caret=8
2. updateListener → onUpdate("## Notea", 8) → handleBlockUpdate(id, "## Notea", 8)
3. updateBlockContent 로 내용만 갱신. focusOffset 은 그대로(예: 7 또는 0)
4. 헤딩 개수 불변 → syncContent() — 오프셋 버려짐
5. block.content 변경 → 조정자 재실행
6. currentDoc === block.content → !contentChanged 분기
7. targetOffset = 낡은 focusOffset,  currentAnchor(8) ≠ targetOffset
8. dispatch → 캐럿이 낡은 위치로 되돌아감
9. 다음 글자가 그 자리에 삽입 → 순서가 뒤집힌다
```

**S2(FILO) 가 정확히 이것이다.** 낡은 값이 `7` 이면 `## Note` + `a` → 캐럿 7 → `b` 삽입 → `## Noteba` → `## Notecba`.

### 1.5 S1 과 S2 의 차이는 구조가 아니라 **낡은 값이 무엇인가** 다

`countHeadings` 는 `/^#{1,3} /` 로 H1·H2·H3 를 **동일하게** 센다(`:564`). 즉 H1 만 다른 코드 경로를 타지 않는다.

차이는 **그 시점 `focusOffset` 에 남아 있던 값**이다:

- `focusOffset` 이 **0** 이면 → 캐럿이 offset 0, 즉 `#` **앞**으로 간다 = **S1**
- **0 이 아닌 값**이면 → 그 지점을 축으로 글자가 쌓인다 = **S2**

문서 최초 로드 후 첫 블록(대개 H1)에 바로 타이핑하면 `focusOffset` 이 초기값 0 이라 S1 이 되고, 방향키·병합 등을 거쳐 H2/H3 에 도달하면 `focusBlock` 이 남긴 0 이 아닌 값이 있어 S2 가 된다.

> **따라서 "H1 버그"와 "H2~H3 버그"는 별개가 아니라 같은 결함의 두 발현이다.** 하나만 고치는 수정은 오답이다.

### 1.6 왜 테스트가 못 잡았나 — R3 불변식이 이 경로를 비껴간다

Step 3 이 심은 R3 불변식(`store.focusOffset === view.selection.main.head`)은 **`contentChanged` 분기 안에만** 있다(`:317-328`). 타이핑은 `!contentChanged` 분기에서 `return` 하므로 **단언에 도달하지 않는다.** 정확히 이 결함을 잡도록 설계된 불변식이 배치 위치 때문에 무력화됐다.

또한 T1 하네스는 스토어 로직만 검사한다. **"한 글자 입력 후 캐럿 위치"를 보는 게이트가 존재하지 않는다** — `FormatToolbar` 누락(REF-20260831-01 D-4)과 **같은 공백**이다.

---

## 2. 조치 방안

> **개념적 진단**: `focusOffset` 은 **상태**(캐럿이 지금 여기 있다)가 아니라 **명령**(캐럿을 여기로 옮겨라)이다. 조정자가 명령을 상태로 읽어 계속 재발화시키고 있다. 두 안 모두 이 불일치를 없애는 방향이다.

### 안 A — `focusOffset` 을 진짜 상태로 만든다 (작은 수정)

타이핑 경로에서도 오프셋을 기록해 스토어가 항상 실제 캐럿을 담게 한다.

- `handleBlockUpdate` 의 `else` 분기에서 오프셋을 기록한다. `focusBlock` 은 `activeBlockId` 까지 건드리므로 **오프셋만 쓰는 `setFocusOffset(offset)` 을 신설**해 쓴다.
- **장점**: 변경 범위가 좁고 조정자 로직을 건드리지 않는다.
- **단점**: 키 입력마다 스토어 쓰기가 생긴다(내용 갱신은 이미 디바운스되는데 이건 아니다). 이중 권위(A1) 구조는 그대로 남는다.

### 안 B — 캐럿 명령을 명시화한다 (권장)

`focusBlock` 이 **의도 토큰**(단조 증가 카운터)을 함께 올리고, 조정자는 **토큰이 바뀐 경우에만** 캐럿을 옮긴다.

- `!contentChanged` 분기에서 토큰이 그대로면 **아무것도 하지 않는다** — 뷰의 캐럿이 진실이다.
- **장점**: 키 입력당 스토어 쓰기가 없다. A1(이중 권위)을 이 축에서 실제로 해소한다 — 스토어는 "이동 요청"만 말하고 평상시 캐럿은 뷰가 소유한다.
- **단점**: 토큰 개념이 하나 늘고, 조정자를 수정해야 한다(Step 5 가 막 착지한 코드).

**권장은 B다.** A 는 증상을 없애지만 "스토어가 매 렌더 캐럿을 주장한다"는 구조를 남기므로 같은 계열이 재발할 여지가 있다. 다만 **A 를 먼저 넣어 사용자 차단을 푸는 것은 정당하다** — 그 경우 B 를 후속 티켓으로 반드시 남길 것.

### 공통 필수 — 불변식 위치 교정

R3 불변식을 **`!contentChanged` 분기에도** 넣는다. 지금 위치로는 이 결함을 영원히 못 잡는다. 안 B 를 택하면 "토큰이 그대로인데 캐럿을 옮기려 했다" 를 단언 대상으로 삼는다.

---

## 3. Edge Cases & Guards

1. **IME 조합 중에는 어떤 캐럿 조작도 하지 않는다.** 조정자 진입부의 `isImeComposingRef.current || view.composing` 이중 가드를 그대로 유지할 것. 이 수정은 한글 입력 경로를 직접 건드린다 — `dd52e32`·`13a7f7e` 가 막 닫은 붕괴를 되살리기 쉬운 지점이다.
2. **`external` 트랜잭션 배제 규칙을 잃지 말 것.** 조정자의 diff dispatch 는 `Transaction.userEvent.of('external')` 로 태깅되고 `updateListener` 가 이를 걸러 루프를 막는다.
3. **블록 전환(방향키·병합·분할)은 여전히 캐럿을 옮겨야 한다.** 안 B 의 토큰이 이 경로에서 반드시 올라가는지 확인할 것 — 안 올라가면 병합 후 캐럿 유실(BUG-20260828-02)이 재발한다.
4. **`focusOffset` 은 블록별이 아니라 활성 블록 하나에 대한 값이다.** 모든 `CodeMirrorBlock` 이 같은 값을 prop 으로 받으므로(`:380`·`:395`·`:676`), `isFocused` 가드가 빠지면 비활성 블록까지 캐럿을 움직인다.
5. **7-C 이후 좌표가 바뀌었다.** 전역 싱글턴이 제거됐고(`ac2354c`) 상태가 탭 스코프로 갔다. 위 행 번호는 7-C 직전 기준이며, 수정은 **탭 스토어 형태**에 적용해야 한다.

---

## 4. 검증

### 4.1 신규 하네스 — 이 결함의 재발 방지

**`caret_stability_harness.ts` (T1)** — 조정자의 캐럿 판정 로직을 뷰 없이 검사한다.

| # | 케이스 | 기대 |
|---|---|---|
| C1 | 내용 동일 + 포커스 유지 + 캐럿 명령 없음 | **캐럿을 옮기지 않는다** (핵심 회귀 가드) |
| C2 | `focusBlock` 직후 | 지정한 오프셋으로 옮긴다 |
| C3 | 낡은 `focusOffset` 이 남아 있고 새 명령이 없음 | 무시한다 |
| C4 | 병합으로 내용이 바뀜 + 포커스 대상 | 스토어 오프셋을 따른다 |
| C5 | 비활성 블록 | 어떤 경우에도 캐럿을 옮기지 않는다 |

### 4.2 사람 손 (`VERIFY_BY_HUMAN.md` 로 이관)

T1 로는 실제 키 입력·캐럿 렌더를 재현할 수 없다. 아래는 실기 확인이다.

- **V1** H1 블록에 연속 5글자 입력 → 입력 순서대로 나타나고 캐럿이 `#` 앞으로 가지 않는다
- **V2** H2·H3 각각에서 연속 5글자 입력 → 순서 뒤집힘 0건
- **V3** 일반 문단에서 연속 입력 → 회귀 0건
- **V4** **한글 연속 입력**(R3) → 조합 끊김·텍스트 증식 0건 ← **이번 수정의 최대 위험**
- **V5** 방향키로 블록 이동 → 캐럿이 의도한 위치에 놓인다
- **V6** Backspace 병합 → 병합 지점에 캐럿이 존재한다(BUG-20260828-02 회귀 확인)

### 4.3 기존 게이트 유지

`pnpm test:t1` 전량 · `pnpm test:ime` · `pnpm test:paneownership` · `pnpm test:tabstore` · `tsc --noEmit` · `pnpm build`

---

## 5. DoD

- [ ] S1 재현 불가 — H1 입력 시 캐럿이 `#` 앞으로 이동하지 않음
- [ ] S2 재현 불가 — H2·H3 입력 시 순서 뒤집힘 0건
- [ ] R3 불변식이 `!contentChanged` 분기에서도 동작
- [ ] `caret_stability_harness.ts` C1~C5 통과
- [ ] `pnpm test:ime` 회귀 0건 (V4 수동 확인 포함)
- [ ] V1~V6 실기 확인 (또는 `VERIFY_BY_HUMAN.md` 이관)
- [ ] 안 A 로 착지한 경우 안 B 후속 티켓 등록

---

## 6. 이 결함이 남긴 일반 교훈 (기록용)

1. **명령을 상태로 저장하면 반복 발화한다.** `focusOffset` 은 이름부터 상태처럼 보이지만 쓰이는 방식은 이벤트였다. 같은 형태가 `activeBlockId` 에도 있는지 점검할 가치가 있다.
2. **불변식은 위치가 곧 사정거리다.** R3 는 정확히 이 버그를 잡으라고 만들어졌는데 분기 하나 안쪽에 있어서 놓쳤다. 불변식을 심을 때 **어느 경로가 그것을 통과하는가**를 함께 적을 것.
3. **계획서에서 빠지는 것과 테스트가 없는 것은 같은 집합이다.** REF-20260831-01 D-4 에서 이미 확인된 패턴이 반복됐다.
