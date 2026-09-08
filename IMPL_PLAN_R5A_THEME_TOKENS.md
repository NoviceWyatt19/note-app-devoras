# IMPL_PLAN 20260905_2314 — R5-a 디자인 토큰 이관 + 다크/라이트 모드

> **수행 주체**: `Impl_worker_v1` (세션 `b25f6bee-1f54-4ae5-9b08-9f29d7d01781`)
> **작성 주체**: `Impl_Manager_v1` — 계획·검증 담당. 코드 수정 없음
> **티켓**: [`ticket/impl/20260905_2314_theme_token_migration.yml`](ticket/impl/20260905_2314_theme_token_migration.yml) (`IMPL-20260905-01`)
> **상위 결정**: `PM-20260904-01` D8 (R5 분할 — R5-a 만 출시 스코프) · D-4 (R-6 흡수)
> **기준 버전**: v0.9.1 / `e6875cc`

이 문서는 **대화 맥락 없이 단독 실행 가능**하도록 작성되었다.
아래 수치는 전부 2026-09-05 에 `project/src` 에서 직접 계측했고, §2 의 컴파일 결과는
저장소에 설치된 `tailwindcss@3.4.19` 로 실제로 돌려 얻은 출력이다.

---

## 1. 한 줄 요약

앱의 색을 **CSS 변수 토큰 32개**로 이관하고 그 위에 **다크/라이트 팔레트 2벌**을 얹는다.
YAML 커스텀 테마(R5-b)는 이 범위에 **없다** — 토큰 계층만 세운다.

---

## 2. 반드시 먼저 이해할 것 — 토큰은 **RGB 채널 트리플릿**으로 저장한다

`implementation_plan.md` §3.9 는 Tailwind 색을 `var(--accent-primary)` 로 바꾸라고 적었다.
**그렇게 하면 조용히 깨진다.** 이 저장소의 Tailwind 로 직접 컴파일한 결과다:

| `tailwind.config.js` 의 값 | `.bg-X` | `.bg-X/20` (불투명도 수식어) |
|---|---|---|
| `'#6366f1'` (현행) | `rgb(99 102 241 / var(--tw-bg-opacity,1))` ✅ | `rgb(99 102 241 / 0.2)` ✅ |
| `'var(--accent-primary)'` ← **§3.9 처방** | `var(--accent-primary)` ✅ | **규칙이 생성되지 않는다** ❌ |
| `'rgb(var(--accent-primary-rgb) / <alpha-value>)'` | `rgb(var(--…-rgb) / var(--tw-bg-opacity,1))` ✅ | `rgb(var(--…-rgb) / 0.1)` ✅ |

두 번째 행이 위험한 이유: 유틸리티가 **아예 출력되지 않으므로** 에러도 경고도 없다.
해당 요소는 그냥 색을 잃는다. 이 저장소에는 **불투명도 수식어가 66곳** 있다
(`border-darkBorder/40` 14 · `text-mutedText/40` 10 · `bg-primary/20` 9 · `bg-primary/10` 6 · 나머지 27).

**따라서 토큰은 전부 `R G B` 채널 문자열로 저장하고 이름에 `-rgb` 접미사를 붙인다.**

```css
:root { --surface-0-rgb: 13 14 18; }         /* 값에 rgb() 를 감싸지 않는다 */
```

```js
// tailwind.config.js
darkBg: 'rgb(var(--surface-0-rgb) / <alpha-value>)'
```

```css
/* 생 CSS 에서 쓸 때 — 반드시 rgb() 로 감싼다 */
color: rgb(var(--text-2-rgb));
background: rgb(var(--accent-1-rgb) / 0.15);   /* 알파도 이 형태로 */
```

> **`-rgb` 접미사를 빼지 말 것.** `color: var(--text-2)` 처럼 쓰면 `color: 203 213 225` 가 되어
> **조용히 무효**가 된다. 접미사가 그 실수를 문법 차원에서 막는다.
> 편의용 비채널 변수를 따로 만들지 않는다 — 같은 값이 두 벌 존재하는 구조를 만들지 않기 위함이다.

---

## 3. 스코프

### 3.1 포함

| 대상 | 규모 (실측) |
|---|---|
| `tailwind.config.js` 커스텀 색 | 6개 → 사용처 **259곳이 무수정 전환** |
| `src/app/styles/index.css` hex | **33개** |
| `src/app/styles/erd.css` hex | **7개** + `:root` 변수 **9개** 통합 |
| Tailwind 팔레트 클래스 (`text-slate-200` 류) | **182곳** (팔레트 159 + `white`/`black` 23) |
| 임의값 색 클래스 (`bg-[#141520]` 류) | **14곳** (`.ts` 5 + `.tsx` 9) + `index.css:10` 1곳 |
| `orchestrator.ts` `decorationBaseTheme` 신택스 색 | **12개** |
| `createEditorTheme()` 상수화 (**R-6 누수 흡수**) | `BlockEditor.tsx` + `SingleDocEditor.tsx` |

### 3.2 제외 — 손대지 말 것

| 대상 | 이유 |
|---|---|
| **`src/entities/erd/lib/staticRenderer.ts`** (hex 11개) | **ERD SVG 내보내기 산출물**의 고정 라이트 팔레트다(`:26` `fill="#f8fafc"` · `:80` `#0f172a` 등). 앱 테마를 따라가게 만들면 **다크 테마 사용자가 내보낸 SVG 가 검은 배경으로 나온다.** 내보내기는 테마 무관하게 유지한다 |
| **YAML 파서 · `entities/theme/` 스토어 · `js-yaml`** | R5-b. 출시 후 |
| `src/**/__tests__/**` | §8 의 하네스 수정 지시분만 예외 |

### 3.3 R-6(StyleModule 누수)의 실제 범위 — 좁다

`orchestrator.ts:120` 의 `decorationBaseTheme` 은 **이미 모듈 레벨 상수**라 누수와 무관하다.
누수는 `createEditorTheme()` **하나**에서만 나온다 — `EditorView.theme()` 을 EditorView 생성
이펙트 안에서 호출하므로 블록당 `StyleModule` 이 하나씩 생기고 회수되지 않는다.

그 함수의 설정 의존값은 **`fontFamily` · `fontSize` 둘뿐**이다(`BlockEditor.tsx:90-110` 실측).
둘을 CSS 변수로 빼면 함수가 **인자 없는 모듈 상수**가 되어 `StyleModule` 이 1개로 고정된다.

---

## 4. 토큰 정의 — **26개 (2026-09-09 통합)**

> **⚠️ 32개 → 26개로 통합됐다 (사용자 지시, 2026-09-09).**
> 「토큰을 너무 세세하게 나누지 말라. 필요한 것만 나눠 재사용하라. 세분화가 지나치면 테마 통일성이 떨어진다.」
>
> **왜 32개가 잘못이었나**: 스케일을 **현행 코드 값에서 전수 추출**해 만들었다. 그러면 「픽셀 동일」은
> 얻지만 **기존의 우발적 불일치까지 토큰으로 굳는다** — 디자인 시스템이 아니라 현상 기록이 된다.
> 실측: 표면 6단의 인접 명도대비가 **1.02~1.05:1**, 양끝(구 `surface-0` vs `surface-5`)조차 **1.19:1**.
> 6단계 전체가 사람 눈에 2~3단으로 읽혔다. 인접 대비 1.02:1 이면 **두 토큰이 다른 값이라는 사실 자체에
> 근거가 없다.**
>
> **텍스트는 다르다** — 인접 1.73~2.18:1 로 실제 구분되므로 과하게 줄이지 않았다(6→4).
> **노드 5색은 유지한다** (사용자 확정) — 목적이 통일성이 아니라 **마인드뷰 계층 구분**이라 줄이면 기능을 잃는다.

### 4.1 표면 — **3단** (구 6단)

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--surface-base-rgb` | `13 14 18` (`#0d0e12`) | `255 255 255` | 앱 배경 · 캔버스 · 에디터 바탕 |
| `--surface-panel-rgb` | `22 24 33` (`#161821`) | `241 245 249` | 사이드바 · 툴바 · 카드 · 코드블록 헤더 |
| `--surface-raised-rgb` | `29 31 48` (`#1d1f30`) | `226 232 240` | 부모 표면 위 한 단 — 중첩 카드 · 코드펜스 |

### 4.2 텍스트 — **4단** (구 6단)

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--text-strong-rgb` | `226 232 240` (`#e2e8f0`) | `15 23 42` | 제목 · 강조 |
| `--text-body-rgb` | `203 213 225` (`#cbd5e1`) | `51 65 85` | 본문 |
| `--text-muted-rgb` | `148 163 184` (`#94a3b8`) | `71 85 105` | 보조 · 라벨 |
| `--text-faint-rgb` | `100 116 139` (`#64748b`) | `100 116 139` | 비활성 · 취소선 |

### 4.3 테두리 — 2단

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--border-rgb` | `39 42 55` (`#272a37`) | `226 232 240` | 기본 테두리 · 구분선 |
| `--border-strong-rgb` | `58 63 82` (`#3a3f52`) | `203 213 225` | 강조 테두리 · `<hr>` · 스크롤바 hover |

### 4.4 강조 — 4개 (구 5개, `accent-deep` 제거)

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--accent-rgb` | `99 102 241` (`#6366f1`) | `79 70 229` | 주 강조 · 캐럿 · 헤딩 배지 |
| `--accent-soft-rgb` | `129 140 248` (`#818cf8`) | `99 102 241` | 링크 |
| `--accent-subtle-rgb` | `165 180 252` (`#a5b4fc`) | `129 140 248` | 인라인 코드 |
| `--accent-alt-rgb` | `20 184 166` (`#14b8a6`) | `13 148 136` | 보조 강조(teal) |

> **`--accent-deep`(`#7c3aed`) 제거** — 유일한 용처가 `entities/erd/lib/relations.ts:157` 의
> `var(--text-accent, #7c3aed)` **폴백**인데, `--text-accent` 가 `erd.css` 에서 항상 정의되므로
> **그 폴백은 발화하지 않는다.** 죽은 토큰이다.

### 4.5 의미색 — 6개 (유지)

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--danger-rgb` | `248 113 113` (`#f87171`) | `220 38 38` | 에러 텍스트 |
| `--danger-bg-rgb` | `239 68 68` (`#ef4444`) | `239 68 68` | 에러 배경(알파와 함께) |
| `--warning-rgb` | `245 158 11` (`#f59e0b`) | `217 119 6` | 경고 · dirty 표시 |
| `--info-rgb` | `147 197 253` (`#93c5fd`) | `37 99 235` | 정보 |
| `--highlight-rgb` | `253 224 71` (`#fde047`) | `202 138 4` | 하이라이트(`==text==`) |
| `--magenta-rgb` | `240 171 252` (`#f0abfc`) | `162 28 175` | 강조 구문 |

각각 **다른 hue 이고 다른 역할**이라 합치면 의미를 잃는다. 유지한다.

### 4.6 마인드뷰 노드 — **5개 (유지, 사용자 확정)**

| 토큰 | 다크 | 라이트 |
|---|---|---|
| `--node-1-rgb` | `45 212 191` (teal) | `13 148 136` |
| `--node-2-rgb` | `56 189 248` (sky) | `2 132 199` |
| `--node-3-rgb` | `251 191 36` (amber) | `217 119 6` |
| `--node-4-rgb` | `244 114 182` (pink) | `219 39 119` |
| `--node-5-rgb` | `192 132 252` (purple) | `147 51 234` |

**목적이 계층 구분**이라 통합 대상이 아니다. `entities/settings/model/types.ts:11` 의
`mindmap.nodeColorScheme`(소비처 0건)과 겹치므로, **노드 색을 설정에서 읽는 코드를 새로 만들지 않는다.**

### 4.7 오버레이 / 스크림 — 2개

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--overlay-rgb` | `255 255 255` | `0 0 0` | 표면 위 미세 대비 — **라이트에서 반전된다** |
| `--scrim-rgb` | `0 0 0` | `0 0 0` | 모달 뒷배경 — 양쪽 동일 |

### 4.8 통합으로 **실제 바뀌는 화면 지점** — 여기만 보면 된다

> **이 단계는 「픽셀 동일」 약속을 처음으로 깨는 단계다.** 그래서 **통합은 그 자체로 하나의 커밋**이어야
> 하고, 「픽셀 동일」 커밋과 절대 섞지 않는다. 섞이면 나중에 화면이 이상할 때
> 「배선이 틀렸나 / 통합이 의도된 변화인가」를 분리할 수 없다.

| # | 지점 | 이전 | 이후 | 대비 |
|---|---|---|---|---|
| 1 | 스크롤바 트랙 (`index.css`) | `#111216` | `#0d0e12` | 1.03:1 |
| 2 | `erd.css --background-secondary` | `#111216` | `#0d0e12` | 1.03:1 |
| 3 | `bg-[#111216]` 2곳 — `WorkspacePage:248` · `MindView:374` | `#111216` | `#0d0e12` | 1.03:1 |
| 4 | `bg-[#141520]` 7곳 — 카드 · 코드블록 헤더 | `#141520` | `#161821` | 1.02:1 |
| 5 | `bg-[#1a1b26]` 1곳 + `orchestrator` 코드펜스 배경 | `#1a1b26` | `#1d1f30` | 1.05:1 |
| 6 | H1 · `.cm-heading` · `text-slate-100` 11곳 | `#f1f5f9` | `#e2e8f0` | 1.13:1 |
| 7 | `.cm-hr-line` | `#334155` | `#3a3f52` | — |
| 8 | `.rv-content mark` 배경 (`index.css:277`) | `rgba(234,179,8,.18)` | `rgb(var(--highlight-rgb)/.18)` | — |

**전부 1.13:1 이하**라 육안으로는 거의 구분되지 않는다. 그래도 **바뀌는 것은 사실**이므로 위 8지점을
실기에서 확인한다 — 목록이 있으므로 전 화면을 훑을 필요가 없다.

## 5. 매핑표 — 팔레트 클래스 → 토큰 클래스

`tailwind.config.js` 에 아래 이름을 추가하고, 소스의 팔레트 클래스를 기계적으로 치환한다.

| 현행 클래스 | 치환 | 건수 |
|---|---|---|
| `text-slate-100` | `text-strong` | 11 |
| `text-slate-200` | `text-strong` | 46 |
| `text-slate-300` | `text-body` | 22 |
| `text-slate-400` | `text-muted` | 16 |
| `text-slate-500` | `text-faint` | 7 |
| `text-white` | `text-strong` | 2 |
| `bg-white/N` · `border-white/N` | `bg-overlay/N` · `border-overlay/N` | ~25 |
| `bg-black/N` | `bg-scrim/N` | 3 |
| `text-red-400` · `text-red-300` | `text-danger` | 7 |
| `bg-red-500/N` · `border-red-500/N` | `bg-dangerBg/N` · `border-dangerBg/N` | 5 |
| `bg-amber-500` | **§8 제약 — 건드리지 말 것** | 4 |
| `text-amber-400` · `bg-amber-500/N` · `border-amber-500/N` · `bg-amber-950/N` | `*-node3` | 5 |
| `text-indigo-400` · `text-indigo-300` | `text-accentSoft` · `text-accentSubtle` | 8 |
| `bg-indigo-500/N` · `border-indigo-500/N` · `ring-indigo-*` | `*-accent/N` | 9 |
| `bg-indigo-9NN/N` · `border-indigo-9NN/N` | `bg-panel/N` 계열 — **육안 대조 필수** | 8 |
| `text-teal-400` · `bg-teal-*` · `border-teal-*` | `*-node1` | 4 |
| `text-sky-400` · `bg-sky-*` · `border-sky-*` | `*-node2` | 4 |
| `text-pink-400` · `bg-pink-*` · `border-pink-*` | `*-node4` | 4 |
| `text-purple-400` · `bg-purple-*` · `border-purple-*` | `*-node5` | 4 |
| `text-yellow-300` · `bg-yellow-500/N` | `text-highlight` · `bg-highlight/N` | 2 |

> **`bg-indigo-950/70` 계열 8곳만 값이 정확히 대응하지 않는다.** indigo-950(`#1e1b4b`)은
> 표면 스케일에 없는 색이다. **이 8곳은 T3 에서 마지막에 처리하고, 치환 전후를 육안으로 대조**한 뒤
> 필요하면 `--surface-5-rgb` 근처 값으로 별도 토큰(`--surface-accent-rgb`)을 1개 더 추가한다.
> 토큰이 34개가 되는 것은 허용한다 — **없는 색을 억지로 기존 단계에 밀어넣지 않는다.**

---

## 6. 실행 단계 — 되돌림 단위 = 커밋 1개

> **분할 기준은 파일이 아니라 「화면이 바뀌는가」다.**
> **T6 직전까지 모든 커밋은 순수 리팩터이며, 다크 모드에서 화면이 픽셀 동일해야 한다.**
> 이것이 이 계획의 핵심 안전장치다 — 잘못된 매핑이 즉시 눈에 띄고, 되돌림이 커밋 1개다.

### T1a — 토큰 정의 + Tailwind 배선

**파일**: `src/app/styles/index.css` (`:root` 신설) · `tailwind.config.js`

1. `index.css` 최상단(`@tailwind` 지시자 **뒤**, `@layer base` **앞**)에 `:root` 블록을 만들고 §4 의 다크 값 32개를 `--*-rgb: R G B` 형태로 정의한다.
2. `tailwind.config.js` `theme.extend.colors` 를 아래로 교체한다. **기존 6개 이름을 유지**해야 259곳이 무수정으로 전환된다.

```js
colors: {
  darkBg:     'rgb(var(--surface-0-rgb) / <alpha-value>)',
  darkPanel:  'rgb(var(--surface-3-rgb) / <alpha-value>)',
  darkBorder: 'rgb(var(--border-1-rgb) / <alpha-value>)',
  primary:    'rgb(var(--accent-0-rgb) / <alpha-value>)',
  accent:     'rgb(var(--accent-alt-rgb) / <alpha-value>)',
  mutedText:  'rgb(var(--text-3-rgb) / <alpha-value>)',
  // §5 매핑용 신규
  t0:'rgb(var(--text-0-rgb) / <alpha-value>)', t1:'rgb(var(--text-1-rgb) / <alpha-value>)',
  t2:'rgb(var(--text-2-rgb) / <alpha-value>)', t3:'rgb(var(--text-3-rgb) / <alpha-value>)',
  t4:'rgb(var(--text-4-rgb) / <alpha-value>)',
  surface0:'rgb(var(--surface-0-rgb) / <alpha-value>)', surface1:'rgb(var(--surface-1-rgb) / <alpha-value>)',
  surface2:'rgb(var(--surface-2-rgb) / <alpha-value>)', surface4:'rgb(var(--surface-4-rgb) / <alpha-value>)',
  surface5:'rgb(var(--surface-5-rgb) / <alpha-value>)',
  overlay:'rgb(var(--overlay-rgb) / <alpha-value>)', scrim:'rgb(var(--scrim-rgb) / <alpha-value>)',
  accent0:'rgb(var(--accent-0-rgb) / <alpha-value>)', accent1:'rgb(var(--accent-1-rgb) / <alpha-value>)',
  accent2:'rgb(var(--accent-2-rgb) / <alpha-value>)',
  danger:'rgb(var(--danger-rgb) / <alpha-value>)', dangerBg:'rgb(var(--danger-bg-rgb) / <alpha-value>)',
  highlight:'rgb(var(--highlight-rgb) / <alpha-value>)',
  node1:'rgb(var(--node-1-rgb) / <alpha-value>)', node2:'rgb(var(--node-2-rgb) / <alpha-value>)',
  node3:'rgb(var(--node-3-rgb) / <alpha-value>)', node4:'rgb(var(--node-4-rgb) / <alpha-value>)',
  node5:'rgb(var(--node-5-rgb) / <alpha-value>)',
}
```

3. `index.css:10` 의 `bg-[#0d0e12]` → `bg-base`.

**검증**: `pnpm dev` 로 띄워 **화면이 이전과 동일한지 육안 확인**. 특히 `border-darkBorder/40`·`bg-primary/20` 이 쓰인 곳(탭 바·저장 버튼)의 **반투명이 살아 있는지** — §2 의 실패 모드가 여기서 드러난다.

### T1b — `index.css` hex 33개 → 토큰

**파일**: `src/app/styles/index.css`
대상 행: `21 25 30 42 78 79 80 83 85 86 88 97 103 112 119 122 131 137 141 145 146 191 192 195 211 221 251 254 277 288 298 308`

전부 `color: rgb(var(--…-rgb));` 형태로 바꾼다. `rgba(...)` 로 되어 있던 것은 `rgb(var(--…-rgb) / 알파)`.
**§4 표의 「출처」 열이 각 행의 대응 토큰을 지정한다.**

**검증**: 화면 픽셀 동일. ReadView(읽기 모드)를 열어 H1~H6·인용문·코드·표·링크를 육안 확인.

### T1c — `erd.css` 통합

**파일**: `src/app/styles/erd.css`
`:root` 블록(1-10행)의 9개 변수를 **삭제하지 말고 별칭으로 바꾼다.** `.erd-*` 셀렉터 259줄은 무수정이다.

```css
:root {
  /* Obsidian 계열 이름 유지 — `.erd-*` 셀렉터 259줄 무수정.
   * 매핑 기준은 값이 아니라 **역할**이다. T6 에서 라이트 값을 조정할 때 이 주석을 근거로 판단할 것.
   * 값 대응은 전수 검증됨(8종 전부 일치, 미포함 0건). */
  --background-primary:         rgb(var(--surface-0-rgb));        /* 셸 배경 */
  --background-secondary:       rgb(var(--surface-1-rgb));        /* 보조 표면 */
  --background-modifier-border: rgb(var(--border-1-rgb));         /* 툴바·구분선 */
  --text-normal:                rgb(var(--text-1-rgb));           /* ERD 본문 */
  --text-muted:                 rgb(var(--text-4-rgb));           /* 부가 설명 */
  --text-accent:                rgb(var(--accent-0-rgb));         /* 강조 */
  --background-modifier-error:  rgb(var(--danger-bg-rgb) / 0.15); /* .erd-alert 배경 */
  --text-on-accent:             rgb(var(--danger-rgb));           /* .erd-alert 글자 — 이름은 on-accent 지만 실제 역할은 on-error */
  --font-monospace: ui-monospace, SFMono-Regular, Menlo, monospace;  /* 색 아님 — 유지 */
}
```

> **매핑 기준은 값이 아니라 역할이다.** 각 별칭 줄에 역할 주석을 남긴다(위 코드 참조).
> T6 에서 라이트 값을 조정하는 사람이 「이 별칭이 왜 이 토큰인가」를 값이 아니라 역할로 읽어야 한다.
> 실제 사례: `--text-on-accent`(`#f87171`)는 이름만 「강조 위 글자」이고 실제 용처는
> `.erd-alert` **에러 배너 글자**다(`erd.css:59-60`, `--background-modifier-error` 와 짝).
> 그래서 `--danger-rgb` 매핑이 **값이 겹쳐서가 아니라 역할이 같아서** 맞다 —
> T6 에서 danger 를 조정하면 이 글자도 **함께 움직이는 것이 정상**이다. (`VER-20260909-01` 지적, 확인 완료)
>
> **9개 중 3개만 Tailwind 와 값이 같았다**(`#0d0e12`·`#272a37`·`#6366f1`). 나머지 6개는
> §4 의 스케일이 그 값을 **정확히 포함하도록 설계**되어 있으므로 위 별칭은 값을 바꾸지 않는다.
> 대응이 맞는지 T1c 착수 시 **한 번 더 대조**할 것.

**검증**: ERD 탭을 열어 화면 픽셀 동일.

### T1d — **토큰 통합 (32 → 26)** ← 단독 커밋. 화면이 바뀌는 유일한 사전 단계

**파일**: `src/app/styles/index.css`(`:root`) · `tailwind.config.js` · `src/app/styles/erd.css`

§4 의 26개 스케일로 `:root` 를 다시 쓰고, Tailwind 색 이름을 새 토큰에 맞춘다.
`erd.css` 별칭 8줄도 새 토큰명으로 갱신하고, 이때 **`--text-on-accent` → `--text-error` 로 개명**한다
(이름만 보고 accent 계열로 매핑하면 에러 알림 글자가 보라색이 된다. 소비자는 `erd.css:60` 한 곳뿐).

기존 6색 Tailwind 이름(`darkBg`·`darkPanel`·`darkBorder`·`primary`·`accent`·`mutedText`)은
**그대로 유지**한다 — 사용처 259~266곳이 무수정으로 남는다. 가리키는 토큰만 바꾼다:

```js
darkBg:     'rgb(var(--surface-base-rgb) / <alpha-value>)',
darkPanel:  'rgb(var(--surface-panel-rgb) / <alpha-value>)',
darkBorder: 'rgb(var(--border-rgb) / <alpha-value>)',
primary:    'rgb(var(--accent-rgb) / <alpha-value>)',
accent:     'rgb(var(--accent-alt-rgb) / <alpha-value>)',
mutedText:  'rgb(var(--text-muted-rgb) / <alpha-value>)',
```

**⚠️ 이 커밋에 다른 것을 섞지 말 것.** §4.8 의 8지점이 이 커밋 하나 때문에 바뀐다.
커밋 메시지에 **어느 쌍이 어느 값으로 수렴했는지** 남긴다.

**검증**: §4.8 의 8지점 **외에는** 컴파일 출력이 값 동일해야 한다. 앞 단계에서 쓰던
「토큰을 실제 색으로 환원해 전문 대조」를 그대로 돌리되, **차이가 8지점에서만 나오는지**로 판정한다.
9번째 차이가 나오면 배선 실수다.

### T3a~T3e — 팔레트 클래스 182곳, 파일 단위 5커밋

§5 매핑표대로 치환한다. **파일 하나 = 커밋 하나.**

| 커밋 | 파일 | 건수 |
|---|---|---|
| T3a | `widgets/MindView/ui/MindView.tsx` | 46 |
| T3b | `widgets/FileExplorer/ui/FileExplorer.tsx` | 29 |
| T3c | `widgets/ErdDesigner/ui/ErdDesigner.tsx` | 26 |
| T3d | `pages/WorkspacePage/WorkspacePage.tsx` | 26 |
| T3e | `widgets/SettingsModal/ui/SettingsModal.tsx` 21 + `FormatToolbar.tsx` 13 + `LauncherPage.tsx` 4 + `App.tsx` 4 | 42 |

**각 커밋마다 해당 화면을 띄워 픽셀 동일을 확인**한 뒤 다음으로 간다.

### T3f — 임의값 색 클래스, 비충돌 8곳

| 파일 | 행 | 현재 | 치환 |
|---|---|---|---|
| `pages/WorkspacePage/WorkspacePage.tsx` | 248 | `bg-[#111216]` | `bg-base` |
| `widgets/MindView/ui/MindView.tsx` | 374 | `bg-[#111216]` | `bg-base` |
| `widgets/MindView/ui/MindView.tsx` | 480 | `bg-[#0d0e12]` | `bg-base` |
| `shared/lib/editor/decorators/impl/BlockCardDecorator.ts` | 132, 133 | `bg-[#141520]`, `bg-[#1d1f30]` | `bg-panel`, `bg-raised` |
| `shared/lib/editor/decorators/impl/CodeBlockDecorator.ts` | 237 | `bg-[#141520]` | `bg-panel` |
| `shared/lib/editor/decorators/impl/TableDecorator.ts` | 760, 766 | `bg-[#141520]` ×2 | `bg-panel` |

> `MindView.tsx:502` 의 `stroke="#272a37"` 은 **SVG 속성**이라 Tailwind 클래스가 아니다.
> `stroke="rgb(var(--border-1-rgb))"` 로 바꾼다.

### T2 — `orchestrator.ts` 신택스 색 + `createEditorTheme` 상수화 (**R-6**)

**파일**: `shared/lib/editor/decorators/orchestrator.ts`

`decorationBaseTheme`(`:120` 시작)의 색 12개를 `rgb(var(--…-rgb))` 로 바꾼다.
CodeMirror 의 `baseTheme` 은 CSS 로 컴파일되므로 CSS 변수가 그대로 동작한다.

| 행 | 현재 | 토큰 |
|---|---|---|
| 125 / 134 / 142 / 150 | `#f1f5f9` / `#e2e8f0` / `#cbd5e1` / `#94a3b8` (H1~H6) | `--text-0` / `-1` / `-2` / `-3` |
| 159, 294 | `#6366f1` | `--accent-0` |
| 177 | `rgba(99,102,241,0.14)` | `rgb(var(--accent-0-rgb) / 0.14)` |
| 178 | `#a5b4fc` | `--accent-2` |
| 185 | `#1a1b26` | `--surface-4` |
| 244, 253 | `#f0abfc` | `--magenta` |
| 286 | `#f87171` | `--danger` |
| 303 | `#818cf8` | `--accent-1` |

**같은 커밋에서 R-6 를 처리한다** — `BlockEditor.tsx` 를 여는 김에 함께 한다(§7 충돌 규칙 확인 후).

`BlockEditor.tsx:90-110` `createEditorTheme(settingsEditor)` 를:
1. `.cm-scroller` 의 `fontFamily`/`fontSize` 를 `var(--editor-font-family)` / `var(--editor-font-size)` 로 바꾼다.
2. 함수에서 **인자를 제거**하고 모듈 최상단에서 **한 번만 호출**해 상수에 담는다.
3. `:235` `editorThemeCompartment.of(...)` 가 그 상수를 쓰게 한다.
4. `:144-152` 의 이펙트에서 **`editorThemeCompartment.reconfigure(...)` 줄만 제거**한다.
   ⚠️ **이펙트 자체를 지우지 말 것** — 같은 이펙트가 `lineWrappingCompartment` 도 처리한다.
5. `:720` 이 이미 `--editor-font-size` 를 인라인 스타일로 넣고 있다. `--editor-font-family` 도 같은 자리에 추가한다.
6. `SingleDocEditor.tsx` 의 `createEditorTheme`(`:62`·`:103`·`:188`)에도 **같은 처리를 한다** (사용자 결정, 2026-09-05).

**검증 — R-6 계측 절차** (T2 티어: `pnpm dev` + 브라우저 콘솔)

> 이 절차가 **사용자 결정 D-4 의 검산**이다. D-4 는 「R-6 누수와 테마 토큰화는 같은 물건이니
> 따로 짓지 말라」고 판단했다. 그게 실제로 맞았는지 확인되는 지점은 여기 하나뿐이다.
> **결과 수치를 반드시 보고할 것** — 통과/불통과만 적지 말 것.

측정 도구:

```js
const styleBytes = () => [...document.querySelectorAll('style')]
  .reduce((n, s) => n + s.textContent.length, 0);
```

- [ ] **M1 — N 비례 증가 소멸**: 수정 전/후 각각 블록 10개 문서와 100개 문서를 열고 `styleBytes()` 대조.
      기대 — 전에는 차이가 약 **90 × 525 ≈ 47,000자**(`BUG-20260831-02` 실측 인스턴스당 525자), 후에는 **≈ 0**
- [ ] **M2 — create-destroy 누수 폐쇄**: 문서 열기 → 탭 닫기 **20회 반복**, 매 회 `styleBytes()` 기록.
      기대 — 전에는 단조 증가(원 티켓은 360 사이클까지 확인), 후에는 **평탄**
- [ ] **M3 — 회귀 없음**: 설정에서 폰트 크기·패밀리 변경이 **즉시 반영**된다.
      ⚠️ **이번 변경의 최대 위험**이다 — `reconfigure` 경로를 없애기 때문이다
- [ ] **M4 — 마운트 오버헤드** *(참고 수치, 게이트 아님)*: `BUG-20260831-02` 가 「테마를 얹은 조건의
      마운트 절대 비용 **약 50% 증가**(N=100 에서 614→903ms)」를 기록했다. 그 오버헤드가 사라졌는지
      `mount_cost_t2_harness.ts` 로 확인한다. **안 사라져도 T2 를 막지 않는다 — 숫자만 보고한다**

보고 시 **색 이관 20건**과 **R-6 계측**을 나눠서 적는다. 둘은 비용도 위험도 다르다.

### T3g — 충돌 파일 잔여 6곳 (**마지막**)

| 파일 | 행 | 치환 |
|---|---|---|
| `widgets/BlockEditor/ui/BlockEditor.tsx` | 421, 423 | `bg-panel`, `bg-raised` |
| `widgets/BlockEditor/ui/ReadView.tsx` | 68, 458 | `bg-panel` |
| `widgets/BlockEditor/ui/ReadView.tsx` | 76 | `bg-raised` |
| `widgets/BlockEditor/ui/ReadView.tsx` | 460 | `bg-raised` |

`ReadView.tsx` 팔레트 8곳 · `ErdDesignerMainView.tsx` 팔레트 1곳도 같은 커밋에서 처리한다.

### T6 — 라이트 팔레트 + 전환 (**처음으로 화면이 바뀐다**)

1. `index.css` 에 `:root[data-theme="light"] { … }` 블록으로 §4 의 라이트 값 32개를 정의한다.
2. 시스템 추종: `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { … } }`
   (사용자 결정 — `system`/`dark`/`light` **3택**)
3. `entities/settings/model/types.ts` 에 `general.themeMode: 'system' | 'dark' | 'light'` 추가, 기본값 `'system'`. **마이그레이션**: 기존 설정에 필드가 없으면 `'system'`.
4. 진입점 2개: 설정 모달 일반 탭의 3택 + **상태바 토글 1개**.
5. `body` 에 `transition: background-color .2s, color .2s`.
6. 적용은 `document.documentElement.setAttribute('data-theme', mode)` — `mode === 'system'` 이면 속성을 **제거**한다.

---

## 7. 하드 제약 — 파일 점유 (조율 규칙 R3)

`Debug_worker_v2` 세션이 아래 3파일을 잡고 있다. **`git status --short` 로 착수 전 확인할 것.**

| 파일 | 이 계획에서 언제 |
|---|---|
| `widgets/BlockEditor/ui/BlockEditor.tsx` | **T2 · T3g — 마지막** |
| `widgets/BlockEditor/ui/ReadView.tsx` | **T3g — 마지막** |
| `widgets/ErdDesigner/ui/ErdDesignerMainView.tsx` | **T3g — 마지막** |

**T1a ~ T3f 는 이 3파일을 전혀 건드리지 않는다. 지금 바로 착수 가능하다.**
T2 착수 전에 `Impl_Manager_v1` 을 통해 점유 해제를 확인한다.

커밋은 **경로 지정**으로 한다. `git add -A` 금지. 공유 워킹 트리이며 실제 사고 이력이 있다(`f48b88c`).

---

## 8. 하드 제약 — 하네스가 클래스 이름을 단언한다

`src/pages/WorkspacePage/__tests__/save_dirty_indicator_harness.tsx` 가 **문자열로** 검사한다:

| 행 | 단언 |
|---|---|
| 66, 80, 106 | `document.querySelector('.bg-amber-500')` — dirty 점 |
| 64, 79, 89, 102 | `btn.className.includes('bg-primary/10')` — 저장 버튼 |

- **`WorkspacePage.tsx:307` 의 `bg-amber-500` 을 바꾸지 말 것.** §5 매핑표에서 제외했다.
  라이트 모드 대응이 필요하면 **T6 에서 하네스와 함께** 바꾼다 — 이 계획의 T3 범위가 아니다.
- `bg-primary/10` 은 **이름이 유지**되므로 안전하다. 다만 T1a 이후 **렌더링**이 살아 있는지는
  하네스가 잡아주지 않는다(문자열만 본다) — §T1a 검증에서 육안으로 확인해야 하는 이유다.

---

## 9. DoD

- [ ] T1a~T3g 각 커밋에서 **다크 모드 화면이 이전과 동일**하다 (픽셀 동일)
- [ ] `border-darkBorder/40` · `bg-primary/20` 등 불투명도 수식어 66곳이 **여전히 반투명**이다
- [ ] 라이트 모드에서 본문 텍스트 대비가 **4.5:1 이상**이다
- [ ] 라이트 모드에서 `bg-overlay/N` 이 보인다 (흰 배경에 흰 오버레이가 아니다)
- [ ] ERD 탭이 양쪽 모드에서 정상 렌더링된다
- [ ] **ERD SVG 내보내기 결과가 테마와 무관하게 동일**하다 (§3.2)
- [ ] R-6 계측 M1~M4 (§T2) — **수치를 보고한다.** M4 는 참고 수치이지 게이트가 아니다
- [ ] `themeMode` 설정이 앱 재실행 후 복원된다
- [ ] `pnpm test:t1` (15종) · `pnpm test:t15` (4종) 무회귀
- [ ] `pnpm tsc --noEmit` · `pnpm lint` 통과
- [ ] 버전업 4파일 동시 (`package.json` · `Cargo.toml` · `tauri.conf.json` · `Cargo.lock`) — 코드 커밋이므로 예외 없음

---

## 10. 이 계획이 하지 않는 것

| 항목 | 왜 |
|---|---|
| `mindmap.nodeColorScheme` 제거 | 소비처 0건인 고아 설정이지만 **별건 티켓 대상**이다. 이 계획은 그 필드를 읽지도 쓰지도 않는다 |
| `mindmap.edgeStyle` 배선 | 같은 성격의 고아 설정. R5-a 와 무관 |
| YAML 파서 · 테마 파일 스캔 | R5-b (출시 후) |
| `staticRenderer.ts` | §3.2 |
| `.cm-line *` 위젯 타이포그래피 | **R7 / P1-9 — 별도 티켓.** 사양서 기존재 |
