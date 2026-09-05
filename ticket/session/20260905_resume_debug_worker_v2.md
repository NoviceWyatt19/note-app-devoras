# 재개 지점 — Debug_worker_v2 (2026-09-05, 사용자 토큰 한계로 중단)

## 상태
- 작업 트리 **완전히 클린**(`git status --short` 무출력). 임시 계측·WIP 없음 — 저장할 것 없음.
- `BlockEditor.tsx` 확인 — S1·S2(`f4d5d69`) 그대로 살아 있고, R5-a 색 토큰 이관은 이 파일을
  건드리지 않았다(순서 위반 경보는 `29b3b46`에서 오경보로 철회됨 — 재확인 불필요).
- 마지막 완료 커밋: `f4d5d69`(S1·S2, v0.9.3). 그 이후 R1 잔여(D12·D13) 착수 전 중단.

## 중단 시점
PM 이 R1 잔여 2건(D12·D13) + 하네스 2건 + D14 기록을 지시했고, `WorkspacePage.tsx:369` 를
막 읽어 D13 구현을 계획하던 중 "즉시 중단" 지시가 도착해 **코드 변경 없이** 멈췄다.

## 다음 세션이 할 일 (PM 지시 순서 그대로, `PM-20260904-01` §r1_closeout 근거)

1. **D12** — `ErdDesignerMainView.tsx` 의 빈 입력 분기(`rawContent.trim() === ''`)가 여전히
   `setRawContent`+`updateContentForTab` 으로 즉시 쓴다. `createEmptyErdDocument()` 결과를
   **로컬 `document` 상태로만** 두고 쓰기는 제거 — 사용자가 실제로 편집(`onChange`)할 때만
   쓰도록 미룬다. 부수 이득: 빈 `.erd` 를 열기만 해도 dirty 되던 것도 같이 없어진다.
2. **D13** — `WorkspacePage.tsx:369`:
   ```
   initialContent={activeTab.cache?.rawContent ?? ''}
   ```
   → `activeTab.cache?.rawContent ?? activeTab.savedContent ?? ''` 로. **커밋 메시지에
   "도달 경로 미확인 — 방어적 배선" 명시할 것** — 계획 세션이 실제 도달 경로를 못 찾았고
   결함으로 확정하지 않았다. 나중에 "버그 수정"으로 오독하면 안 된다.
3. **하네스 2건** (`erd_parse_failure_no_overwrite_harness.tsx` 보강):
   - 빈 입력 분기에 "쓰지 않는다" 단언 추가(D12 반영 후).
   - 기존 테스트의 `isDirty === false` 단언은 간접 프록시다(`setRawContent` 단독 호출은 못 잡음).
     탭 스토어의 `rawContent` 를 직접 단언하도록 보강.
4. **D14** — 정규화 손실(`erd.ts:223-225` position 비수치→0, `:244` type 비문자열→"")은
   **신규 티켓 기록만.** 고치지 않는다 — 출시 스코프 밖.
5. **그다음 S1·S2** — 이미 완료(`f4d5d69`). 재작업 불필요, 착수 전 확인만.

## 테스트 상태 (중단 시점, 기록만 — 수정 안 함)
- `pnpm test:t1` — 12개 스위트 전량 `fail 0`.
- `pnpm test:t15` — 5개 스위트 전량 `fail 0`.

## 참고
- R1(BUG-20260902-01) 자체는 `aff36f5`(v0.9.2)로 이미 Done — PM 이 diff 직접 확인, 통과 판정.
- `.agents/AGENTS.md` §2: 코드 커밋 = `package.json`·`src-tauri/Cargo.toml`·`tauri.conf.json`·
  `Cargo.lock` 4파일 동시 패치 버전업. `src-tauri/` 세 파일을 R3(출시 엔지니어링)로 오인해
  분리 커밋하면 안 된다는 것이 이미 `a14e0e8` D11 로 확정됨 — 지금 방식(코드 커밋과 같은
  커밋에 버전업 포함) 그대로 유지.
- 현재 버전 `0.9.4`(다른 레인의 R5-a T1a 가 마지막으로 올림, `b38e8a1`). 다음 코드 커밋은
  `0.9.5`.
