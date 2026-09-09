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

## 4. 토큰 정의 — **35개 (2026-09-09 ΔE 재판정)**

> ### ⚠️ 이 절은 두 번 고쳐졌다. 아래가 최종이다.
>
> **1차(32개)**: 현행 코드 값을 전수 추출 → 「픽셀 동일」은 얻었으나 **기존의 우발적 불일치까지 토큰으로 굳었다.**
> **2차(26개)**: 명도대비 1.02~1.05:1 을 근거로 표면 6→3, 텍스트 6→4 통합.
> **3차(29개, 최종)**: **명도대비가 잘못된 척도였다.** 어두운 영역에서는 둔감하다.
> 표준 지표인 **CIE76 ΔE**(2.3 미만 = JND, 사람이 구분 못 하는 경계)로 다시 재니 **2차 통합 중 절반이 과했다**:
>
> | 2차에서 병합한 쌍 | 명도대비 | **ΔE** | 3차 판정 |
> |---|---|---|---|
> | surface-0+1 (`#0d0e12`↔`#111216`) | 1.03:1 | **1.56** | ✅ 병합 유지 |
> | surface-2+3 (`#141520`↔`#161821`) | 1.02:1 | **2.06** | ✅ 병합 유지 |
> | surface-4+5 (`#1a1b26`↔`#1d1f30`) | 1.05:1 | **4.71** | ❌ **병합 철회** |
> | text-0+1 (`#f1f5f9`↔`#e2e8f0`) | 1.13:1 | **5.08** | ❌ **병합 철회** — 35px H1 에 직접 적용되는 색이다 |
> | text-5→border-2 (`#334155`↔`#3a3f52`) | — | **3.28** | ❌ **병합 철회.** 이름만 `--divider` 로 바꾼다(역할 정정, 값 불변) |
>
> **결론: 병합은 ΔE < 2.3 인 2쌍만.** 죽은 토큰 `--accent-deep` 을 빼고, 노드 tint 5개와
> `--highlight-bg` 1개를 더해 **32 → 35**. **개수가 늘었다** — 제대로 재보니 줄일 수 없었다.
> 「필요한 것만 나눈다」의 기준은 개수가 아니라 **「이 둘이 실제로 다른 색인가」**이고, ΔE 가 그 답이다.
>
> **교훈**: 명도대비(WCAG)는 **텍스트 가독성** 지표지 **색 근접성** 지표가 아니다.
> 어두운 색끼리는 대비가 1.0x 로 뭉개져 큰 차이도 작아 보인다. **색이 같은가는 ΔE 로 판정한다.**

### 4.1 표면 — **4단** (구 6단, ΔE<2.3 인 2쌍만 병합)

| 토큰 | 다크 | 라이트 | 역할 | 병합 |
|---|---|---|---|---|
| `--surface-base-rgb` | `13 14 18` (`#0d0e12`) | `255 255 255` | 앱 배경 · 캔버스 · 에디터 바탕 | ← 구 surface-0+1 (ΔE 1.56) |
| `--surface-panel-rgb` | `22 24 33` (`#161821`) | `241 245 249` | 사이드바 · 툴바 · 카드 · 코드블록 헤더 | ← 구 surface-2+3 (ΔE 2.06) |
| `--surface-code-rgb` | `26 27 38` (`#1a1b26`) | `236 241 247` | 코드펜스 라인 배경 | 구 surface-4 유지 |
| `--surface-raised-rgb` | `29 31 48` (`#1d1f30`) | `226 232 240` | 중첩 카드 | 구 surface-5 유지 |

### 4.2 텍스트 — **5단 유지** (병합 철회, ΔE 5.08~19.19 로 전부 감지 가능)

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--text-title-rgb` | `241 245 249` (`#f1f5f9`) | `15 23 42` | H1 · 최상위 제목 |
| `--text-strong-rgb` | `226 232 240` (`#e2e8f0`) | `30 41 59` | H2 · 강조 · 본문 강조 |
| `--text-body-rgb` | `203 213 225` (`#cbd5e1`) | `51 65 85` | 본문 |
| `--text-muted-rgb` | `148 163 184` (`#94a3b8`) | `71 85 105` | 보조 · 라벨 |
| `--text-faint-rgb` | `100 116 139` (`#64748b`) | `100 116 139` | 비활성 · 취소선 |

### 4.2.1 구분선 — 텍스트가 아니다

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--divider-rgb` | `51 65 85` (`#334155`) | `148 163 184` | `.cm-hr-line` |

구 `--text-5` 다. **값은 그대로 두고 이름만 고친다** — 텍스트가 아니라 구분선이었다(역할 배정 오류).
`--border-strong`(`#3a3f52`)과 합치려 했으나 **ΔE 3.28 로 감지 가능**해 철회했다.

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
| `--highlight-bg-rgb` | `234 179 8` (`#eab308`) | `202 138 4` | `.rv-content mark` 배경(알파와 함께) |

각각 **다른 hue 이고 다른 역할**이라 합치면 의미를 잃는다. 유지한다.

### 4.6 마인드뷰 노드 — **hue 5 + tint 5 = 10개**

**사용자 확정: 노드 색은 분리 유지.** 목적이 통일성이 아니라 **계층 구분**이다.

코드는 레벨 하나에 **세 셰이드**를 쓴다 — 텍스트 `-400`, 뱃지 배경/테두리 `-500`, 카드 배경 `-950`.
처음에 이걸 hue 토큰 하나로 합치려 했으나 **ΔE 2.76~10.40 으로 감지 가능**해 철회했다
(알파를 최적화해도 색상각이 달라 못 맞춘다). **hue 와 tint 를 나눈다:**

| 레벨 | `--node-N-rgb` (텍스트, 구 `-400`) | `--node-N-tint-rgb` (표면, 구 `-500`) |
|---|---|---|
| 1 teal | `45 212 191` | `20 184 166` |
| 2 sky | `56 189 248` | `14 165 233` |
| 3 amber | `251 191 36` | `245 158 11` |
| 4 pink | `244 114 182` | `236 72 153` |
| 5 purple | `192 132 252` | `168 85 247` |

- **뱃지 배경/테두리**(`bg-node1Tint/20` · `border-node1Tint/30`) — 원본 값 그대로. **ΔE 0**
- **카드 배경**(구 `bg-{hue}-950/20`) — tint 의 낮은 알파로 재현: `node1 /[.04]` · `node2 /[.05]` · `node3 /[.05]` · `node4 /[.06]` · `node5 /[.09]`. **ΔE 0.63~2.82**

`entities/settings/model/types.ts:11` 의 `mindmap.nodeColorScheme`(소비처 0건)과 겹치므로,
**노드 색을 설정에서 읽는 코드를 새로 만들지 않는다.**

### 4.7 오버레이 / 스크림 — 2개

| 토큰 | 다크 | 라이트 | 역할 |
|---|---|---|---|
| `--overlay-rgb` | `255 255 255` | `0 0 0` | 표면 위 미세 대비 — **라이트에서 반전된다** |
| `--scrim-rgb` | `0 0 0` | `0 0 0` | 모달 뒷배경 — 양쪽 동일 |

### 4.8 **실제 바뀌는 화면 지점** — 여기만 보면 된다

> **이 단계는 「픽셀 동일」 약속을 깨는 유일한 지점이다.** 그래서 **통합은 독립 커밋**이어야 하고,
> 「픽셀 동일」 커밋과 절대 섞지 않는다. 섞이면 화면이 이상할 때
> 「배선 실수인가 / 의도된 변화인가」를 분리할 수 없다 — R5-a 는 교차검증이 없어 이게 유일한 사후 판별 수단이다.

| # | 지점 | 이전 → 이후 | **ΔE** |
|---|---|---|---|
| 1 | 스크롤바 트랙 · `erd --background-secondary` · `bg-[#111216]` 2곳 | `#111216` → `#0d0e12` | **1.56** |
| 2 | `bg-[#141520]` 7곳 (카드 · 코드블록 헤더) | `#141520` → `#161821` | **2.06** |
| 3 | 마인드뷰 카드 배경 node3 · node5 | `-950/20` → `tint` 낮은 알파 | **2.71 · 2.82** |
| 4 | 마인드뷰 카드 배경 node1 · node2 · node4 · indigo | 〃 | 0.63~2.05 |

**1·2 는 JND(2.3) 미만이라 감지 불가. 3 만 근소하게 넘는다** — 근흑색 카드 배경이라 절대 영향은 작다.
**그 외 모든 지점은 값이 그대로다.**

**검증**: 「토큰을 실제 색으로 환원해 컴파일 출력 전문 대조」를 돌리되,
**차이가 위 목록에서만 나오는지**로 판정한다. **목록 밖 차이가 하나라도 나오면 배선 실수다.**

## 5. 매핑표 — 팔레트 클래스 → 토큰 클래스

`tailwind.config.js` 에 아래 이름을 추가하고, 소스의 팔레트 클래스를 기계적으로 치환한다.

| 현행 클래스 | 치환 | 건수 |
|---|---|---|
| `text-slate-100` | `text-title` | 11 |
| `text-slate-200` | `text-strong` | 46 |
| `text-slate-300` | `text-body` | 22 |
| `text-slate-400` | `text-mutedText` *(레거시 이름 유지)* | 16 |
| `text-slate-500` | `text-faint` | 7 |
| `text-white` | `text-title` | 2 |
| `bg-white/N` · `border-white/N` | `bg-overlay/N` · `border-overlay/N` | ~25 |
| `bg-black/N` | `bg-scrim/N` | 3 |
| `text-red-400` · `text-red-300` | `text-danger` | 7 |
| `bg-red-500/N` · `border-red-500/N` | `bg-dangerBg/N` · `border-dangerBg/N` | 5 |
| `bg-amber-500` | **§8 제약 — 건드리지 말 것** | 4 |
| `text-amber-400` · `bg-amber-500/N` · `border-amber-500/N` | `*-node3` | 5 |
| `bg-amber-950/N` 등 `-950` 계열 | **§5.1 참조** | — |
| `text-indigo-400` · `text-indigo-300` | `text-accentSoft` · `text-accentSubtle` | 8 |
| `bg-indigo-500/N` · `border-indigo-500/N` · `ring-indigo-*` | **`*-primary/N`** *(레거시 이름 — 새 키를 만들지 않는다)* | 9 |
| `bg-indigo-9NN/N` · `border-indigo-9NN/N` | **§5.1 의 낮은 알파 치환** (`bg-primary/[.05]` 등) | 8 |
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

### 5.1 노드 계열 — **hue / tint 를 구분해 쓴다**

| 현행 | 치환 | ΔE |
|---|---|---|
| `text-{hue}-400` | `text-nodeN` | 0 |
| `bg-{hue}-500/20` · `border-{hue}-500/30` | `bg-nodeNTint/20` · `border-nodeNTint/30` | **0** |
| `bg-{hue}-950/20` | `bg-nodeNTint/[.04]`(n1) `[.05]`(n2·n3) `[.06]`(n4) `[.09]`(n5) | 0.63~2.82 |
| `shadow-{hue}-950/10` | `shadow-nodeNTint/[.02]` 수준 | — |
| `bg-indigo-950/20` | `bg-primary/[.05]` | 0.71 |
| `bg-indigo-900/40` · `/60` | `bg-primary/[.21]` · `/[.33]` | 2.92 · 5.28 ⚠️ |
| `shadow-indigo-600/10` | `shadow-primary/[.11]` | **1.97** ✅ |

⚠️ **`bg-indigo-900/40·/60` 2곳만 ΔE 가 크다**(`MindView.tsx:144` 핀 버튼). 알파로 못 맞춘다 —
`indigo-900` 이 `primary`(indigo-500)와 색상각이 다르다. **이 2곳은 T3 에서 마지막에 처리하고 보고할 것.**
필요하면 `--accent-deep-rgb` 를 되살리는 것이 답일 수 있다(구 `#7c3aed`가 아니라 `indigo-900 #312e81` 값으로).

> **변형 접두사를 빠뜨리지 말 것** — `border-l-`·`hover:`·`focus:`·`shadow-` 가 붙어도 색 계열은 같다.
> T3a 에서 `border-l-*` 7곳이 집계에서 누락됐다.

### 5.2 왜 hue 하나로 합치지 않았나 — **기록**

한 뱃지가 `text-teal-400` + `bg-teal-500/20` 을 함께 쓰는 것을 Tailwind 관용으로 보고
**hue 토큰 하나로 합치려 했다.** RGB 채널 차이가 1~14 단위라 「감지 불가」로 판단했다.

**틀렸다.** ΔE 로 재니 **2.76~10.40** 이다(purple 이 최악). 알파를 ΔE 기준으로 최적화해도
node3·4·5 는 3.35~9.72 로 못 맞춘다 — **밝기가 아니라 색상각이 다르기 때문**이다.

**교훈: RGB 채널 거리는 색 근접성의 척도가 아니다.** 명도대비(WCAG)도 아니다 —
그건 텍스트 가독성 지표이고 어두운 색끼리는 1.0x 로 뭉개진다. **ΔE 로 판정한다.**

### T1d — **토큰 재편 (32 → 35)** ← 단독 커밋. 화면이 바뀌는 유일한 사전 단계

> ### ⚠️ 이력 — 실행 중에 사양이 바뀌었다. 그래서 두 커밋이다
>
> **T1d (`2eea1d9` + rename `9390b61`) 는 폐기된 26개 안으로 착지했다.** 착수 승인과 ΔE 재판정이
> 몇 분 차이로 겹쳐 메시지가 엇갈렸다 — **실행 세션 잘못이 아니라 계획 측(이 문서) 잘못이다.**
>
> **되돌리지 않는다. `T1d-2` 로 전진 수정한다** — 토큰 정의 층이라 추가+재지정으로 끝나고,
> revert 보다 diff 가 깨끗하다.
>
> **T1d-2 가 되돌려야 할 병합 3건** (ΔE 로 철회된 것들):
>
> | 잘못 적용된 병합 | ΔE | 복원 |
> |---|---|---|
> | `surface-4+5` — 코드펜스 `#1a1b26`→`#1d1f30` | 4.71 | `--surface-code-rgb: 26 27 38` 신설 |
> | `text-0+1` — **H1 `#f1f5f9`→`#e2e8f0`** | 5.08 | `--text-title-rgb: 241 245 249` 신설 |
> | `text-5→border-strong` — `.cm-hr-line` `#334155`→`#3a3f52` | 3.28 | `--divider-rgb: 51 65 85` 신설 |
>
> **추가로 신설**: `--highlight-bg-rgb: 234 179 8` · `--node-{1..5}-tint-rgb`(구 `-500` 값)
>
> **소비처 재지정 4곳**: `index.css:131` `.rv-content h1` · `:304` `.cm-heading` → `--text-title-rgb` ·
> `:351` `.cm-hr-line` → `--divider-rgb` · `MindView.tsx:539` `text-strong` → `text-title`
> (원본이 `text-slate-100`. **`:134` 는 원본이 `text-slate-200` 이라 `text-strong` 이 맞다 — 건드리지 말 것**)
>
> **교훈**: 착수 승인을 보낸 뒤에는 사양을 바꾸지 않는다. 바꿔야 하면 **다음 단계로 미룬다.**

**파일**: `src/app/styles/index.css`(`:root`) · `tailwind.config.js` · `src/app/styles/erd.css`

§4 의 26개 스케일로 `:root` 를 다시 쓰고, Tailwind 색 이름을 새 토큰에 맞춘다.
`erd.css` 별칭 8줄도 새 토큰명으로 갱신하고, 이때 **`--text-on-accent` → `--text-error` 로 개명**한다
(이름만 보고 accent 계열로 매핑하면 에러 알림 글자가 보라색이 된다. 소비자는 `erd.css:60` 한 곳뿐).

기존 6색 Tailwind 이름(`darkBg`·`darkPanel`·`darkBorder`·`primary`·`accent`·`mutedText`)은
**그대로 유지**한다 — 사용처 259~266곳이 무수정으로 남는다. 가리키는 토큰만 바꾼다:

```js
// tailwind.config.js — theme.extend.colors 전체. 토큰 35개 ↔ 키 35개, 1:1 이다.
//
// 명명 규칙: **레거시 이름이 있으면 그것이 정본이다.** 같은 토큰에 새 키를 덧붙이지 않는다
// (한 색에 두 이름이 생기는 것이 이 저장소가 반복해 온 A1 계열 결함이다).
// 레거시 6개는 사용처 259~266곳을 무수정으로 남긴다 — 가리키는 토큰만 바꾼다.
colors: {
  // ── 레거시 6개 (이름 유지) ──────────────────────────────
  darkBg:     'rgb(var(--surface-base-rgb) / <alpha-value>)',
  darkPanel:  'rgb(var(--surface-panel-rgb) / <alpha-value>)',
  darkBorder: 'rgb(var(--border-rgb) / <alpha-value>)',
  primary:    'rgb(var(--accent-rgb) / <alpha-value>)',      // ← indigo. 팔레트 치환도 이 이름을 쓴다
  accent:     'rgb(var(--accent-alt-rgb) / <alpha-value>)',  // ← teal. 사용처 1곳이지만 이름을 뺏지 않는다
  mutedText:  'rgb(var(--text-muted-rgb) / <alpha-value>)',  // ← 텍스트 muted 단의 정본 이름

  // ── 표면 (레거시가 base·panel 을 덮으므로 2개만 신규) ──
  code:   'rgb(var(--surface-code-rgb) / <alpha-value>)',
  raised: 'rgb(var(--surface-raised-rgb) / <alpha-value>)',

  // ── 텍스트 (mutedText 는 레거시로 이미 있음) ────────────
  title:  'rgb(var(--text-title-rgb) / <alpha-value>)',
  strong: 'rgb(var(--text-strong-rgb) / <alpha-value>)',
  body:   'rgb(var(--text-body-rgb) / <alpha-value>)',
  faint:  'rgb(var(--text-faint-rgb) / <alpha-value>)',
  divider:'rgb(var(--divider-rgb) / <alpha-value>)',

  // ── 테두리 (darkBorder 는 레거시) ───────────────────────
  borderStrong: 'rgb(var(--border-strong-rgb) / <alpha-value>)',

  // ── 강조 (primary·accent 는 레거시) ─────────────────────
  accentSoft:   'rgb(var(--accent-soft-rgb) / <alpha-value>)',
  accentSubtle: 'rgb(var(--accent-subtle-rgb) / <alpha-value>)',

  // ── 의미색 ──────────────────────────────────────────────
  danger:      'rgb(var(--danger-rgb) / <alpha-value>)',
  dangerBg:    'rgb(var(--danger-bg-rgb) / <alpha-value>)',
  warning:     'rgb(var(--warning-rgb) / <alpha-value>)',
  info:        'rgb(var(--info-rgb) / <alpha-value>)',
  highlight:   'rgb(var(--highlight-rgb) / <alpha-value>)',
  highlightBg: 'rgb(var(--highlight-bg-rgb) / <alpha-value>)',
  magenta:     'rgb(var(--magenta-rgb) / <alpha-value>)',

  // ── 노드 hue 5 + tint 5 ─────────────────────────────────
  node1: 'rgb(var(--node-1-rgb) / <alpha-value>)',
  node2: 'rgb(var(--node-2-rgb) / <alpha-value>)',
  node3: 'rgb(var(--node-3-rgb) / <alpha-value>)',
  node4: 'rgb(var(--node-4-rgb) / <alpha-value>)',
  node5: 'rgb(var(--node-5-rgb) / <alpha-value>)',
  node1Tint: 'rgb(var(--node-1-tint-rgb) / <alpha-value>)',
  node2Tint: 'rgb(var(--node-2-tint-rgb) / <alpha-value>)',
  node3Tint: 'rgb(var(--node-3-tint-rgb) / <alpha-value>)',
  node4Tint: 'rgb(var(--node-4-tint-rgb) / <alpha-value>)',
  node5Tint: 'rgb(var(--node-5-tint-rgb) / <alpha-value>)',

  // ── 오버레이 ────────────────────────────────────────────
  overlay: 'rgb(var(--overlay-rgb) / <alpha-value>)',
  scrim:   'rgb(var(--scrim-rgb) / <alpha-value>)',
}
```

> ⚠️ **`accent` 는 teal 이다. indigo 가 아니다.** 레거시 `accent`(`#14b8a6`, 사용처 1곳)가
> 그 이름을 이미 쓰고 있으므로, indigo 강조의 Tailwind 이름은 **`primary`** 다(사용처 87곳).
> §5 매핑표의 `bg-indigo-500/N` → **`bg-primary/N`** 인 이유다.
> JS 객체는 같은 키를 두 번 가질 수 없어, 새로 `accent` 키를 만들면 **나중에 쓴 쪽이 조용히 이긴다.**
>
> **텍스트 단의 클래스 이름이 한 군데 어긋난다** — `text-strong` · `text-body` · **`text-mutedText`** · `text-faint`.
> muted 만 레거시 이름인데, 45곳을 고치지 않으려는 의도적 선택이다. 통일하려면 별건으로 정리한다.
> **같은 토큰에 `muted` 키를 추가하지 말 것** — 그 순간 한 색에 두 이름이 생긴다.

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
| YAML 파서 · 테마 파일 스캔 | R5-b (출시 후) — **아래 ⚠️ 를 반드시 이어받을 것** |
| `staticRenderer.ts` | §3.2 |
| `.cm-line *` 위젯 타이포그래피 | **R7 / P1-9 — 별도 티켓.** 사양서 기존재 |

---

## 11. ⚠️ R5-b 로 넘기는 미완 요구 — **작성자 표면은 35개가 아니다**

> **이 절은 R5-a 의 작업 항목이 아니다. R5-b(YAML 커스텀 테마) 착수 시 반드시 먼저 읽을 것.**

사용자 지시(2026-09-09)의 원문은 **「토큰을 너무 세세하게 나누지 말라. 필요한 것만 나눠 재사용하라.
세분화가 지나치면 테마 통일성이 떨어진다」**였고, 그 대상은 **커스텀 테마 작성자가 마주하는 표면**이다
(PM `D18` 로 층위 확정). **구현 내부 스케일이 아니다.**

R5-a 의 **35개는 내부 스케일**이다. 코드가 참조하는 값이고, ΔE 로 「실제로 다른 색인가」를 판정해
정해졌으므로 줄일 수 없다.

**그러나 이 35개를 YAML 에 그대로 노출하면 사용자 지시가 미충족이다.**
테마 작성자가 35개를 손으로 정하면 통일성이 무너진다 — 지시가 정확히 그것을 막으려던 것이다.

**R5-b 가 설계해야 할 것**: 작성자가 정하는 값은 소수(예: 배경·전경·강조 몇 개)로 두고,
**내부 35개를 거기서 파생**시킨다. 파생 규칙(명도 단계·알파 사다리·hue 유지)은 R5-b 의 설계 사항이다.

**R5-a 에서 할 일은 없다.** 지금 파생 구조를 짓지 않는다. 다만 **나중에 그렇게 갈 수 있는 것을 막지만
않으면 된다** — 현재 구조는 토큰이 전부 `--*-rgb` 채널 트리플릿이라 파생 계층을 위에 얹기 쉽다.
