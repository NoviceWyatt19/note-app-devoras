# IMPL_PLAN 20260909 — R3 출시 엔지니어링 E2(CI) → E1(Releases)

> **수행 주체**: `Impl_worker_v1`
> **작성 주체**: `Impl_Manager_v1` — 계획·검증. 코드 수정 없음
> **티켓**: `REL-20260904-01` (`ticket/project/20260904_1840_release_engineering.yml`)
> **기준**: `dc8e000` · v0.9.27 · 원격 `git@github.com:NoviceWyatt19/note-app-devoras.git`

수치는 전부 2026-09-09 에 직접 실행해 얻은 것이다.

---

## 1. 착수 전에 알아야 할 것 — **`lint` 는 지금 실패한다**

```
pnpm lint  →  ✖ 124 problems (111 errors, 13 warnings)
```

| 규칙 | 건수 |
|---|---|
| `@typescript-eslint/no-explicit-any` | 50 |
| `react-hooks/exhaustive-deps` | 9 |
| `react-refresh/only-export-components` | 4 |
| `@typescript-eslint/no-unused-vars` | 4 |
| `@typescript-eslint/ban-ts-comment` | 1 |

제품 코드와 하네스에 **고루 퍼져 있다**(`decorators/impl` 13 · `BlockEditor/__tests__` 8 · `document/__tests__` 6 …).

> **`lint` 를 차단 게이트로 넣으면 CI 가 첫날부터 빨간불이다.** 그러면 아무도 안 본다 —
> 「하네스가 사람 기억에 의존하는 상태를 끊는다」는 목적이 **정확히 반대로** 달성된다.
> **빨간 CI 는 CI 가 없는 것보다 나쁘다.** 없으면 사람이 기억이라도 하지만, 상시 빨간불은
> 「원래 빨간 거」가 되어 **진짜 실패를 가린다.**

**나머지 게이트는 전부 통과한다** (직접 실행 확인):

| 게이트 | 결과 |
|---|---|
| `pnpm exec tsc --noEmit` | ✅ exit 0 |
| `pnpm test:t1` | ✅ 92/92 |
| `pnpm test:t15` | ✅ 16/16 |

**→ 처방: 통과하는 것은 차단 게이트로, `lint` 는 기준선 비교(비차단)로 넣는다.** §3.3

---

## 2. 구조 — `.github/` 는 **저장소 루트**다

```
Devoras/                 ← git 저장소 루트. .github/ 는 여기
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
└── project/             ← 앱 루트(package.json). 모든 job 의 working-directory
```

**흔한 실수**: `project/.github/` 에 두면 GitHub 이 인식하지 않는다.

### 2.1 pnpm 버전이 고정돼 있지 않다 — 먼저 막을 것

`package.json` 에 **`packageManager` 필드가 없다.** `engines` 는 `pnpm >=10` 뿐이라 CI 가 그때그때 다른 pnpm 을 쓴다. **잠금파일 해석이 달라질 수 있다.**

**E2 첫 작업으로 `project/package.json` 에 한 줄 추가한다:**

```json
"packageManager": "pnpm@10.x.x"
```

> 실제 값은 착수 시 `pnpm --version` 으로 확인해 그 버전을 박는다. `corepack` 이 이 필드를 읽는다.
> **코드 변경이므로 버전업 4파일 동시 대상이다.**

Node 는 **24** (`.nvmrc`, 저장소 루트).

### 2.2 `prepare` 스크립트는 CI 를 막지 않는다 — 확인함

`"prepare": "cd .. && husky project/.husky"` 인데 husky 는 **v8**(`^8.0.3`)이라 인자 형식이 다르다(v9 문법). 실행하면 usage 를 찍지만 **exit 0** 이다(직접 확인). `pnpm install` 이 실패하지 않는다.

**이번 범위에서 고치지 않는다.** 다만 husky 를 9로 올리면 그때 형식을 맞춰야 한다 — 별건.

---

## 3. E2 — CI (`.github/workflows/ci.yml`)

**트리거**: `push`(main) · `pull_request`. **runner**: `macos-latest`(Tauri 대상 플랫폼과 일치).

### 3.1 차단 게이트 4종

```
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm test:t1        # 92 assertions
pnpm test:t15       # 16 assertions
node scripts/check-version-sync.mjs
```

### 3.2 버전 동기 검사 — **신규 스크립트**

**파일**: `project/scripts/check-version-sync.mjs`

`.agents/AGENTS.md` §2 의 「코드 커밋 = 4파일 동시 버전업」을 **기계가 지키게** 한다. 네 곳을 읽어 전부 같은지 본다:

| 파일 | 읽는 곳 |
|---|---|
| `package.json` | `.version` |
| `src-tauri/Cargo.toml` | `^version = "…"` (첫 번째) |
| `src-tauri/tauri.conf.json` | `.version` |
| `src-tauri/Cargo.lock` | `[[package]] name = "devoras"` 바로 아래 `version` |

**현재 넷 다 `0.9.27` 이다** — 착수 시점에 통과하는 것을 확인했다. 불일치면 **네 값을 전부 출력하고 exit 1**. 「어디가 틀렸나」를 사람이 다시 찾게 하지 않는다.

### 3.3 `lint` — **기준선 비교, 비차단**

```
pnpm lint || true        # 실패해도 job 을 죽이지 않는다
```
문제 수를 세어 **기준선 124 와 비교**한다. **늘어나면 경고**하되 job 은 통과시킨다.

- **줄어들면 기준선을 낮춘다** — 워크플로 파일의 상수를 그때 갱신한다(래칫)
- **차단으로 승격하는 조건**: 기준선이 0 이 되는 날. 그전에는 승격하지 않는다

> **왜 지금 고치지 않나**: 124건 중 `react-hooks/exhaustive-deps` 9건은 **의존성 배열을 바꾸는 일**이라
> 동작이 바뀔 수 있다. R5-a 직후에 그걸 일괄로 손대면 **회귀 원인이 R5-a 인지 lint 수정인지 분리되지 않는다.**
> 별건 티켓 대상이다.

### 3.4 캐시

`actions/setup-node`(pnpm 캐시) + `Swatinem/rust-cache`(`project/src-tauri`). **CI 에서 Rust 를 빌드하지 않으므로 rust-cache 는 E1 에만 필요하다.**

---

## 4. E1 — Releases (`.github/workflows/release.yml`)

### 4.1 ⚠️ 수동 실행은 **이미 되어 있다**

PM 지시가 「수동으로 한 번 돌려본 뒤 CI 로 옮기라」인데, **그 산출물이 이미 존재한다**(2026-09-09 15:59 생성):

| | |
|---|---|
| 경로 | `project/src-tauri/target/release/bundle/dmg/Devoras_0.9.27_aarch64.dmg` |
| 크기 | 10,186,112 bytes |
| **sha256** | `4eaa7ac17642ec39d3e8daf2e7f7f1babd5137516e1c03a39b6191141985393e` |
| `.app` 서명 | **adhoc** (`flags=0x20002(adhoc,linker-signed)`) — E3(a) 무서명 경로 그대로 |
| 아키텍처 | **arm64 단독** |
| `.app` 버전 | 0.9.27 (4파일과 일치) |

**즉 「빌드가 되는가」는 이미 답이 나왔다.** E1 의 남은 일은 **자동화와 배포**다.

### 4.2 ⚠️ arm64 단독이다 — 결정 필요

현재 산출물은 **Apple Silicon 전용**이다. Intel Mac 사용자는 **실행할 수 없다.**

| 선택 | 비용 |
|---|---|
| **arm64 단독 유지** | 0. README 에 「Apple Silicon 전용」 명시 필수 |
| **universal 바이너리** | `--target universal-apple-darwin` + Rust 타깃 2개 추가. 빌드 시간·용량 증가 |

**개인 배포 단계에서는 arm64 단독으로 충분하다고 본다.** 다만 **Homebrew cask 는 아키텍처를 명시해야** 하므로 E6 착수 전에 정해야 한다. **PM 판단 요청 사항이지 실행 세션이 정할 것이 아니다.**

### 4.3 워크플로

**트리거**: `push: tags: ['v*']` + `workflow_dispatch`

```
1. tag 에서 버전 추출 (v0.9.27 → 0.9.27)
2. 4파일 버전과 tag 가 일치하는지 검사 — 불일치면 즉시 실패
   (§3.2 스크립트 재사용. 태그와 코드가 어긋난 릴리스를 원천 차단)
3. pnpm install --frozen-lockfile
4. pnpm tauri build
5. sha256 계산 → SHA256SUMS.txt
6. softprops/action-gh-release 로 .dmg + SHA256SUMS.txt 업로드
```

**sha256 은 Homebrew cask 의 전제**다(`REL-20260904-01` §what_homebrew_changes). 지금부터 남긴다.

### 4.4 README — 첫 실행 안내 (**필수**)

무서명이라 **Gatekeeper 가 막는다.** `README.md` 에 넣는다:

```markdown
## 설치 (macOS · Apple Silicon)
1. Releases 에서 `.dmg` 를 받아 앱을 Applications 로 옮깁니다.
2. **처음 한 번은 우클릭 → 열기** 로 실행하세요. 더블클릭하면
   "확인되지 않은 개발자" 경고로 열리지 않습니다.
3. 이후에는 더블클릭으로 열립니다.
```

**이 문구가 없으면 사용자는 앱이 고장 난 줄 안다.**

---

## 5. 하지 않을 것

| | 이유 |
|---|---|
| Developer ID 서명 · 공증 (E3b) | Apple Developer 계정 확인 대기 (D5) |
| Homebrew tap (E6) | 무서명 상태에서는 `--no-quarantine` 이 필요해 보류 |
| `tauri-plugin-updater` | Homebrew 가 업데이트 경로가 되므로 우선순위 하락 |
| Windows 빌드 | macOS 단독 확정 |
| `lint` 124건 수정 | 별건. `exhaustive-deps` 9건은 동작이 바뀔 수 있다 |
| `prepare`/husky v8→v9 | 별건. CI 를 막지 않는다(exit 0 확인) |

---

## 6. DoD

- [ ] `.github/workflows/ci.yml` — 차단 게이트 4종이 **저장소 루트에서** 돈다
- [ ] `packageManager` 필드로 pnpm 버전 고정
- [ ] `check-version-sync.mjs` — 4파일 불일치 시 **네 값을 전부 출력하고** exit 1
- [ ] `lint` 는 비차단, 기준선 **124** 대비 증가 시 경고
- [ ] `.github/workflows/release.yml` — 태그 push 로 `.dmg` + `SHA256SUMS.txt` 발행
- [ ] 태그와 4파일 버전 불일치 시 릴리스 **실패**
- [ ] `README.md` 에 첫 실행 안내(우클릭→열기) + **Apple Silicon 전용** 명시
- [ ] CI 가 **초록**이다 — 빨간 채로 두지 않는다

---

## 7. 이 단위의 끝 — R4 를 사람에게 넘긴다

**R4 는 세션이 할 수 없다.** §4.1 의 산출물이 이미 있으므로 **지금 넘길 수 있다.**

사용자에게 전달할 것: `VERIFY_BY_HUMAN.md` §1·§2·§4 + **§12(라이트 모드 육안)**,
그리고 **§1 의 미재현 보고**(「빌드 앱 첫 실행 시 이미지 미렌더링, dev 를 한 번 거치면 정상」, 2026-08-30)가
**이 `.dmg` 에서 재현되는지가 첫 확인 대상**이다. 사실이면 새 사용자 전원이 깨진 앱을 본다.
