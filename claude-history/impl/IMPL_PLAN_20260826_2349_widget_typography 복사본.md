# IMPL_PLAN 20260826_2349 — Write Mode 위젯 타이포그래피 붕괴 해소

> **수행 주체**: 구현 담당 에이전트 (Gemini Pro)
> **작성 주체**: 분석/계획 담당 (Claude) — 코드 수정 없음, 계측·검증만 수행
> **티켓**: [BUG-20260826-12](../../ticket/debug/20260826_2330_widget_typography_collapse.yml)
> **리뷰**: `code_review.md` §P1-9 · **계획 인덱스**: `project/DEBUG_PLAN.md` §2 B5
> **기준 버전**: v0.8.8 (미커밋 작업본)

이 문서는 **대화 맥락 없이 단독으로 실행 가능**하도록 작성되었다.
아래 수치는 전부 실제 브라우저에서 `getComputedStyle` / `getBoundingClientRect` 로 계측한 값이다.

---

## 1. 한 줄 요약

`BlockEditor` 테마의 `'.cm-line *'` 전역 리셋이 CodeMirror 위젯 내부의 모든 타이포그래피 선언을
명시도로 이겨버려서, 코드펜스 `|title|` 타이틀이 **0×0 으로 렌더**된다.

---

## 2. 문제의 메커니즘 (반드시 이해하고 시작할 것)

### 2.1 명시도 계산

CodeMirror 의 `EditorView.theme()` / `baseTheme()` 는 셀렉터 앞에 테마 클래스를 자동으로 붙인다.

| 출처 | 컴파일된 셀렉터 | 명시도 | 승패 |
|---|---|---|---|
| `EditorView.theme({'.cm-line *': …})` | `.ͼN .cm-line *` | **(0,2,1)** | 이김 |
| `EditorView.baseTheme({'&.cm-editor .cm-inline-code': …})` | `.ͼ1.cm-editor .cm-inline-code` | **(0,3,0)** | **더 이김** |
| `index.css` 의 `.cm-heading-badge` | `.cm-heading-badge` | (0,1,0) | 짐 |
| 위젯 DOM 의 Tailwind `text-[11px]` | `.text-\[11px\]` | (0,1,0) | 짐 |

> **이 표가 이 티켓의 전부다.** `.cm-inline-code` 만 멀쩡한 이유가 곧 해법이다 —
> **위젯 스타일은 `baseTheme` 에 있어야 이긴다.**

### 2.2 왜 "0" 이 되는가

코드블록 헤더가 올라가는 라인은 `orchestrator.ts` 의 baseTheme 에서
`.cm-code-block-widget-line { font-size: 0 !important; line-height: 0 !important }` 를 받는다
(위젯이 라인을 대체한 뒤 남는 빈 라인 박스를 접기 위한 것).

여기에 `.cm-line *` 의 `font-size: inherit` 가 겹치면서 **위젯 서브트리 전체가 0px 를 상속**한다.
헤더 바 자체는 padding 으로 35px 높이를 유지하므로, 사용자에게는 **글자 없는 빈 바**로 보인다.

실제 상속 체인 (계측값):

```
.cm-line.cm-code-block-widget-line   font-size: 0px
  └ div.w-full.box-border.block       font-size: 0px   ← 위젯 루트, 상속
      └ div.cm-code-block-header      font-size: 0px   ← 상속
          └ span.text-[11px]          font-size: 0px   ← 리셋이 Tailwind 를 이김, rect 0×0
```

---

## 3. 계측 결과 (현행 v0.8.8)

앱의 `editorThemeCompartment` 테마를 **포함한** 상태에서 측정.

| 대상 | 설계값 | 실측 | 상태 |
|---|---|---|---|
| 코드블록 헤더 언어 라벨 `text-[11px]` | 11px | **0px (0×0)** | 소실 |
| 코드블록 헤더 타이틀 `text-[12px]` | 12px | **0px (0×0)** | **← 신고된 증상** |
| `Copied!` 피드백 `text-[10px]` | 10px | **0px (0×0)** | 소실 |
| `.cm-heading-badge` | 0.65rem (10.4px) | 14px | 확대 |
| `.cm-image-caption` | 0.85em (11.9px) | 14px | 미적용 |
| `.cm-h1` | 35px | 14px | 미적용 |
| `.cm-inline-code` | 0.88em | 12.32px | ✅ 정상 (baseTheme 정의) |

---

## 4. 후보안 4종 실측 비교 (이미 수행됨 — 재조사 불필요)

각 변형을 **페이지 리로드로 격리**하여 측정했다. 사유는 §7.1 참조.

| | A. 현행 | B. 리셋 제거만 | C. 리셋 제거 + 표적 정규화 | **D. 리셋 유지 + baseTheme 재선언** |
|---|---|---|---|---|
| 헤더 타이틀 | 0px / **0×0** | 12px / **43×0** ⚠ | 12px / 43×18 ✅ | 12px / 43×18 ✅ |
| 헤더 언어 | 0px | 11px ✅ | 11px ✅ | 11px / 14×17 ✅ |
| `.cm-h1` | 14px | 35px ✅ | 35px ✅ | 14px (불변) |
| `.cm-heading-badge` | 14px | 10.4px ✅ | 10.4px ✅ | 14px (불변) |
| `.cm-inline-code` | 12.32px | 12.32px | 12.32px | 12.32px |
| **라인 높이** 평문 / H1 / H2 / 체크박스 | 19.6 / 19.6 / 19.6 / 19.6 | 19.6 / **49** / **24.5** / 19.6 | 19.6 / **49** / **24.5** / 19.6 | 19.6 / 19.6 / 19.6 / 19.6 |
| 0.6.1 캐럿 회귀 위험 | — | **있음** | **있음** | **없음** |

### 결론

- **B 는 함정이다.** `fontSize` 만 보면 12px 로 고쳐진 것처럼 보이지만
  `line-height: 0` 이 여전히 라인에서 상속되어 **높이가 0** 이다. 화면에는 여전히 안 보인다.
  → 하네스는 반드시 `getBoundingClientRect().height > 0` 을 검사해야 한다.
- **D 는 라인 높이가 현행과 완전히 동일**하다. 즉 0.6.1 이 막았던 캐럿 점프를 재발시킬 여지가 구조적으로 없다.
- **C 는 헤딩 라인이 커진다**(19.6 → 49 / 24.5). 이건 Read Mode 와 일치시키는 방향이라 "옳은" 변화지만,
  **0.6.1 이 의도적으로 억제했던 바로 그 동작**이다. 제품 판단이 필요하다.

---

## 5. 실행 계획 — **Stage 1 만 수행한다**

### Stage 1 — 필수 · 무위험 (변형 D)

신고된 버그를 해소한다. 라인 메트릭은 1px 도 바뀌지 않는다.

#### 1-1. 헤더 위젯 자식에 의미 클래스 부여

`project/src/shared/lib/editor/decorators/impl/CodeBlockDecorator.ts`

현재(`:236-246`)는 Tailwind 유틸리티만으로 크기를 지정하고 있어 baseTheme 에서 겨냥할 훅이 없다.
`nth-child` 로 겨냥하는 것은 위젯 구조 변경에 취약하므로 **클래스를 붙인다**.

```ts
// :237  before
langSpan.className = 'text-[11px] font-mono text-slate-400 uppercase tracking-wider';
// after — text-[11px] 는 제거(어차피 리셋에 짐), 크기는 baseTheme 이 담당
langSpan.className = 'cm-cb-lang font-mono text-slate-400 uppercase tracking-wider';

// :244  before
titleSpan.className = 'text-[12px] font-medium text-slate-300 absolute left-1/2 -translate-x-1/2';
// after
titleSpan.className = 'cm-cb-title font-medium text-slate-300 absolute left-1/2 -translate-x-1/2';

// :254  before  (btn.innerHTML 내부)
<span class="text-[10px] copy-feedback hidden">Copied!</span>
// after
<span class="cm-cb-copied copy-feedback hidden">Copied!</span>
```

> 색상/여백 유틸리티는 리셋 대상이 아니므로 **그대로 둔다**. `font-size` 계열만 옮긴다.

#### 1-2. `decorationBaseTheme` 에 타이포그래피 선언 추가

`project/src/shared/lib/editor/decorators/orchestrator.ts` — `decorationBaseTheme` 객체에 추가.
`.cm-code-block-hidden-fence` 블록 근처, `.cm-code-block-widget-line` 정의 **뒤**가 읽기 좋다.

```ts
// 위젯 루트에 명시적 폰트 기준을 세워 라인의 font-size:0 / line-height:0 상속을 끊는다.
// 이 선언이 없으면 자식들이 0 을 물려받아 0×0 으로 렌더된다.
'&.cm-editor .cm-code-block-header': {
  fontSize: '12px',
  lineHeight: '1.5',
},
'&.cm-editor .cm-cb-lang':   { fontSize: '11px' },
'&.cm-editor .cm-cb-title':  { fontSize: '12px' },
'&.cm-editor .cm-cb-copied': { fontSize: '10px' },
```

#### 1-3. 이미지 캡션도 동일 처리

`.cm-image-caption` 은 `index.css:251` 에 있어 리셋에 진다.
`font-size` / `line-height` 선언만 `decorationBaseTheme` 로 옮긴다 (색상·여백은 index.css 에 남겨도 됨).

```ts
'&.cm-editor .cm-image-caption': { fontSize: '0.85em', lineHeight: '1.5' },
```

#### 1-4. 테마 리터럴 중복 제거 (선행 권장)

`project/src/widgets/BlockEditor/ui/BlockEditor.tsx` 의 테마 객체가
**`:105`(reconfigure)와 `:215`(초기 생성)에 완전히 동일한 내용으로 복제**되어 있다.

한쪽만 고치면 *"사용자가 폰트 설정을 바꾸기 전까지는 증상이 남는"* 종류의 버그가 만들어진다.
Stage 1 이 테마를 직접 건드리진 않지만, Stage 2 를 대비해 지금 정리하는 편이 안전하다.

```ts
function createEditorTheme(editor: SettingsEditor) {
  return EditorView.theme({ /* 기존 내용 그대로 */ });
}
```
→ `:105` 는 `editorThemeCompartment.reconfigure(createEditorTheme(settings.editor))`,
   `:215` 는 `editorThemeCompartment.of(createEditorTheme(settings.editor))`.

**동작 변경은 0 이어야 한다.** 순수 추출만 할 것.

---

### Stage 2 — **보류 확정 (이번 작업 범위 아님)**

> **결정 (2026-08-26, 사용자 승인)**: 캐럿 회귀를 되살리지 않는다. **Stage 1 만 수행한다.**

Write Mode 에서 헤딩·배지가 설계 크기를 되찾게 하는 변경(변형 C)은 **하지 않는다.**
`.cm-h1` 35px 과 `.cm-heading-badge` 10.4px 이 Write Mode 에 미적용인 상태는 **의도된 잔존 상태**이며,
이번 티켓의 결함으로 취급하지 않는다.

**보류 사유** — 변형 C 는 헤딩 라인 높이를 19.6 → 49(H1) / 24.5(H2) 로 키운다.
이는 `ce6b96c`(0.6.1)가 *"focus jump on heading creation"* 이라며 억제했던 동작을 되살리는 것이다.
지금 이걸 열면 캐럿 점프를 다시 떠안게 되고, 그 회귀를 막느라 또 다른 억제 코드를 쌓게 된다.

**해소 시점** — 아래 두 조건이 충족된 뒤 근본 해소한다.

1. `project/DEBUG_PLAN.md` 의 전 항목(B1~B5) 해소
2. `architecture_stages.md` 에 따른 스레드/프로세스 분리 — Stage 3(OffscreenCanvas + Worker, Tier 2) 및
   Stage 4(Multi-Window, Tier 3). 편집 입력 경로가 무거운 렌더링과 격리되면
   (`HANDOVER.md` Tier 3: *"메인 창 IME/타이핑과 완전 프로세스 격리"*)
   캐럿 점프의 재현 조건 자체가 크게 줄어 난이도가 떨어진다.

> **구현 담당에게**: 이 단계는 착수하지 말 것. 구체적으로 —
> **`'.cm-line *'` 리셋은 절대 수정·삭제하지 않는다.** 그대로 둔 채 §5 Stage 1 만 수행한다.
> 리셋을 건드리는 순간 라인 메트릭이 바뀌어 이 보류 결정이 무효화된다.

---

## 6. 검증

### 6.1 하네스

`project/src/widgets/BlockEditor/__tests__/widget_typography_harness.ts`

> ⚠ `getComputedStyle` 기반이라 **jsdom 으로는 불가능**하다. 실제 브라우저 컨텍스트가 필요하다.
> 기존 하네스들과 달리 `node --experimental-strip-types` 로 돌릴 수 없으니,
> Vite 로 임시 페이지를 띄워 측정하거나 Playwright 를 쓴다.

**하네스 작성 시 절대 규칙 2가지** — 둘 다 이번 조사에서 실제로 발목을 잡았다:

1. **앱 테마를 반드시 포함**할 것.
   `EditorView` 를 만들 때 `BlockEditor` 의 `editorThemeCompartment` 테마(`.cm-line *` 포함)를
   넣지 않으면 **모든 케이스가 통과한다**. 0.8.8 에서 H1 35px 을 "검증 완료"로 오판한 원인이 정확히 이것이다.
2. **`fontSize` 만 보지 말고 `getBoundingClientRect().height > 0` 을 함께 검사**할 것.
   변형 B 는 fontSize 12px 이지만 높이 0 이라 화면에는 안 보인다.

### 6.2 케이스

| # | 검사 | 기대 |
|---|---|---|
| 1 | 헤더 타이틀 span | `fontSize === '12px'` **그리고** `rect.height > 0` |
| 2 | 헤더 언어 span | `fontSize === '11px'` 그리고 `rect.height > 0` |
| 3 | `Copied!` span | `fontSize === '10px'` |
| 4 | 이미지 캡션 | 0.85em 환산값, `rect.height > 0` |
| 5 | `.cm-inline-code` | `12.32px` (회귀 없음) |
| 6 | **라인 높이 불변** | 평문 / H1 / H2 / 체크박스 라인 높이가 **수정 전과 동일** (Stage 1 기준 전부 19.6) |
| 7 | 0.6.1 가드 | 배지 있는 라인과 없는 라인의 높이 차 ≤ 1px |

### 6.3 수동 확인 (DoD)

- `pnpm tauri dev` → 코드블록이 든 블록을 **클릭해 포커스한 상태**에서 타이틀이 보일 것.
  (포커스하지 않은 상태는 `renderBlockToHtml` 경로라 원래부터 정상이었다 — 반드시 **포커스 상태**로 확인)
- 빈 줄에서 `# ` 타이핑 시 캐럿이 튀지 않을 것.
- 코드블록 안에서 한글을 연속 입력해도 헤더가 사라지지 않을 것.

---

## 7. 함정 모음 (실제로 겪은 것들)

### 7.1 `EditorView.baseTheme` 는 전역이다

`baseTheme` 규칙은 **모든 CodeMirror 인스턴스에 공유되는 기반 클래스**에 붙는다.
한 페이지에 A/B/C 변형 에디터를 나란히 띄우면 **C 의 baseTheme 가 A 에도 적용**되어 계측이 오염된다.
실제로 이 함정 때문에 1차 계측에서 "현행인데 타이틀이 12px 로 멀쩡함" 이라는 잘못된 결과가 나왔다.
→ 변형 비교는 **페이지 리로드로 1개씩** 격리할 것.

### 7.2 커서 위치가 위젯 표시를 좌우한다

`CodeBlockDecorator` 는 **커서가 여는 펜스 줄에 있으면 헤더 위젯을 숨기고 원문을 보여준다**(의도된 동작).
검증 중 타이틀이 안 보인다고 당황하기 전에 커서 위치부터 확인할 것.
마찬가지로 `ImageDecorator` 는 커서가 이미지 범위 안에 있으면 프리뷰를 숨긴다.
→ 하네스에서는 커서를 **코드펜스 바깥 줄**에 두고 측정한다.

### 7.3 Tailwind 유틸리티를 위젯 크기 지정에 쓰지 말 것

이 코드베이스에서 CodeMirror 위젯 내부의 `text-[11px]` 류는 **작동하지 않는다**(리셋에 짐).
새 위젯을 만들 때도 크기는 `decorationBaseTheme` 에 선언할 것. 색상·여백 유틸리티는 무방하다.

---

## 8. 범위 밖 (건드리지 말 것)

- **`BlockEditor.tsx` 의 `'.cm-line *'` 리셋** — 수정·삭제 금지. §5 Stage 2 의 보류 결정에 직결된다.
  이번 수정은 리셋을 **그대로 둔 채** baseTheme 재선언으로 이기는 방식(변형 D)이다.
- **`.cm-h1` / `.cm-heading-badge` 의 Write Mode 미적용** — 알려진 잔존 상태이며 이번 범위 아님.
  "발견했다"며 함께 고치지 말 것.
- `HyperlinkDecorator` 의 `LINK_RE` 중첩 대괄호 미지원 — 별건.
- `HyperlinkDecorator` 에 `!` 접두 가드가 없어 `![alt](src)` 의 링크 부분에도 매칭되는 문제 — 별건.
- `MindView` 의 순정 `Marked` — 커스텀 렌더러 미적용은 의도된 현 상태.
- `code_review.md` 의 다른 P0/P1 항목 — 본 티켓과 의존 없음.

---

## 9. 커밋 규칙

`.agents/AGENTS.md` 규약에 따라 커밋 전 패치 버전업 및
`package.json` / `Cargo.toml` / `tauri.conf.json` / `Cargo.lock` 동시 갱신.
Stage 1 과 Stage 2 는 **반드시 별도 커밋**으로 분리한다.

```
fix(0.8.9): Write Mode 코드블록 헤더 타이포그래피 붕괴 해소 (BUG-20260826-12)
```
