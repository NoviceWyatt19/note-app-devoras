# IMPL_PLAN 20260909 — R3 출시 엔지니어링 E2(CI) → E1(Releases)

> **수행 주체**: `Impl_worker_v1`
> **작성 주체**: `Impl_Manager_v1` — 계획·검증. 코드 수정 없음
> **티켓**: `REL-20260904-01` (`ticket/project/20260904_1840_release_engineering.yml`)
> **기준**: `dc8e000` · v0.9.27 · 원격 `git@github.com:NoviceWyatt19/note-app-devoras.git`

수치는 전부 2026-09-09 에 직접 실행해 얻은 것이다.

---

## 0. ⚠️ 방향 전환 (2026-09-09, 사용자 확인) — **Actions 가 아니라 로컬 도구다**

> **사용자 확인**: 「해당 앱은 local 에서 실행되는 앱이니 굳이 Actions 나 EC2 같은 **외부에서 서비스할 필요가 없는 종류**다.
> 서비스를 한다면 **빌드된 앱을 제공하는 것뿐**이고, 업데이트되면 **`.dmg` 로 배포**한다.
> GitHub 은 **저장용**이다.」

**PM 이 세운 목적은 그대로 유효하다.** 바뀌는 것은 수단이다:

| 목적 | 원래 수단 | **바뀐 수단** |
|---|---|---|
| 하네스가 사람 기억에 의존하는 상태를 끊는다 | Actions CI | **로컬 git hook** |
| 반복 가능한 릴리스 · sha256 | Actions release.yml | **로컬 릴리스 스크립트** |

**왜 Actions 가 이 프로젝트에서 값을 못 만드는가**: 워크플로는 원격에서 돈다. 사용자가 Actions 를
쓰지 않으면 **영영 실행되지 않는다** — 게이트를 기계가 지키는 게 아니라 **지키는 척하는 파일**만 남는다.
그리고 이 프로젝트의 실패 이력(「심각한 결함 3건이 전부 리팩터가 만들었고 전부 자동 테스트를 통과했다」)은
**원격에 들어가기 전, 로컬에서** 걸렸어야 할 것들이다. **hook 이 제자리다.**

### 0.1 게이트 실행 시간 — 측정값이 배치를 정한다

| 게이트 | 실측 |
|---|---|
| `check-version-sync.mjs` | **33ms** |
| `tsc --noEmit` | 1,788ms |
| `test:t1` | 7,733ms |
| `test:t15` | 6,837ms |
| **tsc + t1 + t15 합** | **약 16.4초** |

**16초를 매 커밋에 걸면 `--no-verify` 로 우회하게 된다.** 우회되는 게이트는 없는 게이트다.

| hook | 내용 | 근거 |
|---|---|---|
| **`pre-commit`** | `check-version-sync.mjs` | **33ms.** 체감 0. 버전업 4파일 규약이 커밋 단위 규약이므로 제자리다 |
| **`pre-push`** | `tsc --noEmit` + `test:t1` + `test:t15` | 16초지만 **push 는 드물다**(원격이 2026-09-02 에 멈춰 있었다). 여기서는 16초가 싸다 |

`lint` 는 hook 에 넣지 않는다 — **기준선 124 이고 지금 실패한다**(§1). 고쳐지기 전에는 게이트가 될 수 없다.

### 0.2 husky 가 설치조차 안 돼 있다

- `.husky/` 디렉터리 **없음** · `git config core.hooksPath` **미설정** → **hook 이 하나도 걸려 있지 않다**
- `package.json` 의 `"prepare": "cd .. && husky project/.husky"` 는 **husky v9 문법**인데 설치된 것은 **v8**(`^8.0.3`)
- v8 은 `husky install [dir]` 형식이라 현재 스크립트는 **usage 만 찍고 exit 0** — 조용히 아무것도 안 한다

**즉 husky 는 의존성에만 있고 실제로는 작동한 적이 없다.** E2' 의 첫 작업은 이걸 살리는 것이다.

### 0.3 `gh` CLI 가 있다 — 로컬에서 릴리스까지 만든다

`gh version 2.100.0` 확인. `.dmg` 를 만든 뒤 **`gh release create` 로 태그·릴리스·업로드를 한 번에** 할 수 있다.
Actions 없이도 **버전 태그 + 안정적 다운로드 URL + 체크섬**이라는 Homebrew 전제(`REL-20260904-01`)가 성립한다.

### 0.3.1 ⚠️ 로컬 훅의 약점과 그 방어 — **PM 지적(2026-09-09) 반영**

**지적**: 「로컬 훅은 **커밋하는 사람의 로컬에만** 걸리고, `.husky/` 설치가 안 된 환경에서는 **조용히 통과**한다.」

**맞다. 그리고 이건 가정이 아니라 이미 일어난 일이다** — 이 저장소는 `husky` 를 devDependencies 에
두고도 `.husky/` 도 `core.hooksPath` 도 없이 지내 왔다(§0.2). **훅이 조용히 통과하는 상태가 기본값이었다.**
Actions 를 비판한 논리(「지키는 척하는 파일」)가 **훅에도 그대로 적용된다.**

**다만 이 프로젝트에서 그 위험의 크기는 다르다:**

| | Actions | 로컬 훅 |
|---|---|---|
| 이 저장소에서 실행되는가 | **안 됨** (사용자가 Actions 를 쓰지 않음) | 됨 |
| 커버 범위 | 원격에 오는 모든 커밋 | **훅이 설치된 로컬만** |
| 미설치 시 | — | **조용히 통과** |
| 기여자 수 | — | 사실상 **단일 개발 환경** |

기여자가 여럿이면 Actions 가 옳다. **여기서는 원격이 저장용이고 환경이 하나**라 커버 범위 차이가
실질적으로 사라지고, **「돌지 않는다」가 「일부만 돈다」보다 나쁘다.**

### 0.3.2 방어 — **릴리스가 훅 설치를 검사한다**

「조용히 통과」를 훅 스스로는 못 잡는다(안 돌면 아무 일도 안 일어난다).
**잡을 수 있는 지점은 릴리스다** — 게이트가 돌았는지가 가장 중요한 순간이고, 사람이 명시적으로 부르는 명령이다.

**`release.mjs` 에 선행 검사를 넣는다:**

```
git config core.hooksPath  →  'project/.husky' 인가
project/.husky/pre-commit · pre-push  →  존재하고 실행 권한이 있는가
```

하나라도 아니면 **빌드하지 않고 중단**하고, `pnpm install` 로 훅을 설치하라고 안내한다.

> **근거**: 훅이 없는 상태로 만든 `.dmg` 는 **게이트를 한 번도 통과하지 않은 산출물**이다.
> 그걸 배포하면 「검증됐다」는 잘못된 신뢰가 붙는다. **릴리스가 유일한 자연스러운 검문소다.**

**남는 한계는 기록해 둔다**: 이 방어는 **릴리스 시점에만** 작동한다. 훅 미설치 상태로 쌓인 커밋
자체를 막지는 못한다. 기여자가 늘거나 CI 를 쓰게 되면 **Actions 로 되돌리는 것이 맞다** — 그때
`.github/workflows/` 를 다시 만들면 되고, 게이트 목록과 `check-version-sync.mjs` 는 그대로 재사용된다.

### 0.4 이미 만든 워크플로 2개는 어떻게 하나

**지운다.** `.github/workflows/ci.yml` · `release.yml` 은 **이 저장소에서 돌지 않는다.**
남겨 두면 「CI 가 있다」는 **잘못된 신호**가 된다 — 실제로는 아무도 게이트를 지키지 않는데
다음 세션이 「CI 가 본다」고 가정한다. **작동하지 않는 안전장치는 안전장치가 아니라 오해의 원인이다.**

단, **버전 동기 스크립트(`check-version-sync.mjs`)는 남긴다** — hook 이 그대로 재사용한다.
워크플로 작성이 헛일이 아니었던 이유가 이것이다.

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

## 3. E2' — **로컬 게이트 (git hook)**

### 3.1 husky 를 실제로 설치한다

1. `project/package.json` 의 `prepare` 를 **v8 문법으로 고친다**:
   ```json
   "prepare": "cd .. && husky install project/.husky"
   ```
   저장소 루트가 `Devoras/` 이고 `package.json` 은 `project/` 에 있으므로 `cd ..` 가 필요하다.
   `husky install` 이 `core.hooksPath` 를 설정한다.
2. `pnpm install` 을 한 번 돌려 `.husky/` 가 생기고 `git config core.hooksPath` 가 잡히는지 확인한다.

> **대안**: husky 를 9로 올리면 현재 스크립트 문법이 맞아진다. 다만 v9 는 hook 파일 형식도 달라
> 마이그레이션이 붙는다. **이번엔 v8 에 문법을 맞추는 쪽이 싸다.**

### 3.2 `pre-commit` — 버전 동기 (33ms)

```sh
cd project && node scripts/check-version-sync.mjs
```

`.agents/AGENTS.md` §2 의 「코드 커밋 = 4파일 동시 버전업」을 **기계가 지킨다.**
**문서 전용 커밋은 버전을 올리지 않는 것이 규약**이므로, 스크립트는 「넷이 서로 같은가」만 본다
(「올랐는가」가 아니다). 그래야 문서 커밋을 막지 않는다.

### 3.3 `pre-push` — 무거운 게이트 (약 16초)

```sh
cd project && pnpm exec tsc --noEmit && pnpm test:t1 && pnpm test:t15
```

**push 는 드물다.** 여기서 16초는 싸고, 원격에 들어간 뒤 발견하는 것보다 훨씬 싸다.

### 3.4 `check-version-sync.mjs` — 유지

이미 작성됐고 4케이스로 검증됐다(일치·태그일치·태그불일치·4파일 불일치).
**태그 인자를 받는 기능은 릴리스 스크립트가 그대로 재사용한다.**

---

## 4. E1' — **로컬 릴리스 스크립트**

### 4.1 ⚠️ 수동 실행은 이미 되어 있다

산출물이 이미 존재한다(2026-09-09 15:59):

| | |
|---|---|
| 경로 | `project/src-tauri/target/release/bundle/dmg/Devoras_0.9.27_aarch64.dmg` |
| 크기 | 10,186,112 bytes |
| **sha256** | `4eaa7ac17642ec39d3e8daf2e7f7f1babd5137516e1c03a39b6191141985393e` |
| `.app` 서명 | **adhoc** — E3(a) 무서명 경로 그대로 |
| 아키텍처 | **arm64 단독** |

### 4.2 ⚠️ arm64 단독이다 — PM 판단 대기

**Intel Mac 사용자는 실행할 수 없다.** 개인 배포 단계에서는 arm64 로 충분하다고 보나,
**Homebrew cask 는 아키텍처를 명시해야** 하므로 E6 전에는 확정돼야 한다.

### 4.3 `project/scripts/release.mjs` (또는 `pnpm release`)

```
1. 인자로 받은 태그(v0.9.x)와 4파일 버전 일치 검사
   → check-version-sync.mjs 재사용. 불일치면 즉시 중단
2. git 트리가 clean 한지 확인 (미커밋 상태로 릴리스하지 않는다)
3. pnpm tauri build
4. .dmg 경로 확인 + sha256 계산 → SHA256SUMS.txt
5. gh release create <tag> --title <tag> --notes-file <notes> <dmg> SHA256SUMS.txt
```

**`gh` 는 설치돼 있다**(v2.100.0). 인증이 안 돼 있으면 4단계까지만 수행하고
**산출물 경로와 sha256 을 출력한 뒤 종료**한다 — 업로드는 사람이 한다.
**빌드와 체크섬이 재현 가능해지는 것이 이 스크립트의 값**이지 업로드 자동화가 아니다.

### 4.4 README — 첫 실행 안내 (**필수**)

무서명이라 **Gatekeeper 가 막는다.** `README.md` 에 이미 반영됨(`7a0b069`):
설치 절 · **우클릭 → 열기** · `SHA256SUMS.txt` 검증법 · **Apple Silicon 전용** 명시.

---

## 5. 하지 않을 것

| | 이유 |
|---|---|
| Developer ID 서명 · 공증 (E3b) | Apple Developer 계정 확인 대기 (D5) |
| Homebrew tap (E6) | 무서명 상태에서는 `--no-quarantine` 이 필요해 보류 |
| `tauri-plugin-updater` | Homebrew 가 업데이트 경로가 되므로 우선순위 하락 |
| Windows 빌드 | macOS 단독 확정 |
| `lint` 124건 수정 | 별건. `exhaustive-deps` 9건은 동작이 바뀔 수 있다. **hook 게이트에도 넣지 않는다** |
| **Actions CI · release 워크플로** | **이 저장소에서 돌지 않는다**(§0). 작동하지 않는 안전장치는 오해의 원인이다 |
| husky **v9 업그레이드** | v8 에 문법을 맞추는 쪽이 싸다(§3.1). v9 는 hook 파일 형식도 다르다 |

---

## 6. DoD

- [ ] `.github/workflows/` **삭제** — 이 저장소에서 돌지 않는다(§0.4)
- [ ] `prepare` 를 husky **v8 문법**으로 고치고 `pnpm install` 로 `.husky/` 생성 확인
- [ ] `git config core.hooksPath` 가 실제로 잡힌다
- [ ] **`pre-commit`** — 버전 4파일 동기 검사가 돈다. 불일치 커밋이 **실제로 막히는지** 확인
- [ ] **`pre-push`** — `tsc` + `t1` + `t15` 가 돈다. 실패 시 push 가 **실제로 막히는지** 확인
- [ ] **문서 전용 커밋이 막히지 않는다** — 버전 미상승이 규약이다
- [ ] `check-version-sync.mjs` — 불일치 시 **네 값을 전부 출력하고** exit 1
- [ ] `packageManager` 필드로 pnpm 버전 고정
- [ ] `scripts/release.mjs` — 태그·버전 일치 검사 → 빌드 → sha256 → (`gh` 있으면) 릴리스 생성
- [ ] `gh` 미인증 시 **산출물 경로와 sha256 을 출력하고 정상 종료**한다
- [ ] **`release.mjs` 가 훅 설치를 선행 검사한다** — `core.hooksPath` + 훅 2개 존재·실행권한.
      아니면 **빌드하지 않고 중단**(§0.3.2). 훅 없이 만든 `.dmg` 는 게이트를 통과하지 않은 산출물이다
- [ ] `README.md` 첫 실행 안내 + Apple Silicon 전용 명시 (`7a0b069` 반영됨)

---

## 7. 이 단위의 끝 — R4 를 사람에게 넘긴다

**R4 는 세션이 할 수 없다.** §4.1 의 산출물이 이미 있으므로 **지금 넘길 수 있다.**

사용자에게 전달할 것: `VERIFY_BY_HUMAN.md` §1·§2·§4 + **§12(라이트 모드 육안)**,
그리고 **§1 의 미재현 보고**(「빌드 앱 첫 실행 시 이미지 미렌더링, dev 를 한 번 거치면 정상」, 2026-08-30)가
**이 `.dmg` 에서 재현되는지가 첫 확인 대상**이다. 사실이면 새 사용자 전원이 깨진 앱을 본다.
