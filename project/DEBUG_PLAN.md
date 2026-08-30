# DEBUG_PLAN.md — Step 1~3 배치 (보안 경계 마감 · 입력 안정성 · 불변식)

> **대상**: `project/` (Devoras `v0.8.32`) · 브랜치 `fix/vertical-motion-and-verification-tier`
> **상위 인덱스**: [`DEBUG_STEP_PLAN.md`](../DEBUG_STEP_PLAN.md) §2 Step 1 · Step 2 · Step 3
> **입력 문서**: [`code_review.md`](../code_review.md) · [`ARCHITECTURE_FINDINGS.md`](../ARCHITECTURE_FINDINGS.md) · [`implementation_plan.md`](../implementation_plan.md)
> **직전 배치**: B2 보안 L1·L4-deny·L3·L2 — 착지(v0.8.28~0.8.31), [`claude-history/debug/DEBUG_PLAN_20260830_141903.md`](../claude-history/debug/DEBUG_PLAN_20260830_141903.md)
> **성격**: 상호 **독립·병렬 가능한 3개 Step 의 실행 사양.** 신규 조사가 아니라 이미 원인까지 특정된 항목의 착지.

---

## 0. 한 줄 요약

- **Step 1** — B2 의 마지막 조각. `assetProtocol.scope.allow: ["**"]` 가 살아 있는 한 deny 목록은 경계가 아니라 완화책이다. 여기에 사람 손이 필요한 실기 검증 4건이 묶여 있다.
- **Step 2** — 키 입력 1회당 `onUpdate` 가 2회 발화하고, Backspace 병합이 H5/H6 마크를 남기며 포커스를 잃는다.
- **Step 3** — 게이트가 **최종 증상만** 본다. 중간 불변식을 심어 다음 회귀를 한 번의 측정으로 잡는다.

셋은 서로 파일이 겹치지 않는다. **병렬 착수 가능하나 커밋은 분리한다.**

---

## 1. 실행 순서 & 게이트

```
Step 1  B2 잔여 (tauri.conf.json · capabilities)  ─┐
Step 2  B3 입력 (BlockEditor.tsx · block/store.ts) ├─ 독립 · 병렬 가능
Step 3  A5 불변식 (개발 빌드 전용 단언)            ─┘
```

| 순서 | 작업 | 게이트 | 커밋 |
|---|---|---|---|
| 1 | ✅ **Step 2-A** `domEventHandlers.input` 제거 | `pnpm test:ime` 5/5 수정 전후 동일 | `dd52e32` fix(0.8.33) |
| 2 | ✅ **Step 2-B** 병합 regex `#{1,6}` + 위치 기반 포커스 재조회 | H1~H6 병합 잔여 0 확인(스크립트 검증) | `2ec8a85` fix(0.8.34) |
| 3 | ✅ **Step 3** R3 불변식 (2-B 와 같은 커밋) | DEV 가드 확인(빌드 후 grep 0건) | `2ec8a85` 에 동봉 |
| 4 | 🔶 **Step 1-A** `allow: ["**"]` 축소 (PoC 결과에 따름) | S4(3단 분해판)·R7 재실측 — 진행 중, 아래 §2-A 실행 메모 참고 | 커밋 대기(동시 작업 세션과 Cargo.lock 충돌 회피 중) |
| 5 | ⛔ **Step 1-B** 실기 검증 4건 | 아래 §2-B 표 전부 ✅ | 사람 손 + 별도 세션(project-b9) 의 MCP 브리지로 진행 중 |

**Step 3 을 Step 2-B 와 같은 커밋에 넣는 이유**: 2-B 의 DoD 가 정확히 R3 불변식이기 때문이다. 단언을 먼저 심고 고치면 수정의 정당성이 계측으로 남는다.

---

## 2. Step 1 — B2 잔여: 보안 경계 마감

> 배치 B2 의 마지막 조각. **구현은 끝났고 범위 축소 1건 + 실기 검증 4건**이 남았다.

### 2-A. L4-scope — `allow: ["**"]` 제거 (미착수)

**[파일 & 라인]** `project/src-tauri/tauri.conf.json` (`app.security.assetProtocol.scope`) · `project/src-tauri/capabilities/default.json`

**[현재 상태]**

```json
"scope": {
  "allow": ["**"],
  "deny": ["$HOME/.ssh/**", "$HOME/.aws/**", "$HOME/.gnupg/**", "$HOME/.config/**", "$HOME/.env*"]
}
```

**[근본 원인]** deny 는 **열거된 것만** 막는다. `allow` 가 `"**"` 인 한 열거되지 않은 경로(`~/Documents/**` 등)는 그대로 읽힌다. **deny 는 완화책이지 경계가 아니다.**

**[조치 방안]**

1. `allow` 를 **워크스페이스 루트 기준**으로 좁힌다. L3 에서 도입한 Rust `WorkspaceRoot` 상태가 이미 있으므로 **런타임 scope 갱신 경로를 함께 검토**한다.
   - PoC: `asset_protocol_scope().allow_directory()` / `fs_scope().allow_directory()` 로 워크스페이스 선택 시 동적 허용이 성립하는지.
   - 성립하면 `"**"` 자체를 제거. 불성립이면 deny 목록 + L3 에 의존하고 **강도 하락을 문서에 명시**한다.
2. `capabilities/default.json` 의 **`fs:allow-home-read-recursive` / `fs:allow-home-write-recursive` 2건**도 이 단계 대상이다.
   - L4-deny 커밋(v0.8.29)이 제거한 8건은 desktop/document/download 6건 + `dialog:allow-message` + `shell:allow-open` 이었고 **home 재귀는 남아 있다.**
3. `requireLiteralLeadingDot: false` **유지** — 아래 §5-1.

**[PoC 결과 — 2026-08-30, Tauri 2.11.5 / tauri-plugin-fs 2.5.1 소스 레벨 확인]**

`tauri::scope::fs::Scope` (asset protocol 과 `tauri_plugin_fs::FsExt::fs_scope()` 가 **같은 타입**을 공유) 를 직접 읽었다:

- `allow_directory()` / `forbid_directory()` 는 **성립한다** — 워크스페이스 오픈 시 동적 허용이 실제로 동작.
- 단 `allowed_patterns`/`forbidden_patterns` 는 **append-only** — 제거 API 가 없다. `forbid_directory()` 는 있지만 "이후 access 는 **항상** 거부"(주석 원문)이므로, 한 번 forbid 하면 나중에 같은 경로를 다시 열어도 forbidden 이 우선해 영구히 막힌다.
- 따라서 "이전 워크스페이스를 막고 새 워크스페이스만 연다"는 전략은 불가능하다. 실질적으로 가능한 것은 **"막지 않고 계속 추가만"** — 세션 동안 연 모든 워크스페이스 루트의 합집합이 허용 상태로 남는다. 이는 여전히 `"**"` 대비 압도적으로 좁고, deny 목록은 이 허용보다 항상 우선한다(코드 확인: `is_allowed` 가 forbidden 을 먼저 검사).
- **판정: 성립.** `"**"` 제거 + `devoras_set_workspace_root` 안에서 `asset_protocol_scope().allow_directory(&root, true)` / `fs_scope().allow_directory(&root, true)` 동적 허용으로 전환. "워크스페이스 전환 시 이전 루트가 계속 허용된다"는 잔여 리스크는 **append-only API 의 구조적 한계**로 이번 배치에서 해소 불가 — §5 에 위험으로 명시.
- **부수 발견**: `openWorkspace`/`openWorkspaceByPath`(`project/src/entities/workspace/model/store.ts`) 가 `setWorkspaceRoot` 를 fire-and-forget 하거나 `readDirectory` 보다 뒤에 호출하고 있어, scope 축소 이후 첫 워크스페이스 오픈이 레이스로 실패할 수 있었다. `await` 로 순서를 강제하도록 **함께 수정**했다(R1/R6 회귀 방지, `"**"` 축소의 필수 동반 조건).
- **S4 판정 기준 보정**(project-b1 지적): `allow: []` 로 바뀌면 "asset://…/.ssh/id_rsa → 403" 단일 검사는 **공허하게 통과**한다(deny 목록이 없어도 애초에 아무것도 allow 되지 않으므로 403). 아래 §2-B 표를 3단으로 분해해 실제로 scope 가 좁혀졌음을 증명하도록 갱신했다.

**[Edge Cases & Guards]**

- **워크스페이스 전환 시 scope 재설정 타이밍.** 이전 워크스페이스 경로가 살아 있으면 축소의 의미가 없다.
- **`.devoras/images` 최초 생성 경로**(L3 의 `ensure_inside` 조상 탐색 일반화가 다루는 케이스)가 scope 축소로 다시 깨지지 않는지.

**[DoD]** **PoC 1시간 선행** 후 판단. **이미지 렌더링 회귀 0건이 절대 조건.**

### 2-B. T3 실기 검증 잔여

| # | 항목 | 상태 | 막힌 이유 |
|---|---|---|---|
| S4-1 | 워크스페이스 내부 자산 → 200 (`allow_directory` 발동 증명) | ✅ **실측 완료(2026-08-30)** | project-b9, `pnpm tauri dev` 실기(CLI 워처가 Step 1-A 저장 감지해 자동 재빌드) |
| S4-2 | 워크스페이스 **외부**·deny 목록 **밖** 경로(`~/Documents/probe`) → 403 (scope 가 실제로 좁혀졌다는 유일한 증거) | ✅ **실측 완료** | 〃 |
| S4-3 | `~/.ssh/known_hosts` → 403 (deny 가 append-only allow 보다 우선) | ✅ **실측 완료** | 〃 |
| R7 | `.devoras/images` Write/Read 양쪽 렌더 (`tauri_t3_harness.ts` 기존 자동 게이트) | ❌ 미실행 | 사람 손 또는 다음 실기 세션 |
| S5 | 번들 앱에서 이미지·코드블록 육안 확인 | ❌ | OS 권한(Accessibility·Screen Recording) — 사람 손 필요 |
| S5 | `pnpm tauri build` 후 HMR 무관 정상 동작 | ❌ | 〃 |
| S2 | 콘솔 CSP 위반 로그 0건 | ✅ **실측 완료** | project-b9, 동일 세션 — 위반 로그 0건 확인. **주의**: devCsp 기준(플러그인 기반 브리지는 프로덕션 CSP 를 바꾸지 않음) — 프로덕션 CSP 자체 확인은 아래로 이월 |
| S2 | 네트워크 요청 0건 | ⚠️ **불확정** | Performance API 로 확인 시도했으나 커스텀 프로토콜(`asset://`)이 Resource Timing 에 안 잡혀 확정 증거 없음. 사람 손 또는 다른 계측 필요 |

**S4 는 원래 단일 검사(403 실측)였으나 §2-A PoC 로 공허 통과 문제가 드러나 3단으로 분해했고, project-b9 가 실제 Step 1-A 코드(작업 트리, `allow: []` + `devoras_set_workspace_root` 동적 허용)를 대상으로 200/403/403 을 실측해 scope 축소가 실질적으로 동작함을 확인했다.** 자산 asset URL 스킴 실측값: `asset://localhost/<encoded-path>`. 남은 항목(R7, S5 2건, S2 네트워크 0건, 프로덕션 CSP)은 여전히 사람 손(번들 빌드 + 육안) 또는 별도 계측이 필요.

**[DoD]** 위 8건 실측(5/8 완료) + `pnpm test:sanitizer` 14/14 + `cargo test` 6/6 유지.

---

## 3. Step 2 — B3 입력 안정성 (실질 2건)

> **원 정의**: [`DEBUG_PLAN_20260827_025711.md`](../claude-history/debug/DEBUG_PLAN_20260827_025711.md) §2 — 티켓 `BUG-08 → BUG-11, BUG-09, BUG-10` · 선행 `B1` · 게이트 `IME 하네스 회귀 0건`
> **선행 조건 충족**: B1 종결. 원래의 순서 제약 `BUG-08 → BUG-11`(키 충돌 해소 선행)은 **BUG-08 이 G0 로 이미 해소**되어 만족된 상태다.

### 3-0. 코드 대조 결과 — 4건 중 2건은 이미 소멸

| 티켓 | 계획 내용 | 2026-08-30 실태 |
|---|---|---|
| BUG-20260826-08 비헤딩 블록 키 충돌 | 위치 기반 키 | ✅ **해소** — G0 가 `${parentId}-textblock-${index}` 로 전환 (`project/src/entities/block/model/store.ts:60-65`) |
| BUG-20260826-10 활성 뷰 포인터 null | 소유권 가드 | ✅ **구조적 소멸** — 전역 싱글턴이 `project/src/shared/lib/editorViewRegistry.ts` 로 교체. `unregisterEditorView` 가 `caretHolder.get(paneId) === blockId` 일 때만 정리하므로 무관한 블록 파괴가 포인터를 비우지 않는다 |
| **BUG-20260826-09** 입력당 `onUpdate` 2회 | `domEventHandlers.input` 제거 | ❌ **잔존** |
| **BUG-20260826-11** 병합 regex + 포커스 복원 | `#{1,6}` + 재생성 후 재조회 | ❌ **잔존** |

### 3-A. BUG-20260826-09 — 키 입력 1회당 `onUpdate` 2회 호출 *(= code_review P1-5)*

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:199-208`(`domEventHandlers.input`) · `:209-227`(`updateListener`)

**[근본 원인]** 일반 타이핑에 대해 **둘 다 발화**하며 각각 `callbacksRef.current.onUpdate` 를 호출한다. `setDirty`·`findOldContent`·`countHeadings`·`updateBlockContent` 가 **문자당 두 번** 실행되고 150ms 디바운스도 두 번 재설정된다.

**[조치 방안]** `domEventHandlers.input` 핸들러를 **삭제**한다. `updateListener` 가 상위 호환이다 —

| | `input` 핸들러 | `updateListener` |
|---|---|---|
| IME 가드 | `inputEvent.isComposing` 만 | `isImeComposingRef.current` + `update.view.composing` **이중** |
| 외부 트랜잭션 필터 | 없음 | `tr.annotation(Transaction.userEvent) === 'external'` 배제 |
| 문서 변경 판정 | 없음 | `update.docChanged` |

**[Edge Cases & Guards]** 이 수정은 **한글 입력 경로를 직접 건드린다. R3(한글 연속 입력)이 이번 배치의 핵심 위험 지점이다.** `pnpm test:ime` 를 수정 **전후로 각각** 돌려 비교할 것.

**[DoD]** 타이핑 1회당 `onUpdate` **정확히 1회**(계측) · `pnpm test:ime` 회귀 0건 · R3 수동 확인.

### 3-B. BUG-20260826-11 — 병합 regex 및 포커스 복원 *(= code_review P1-7)*

**[파일 & 라인]** `project/src/entities/block/model/store.ts:215` · `:230-233`

**[근본 원인 — 두 갈래]**

1. `parseHeadingLine` 은 `#{1,6}` 을 인식하는데 `cleanedCurrentText` 는 `replace(/^#{1,4}\s*/, '')` 다. **H5/H6 블록을 병합하면 `##### ` 리터럴이 본문에 남는다.**
2. 더 심각한 쪽은 **순서**다. `setBlocksFromContent(fullText)` 로 트리를 **재생성한 뒤** `set({ activeBlockId: previousBlock.id })` 를 실행한다. 재생성에서 새 `id` 가 부여되면 그 ID 는 더 이상 존재하지 않고, **Backspace 병합 직후 포커스가 사라진다.**

**[조치 방안]**

```typescript
const cleanedCurrentText = currentBlock.content.replace(/^#{1,6}\s*/, '');
// ...
get().setBlocksFromContent(fullText, get().ownerTabId ?? undefined);
const rebuilt = flattenTree(get().blocks);           // 재생성 후 "위치"로 해석
set({ activeBlockId: rebuilt[index - 1]?.id ?? null, focusOffset });
```

**[Step 4(A7) 와의 관계]** 비헤딩 블록은 G0 로 안정됐지만 **헤딩 블록의 id 는 아직 라벨에서 파생된다**(`project/src/entities/block/model/store.ts:66` `buildHeadingId(parsed.label, …)` — A7). 따라서 헤딩을 병합하면 재생성 시 id 가 바뀔 수 있고, 위 "위치로 재조회" 패치는 **A7 의 부분 완화**이기도 하다. **근본 해소는 Step 4** — 본 배치의 범위가 아니다.

**[DoD]** H1~H6 각각 병합 시 **헤딩 마크 잔여 0건** · 병합 직후 캐럿이 병합 지점에 존재 · §4 의 R3 불변식 단언이 발화하지 않을 것.

---

## 4. Step 3 — A5 중간 불변식 심기 (비용 거의 0, 회수 큼)

> **근거**: [`ARCHITECTURE_FINDINGS.md`](../ARCHITECTURE_FINDINGS.md) A5 — 게이트가 **최종 증상만** 관측한다. §9.6 은 T3 실기 한 세션을 통째로 쓰고도 원인에 도달하지 못했고, **같은 버그가 `drift` 라는 중간량을 재자 한 번의 측정으로 풀렸다.**

개발 빌드 전용 런타임 단언을 게이트마다 하나씩 붙인다.

| 최종 증상 게이트 | 붙일 중간 불변식 | 상태 |
|---|---|---|
| R10 수직 이동 델타 ±1 | `drift === 0` | ✅ 적용 완료 |
| **R3 병합 후 캐럿 유지** | **`store.focusOffset === view.selection.main.head`** | ❌ **이번 대상.** 이것만 있었으면 BUG-20260828-02 는 즉시 드러났다 |
| B1 dirty 표시 | `isDirty === (내용 !== 디스크 내용)` | ❌ 저장 **이후**를 보는 케이스가 없어 결함이 숨어 있었다 |
| V3/V4/V6 스크롤 0px | `scrollHeight > clientHeight` (컨테이너가 실제로 넘치는가) | ❌ 아니면 0px 가 공허하게 통과한다 |
| V1~V4 scrollTop 0px | 프레임 간 `block.top` 변화량 = 0 | ❌ |
| G1 캐럿 안정성 | 뷰 인스턴스 동일성(리마운트 0회) | ❌ |

**[우선순위]** **R3 를 먼저 심는다** — Step 3-B 의 DoD 이자 이번 배치에서 즉시 회수되는 유일한 항목이다. 나머지는 해당 게이트를 다음에 건드릴 때 함께 심는다.

**[Edge Cases & Guards]**

- **프로덕션 빌드에서 배제될 것** — `import.meta.env.DEV` 가드.
- **단언 실패는 throw 가 아니라 `console.error` + 스택**으로 남겨 **편집을 중단시키지 않을 것.**

---

## 5. 위험 및 주의

1. **`requireLiteralLeadingDot: false` 를 되돌리지 말 것.** `.devoras/` 이미지 렌더링의 전제조건이며, **Step 1 의 scope 축소에서 가장 흔한 회귀 경로**다. dot 파일 차단은 deny 목록으로 한다.
2. **`tauri.conf.json` 은 컴파일 타임에 바이너리로 인라인된다.** 설정만 바꾸고 dev 로 확인하면 반영되지 않은 것을 통과로 오인한다. **반드시 재빌드 후 검증.**
3. **Step 2-A 는 한글 IME 경로다.** `pnpm test:ime` 전후 비교 없이 커밋하지 말 것.
4. **`ownerTabId` 는 일회용 스캐폴딩이다.** Step 7 의 탭 스코프 스토어 완성 시 소멸시킨다. 3-B 의 `get().ownerTabId` 사용은 그때까지의 잠정 형태다.
5. **커밋을 합치지 말 것.** Step 1 과 Step 2 는 회귀 시 원인 분리가 가능해야 한다.

---

## 6. 검증 티어와 공통 회귀

### 6.1 티어

| 티어 | 수단 | 실행 |
|---|---|---|
| **T1** 순수 로직 | Node 24 + `scripts/ts-hook.mjs`(`@/` 별칭·확장자 해석) | `pnpm test:t1` (8 하네스) |
| **T2** 레이아웃 | `MockFileSystem` 덕에 앱이 Chromium 에서 그대로 구동 | `pnpm dev` + playwright |
| **T3** 실기 | 설정 변경 없이 콘솔 한 줄 | `pnpm tauri:dev` → `tauri_t3_harness.ts` |

> **런타임 고정**: Node 24 LTS(`.nvmrc`, `engines`). 새 환경은 `nvm use` 로 시작한다. T1 은 이전까지 **한 번도 실행 가능한 적이 없었다**(Node 20 에 없는 플래그).

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

### 6.2 배치 종료 시 공통 회귀

| # | 항목 | 기준 |
|---|---|---|
| R1 | 문서 열기 → 편집 → `Cmd+S` | 디스크 반영 및 dirty 해제 |
| R2 | 탭 3개 전환 왕복 | 각 탭 내용 유지, 교차 오염 0건 |
| **R3** | **한글 연속 입력** | **조합 끊김 · 텍스트 증식 0건** (Step 2-A 의 핵심 위험) |
| **R4** | **`.devoras/images` 이미지** | **Read/Write 양쪽 렌더링** (0.8.5 회귀 방지 — Step 1 의 핵심 위험) |
| R5 | 좌우 분할 후 패널 닫기 | 탭 병합 정상, 최소 1패널 유지 |
| R6 | 워크스페이스 전환 | 이전 문서 내용 잔존 0건 |

### 6.3 커밋 규칙

`.agents/AGENTS.md` 를 따른다. 코드 변경 커밋은 **커밋 전 패치 버전업**(`project/package.json` · `project/src-tauri/Cargo.toml` · `project/src-tauri/tauri.conf.json` + `Cargo.lock` 동시 갱신). **문서만 변경한 커밋은 버전을 올리지 않는다.** **티켓 1건 = 커밋 1건**을 원칙으로 하고 커밋 메시지에 티켓 ID 를 포함한다.

```
fix(0.8.33): 입력당 onUpdate 이중 호출 제거 (BUG-20260826-09)
```

---

## 7. DoD (배치 종료 조건)

**Step 1**

- [x] **1-A** `allow` PoC 결과 판정 완료 — **성립.** `"**"` 제거 + `devoras_set_workspace_root` 동적 allow_directory 로 전환(코드 반영, 커밋 대기 — 동시 세션과 Cargo.lock 충돌 회피 중)
- [x] **1-A** `fs:allow-home-{read,write}-recursive` 2건 처리 — `capabilities/default.json` 에서 제거
- [x] **1-A** `requireLiteralLeadingDot: false` 유지 확인
- [ ] **1-B** S4-1/S4-2/S4-3 3단 실측 (§2-B) — project-b9 진행 중
- [ ] **1-B** R7 `.devoras/images` 렌더 자동 게이트 재실행 (`tauri_t3_harness.ts`)
- [ ] **1-B** S5 번들 앱 이미지·코드블록 육안 확인 + `pnpm tauri build` 후 정상 동작 — 사람 손 필요
- [ ] **1-B** S2 콘솔 CSP 위반 로그 확인 + 네트워크 요청 0건 (프로덕션 CSP 기준) — 사람 손 필요
- [ ] `pnpm test:sanitizer` 14/14 · `cargo test` 6/6 유지 (Step 1 커밋 시점 기준으로 재확인 필요)

**Step 2**

- [x] **2-A** 타이핑 1회당 `onUpdate` 정확히 1회 (코드상 `domEventHandlers.input` 제거로 구조적 보장 — `updateListener` 만 남음)
- [x] **2-A** `pnpm test:ime` 수정 전후 비교, 회귀 0건 (5/5 = 5/5)
- [x] **2-B** H1~H6 각각 병합 시 헤딩 마크 잔여 0건 (스크립트 검증 완료)
- [x] **2-B** 병합 직후 캐럿이 병합 지점에 존재 (activeBlockId 위치 기반 재조회로 검증)

**Step 3**

- [x] R3 불변식(`store.focusOffset === view.selection.main.head`) 적용
- [x] `import.meta.env.DEV` 가드 확인 — 프로덕션 번들 grep 0건으로 확인
- [x] 단언 실패가 `console.error` 로만 남고 편집을 중단하지 않음

**공통**

- [ ] §6.2 R1~R6 전부 통과

---

## 8. 다음 단계 (본 배치 범위 밖)

| Step | 내용 | 착수 조건 |
|---|---|---|
| **Step 4** | A7 헤딩 정체성 분리 — 남은 구조 결함 중 **유일하게 데이터(undo) 손실** | Step 2-B 착지 후 |
| **Step 5** | A1/A2 뷰↔스토어 조정자 일원화 + diff 동기화 | Step 4 후 |
| **Step 6** | A6 마운트 비용 프로파일 → **가상화/스택 재검토 판정 게이트** | Step 5 후 |
| **Step 7** | B4 구조 개편 (P0-3 Stage A-2 → Stage B 탭 스코프 스토어) | Step 6 판정 후 |

> 본 배치 종료 시 [`DEBUG_STEP_PLAN.md`](../DEBUG_STEP_PLAN.md) 의 해당 Step 을 §1 완료 요약으로 내리고, 본 문서는 `claude-history/debug/DEBUG_PLAN_[datetime].md` 로 아카이브한 뒤 다음 Step 사양으로 교체한다.
