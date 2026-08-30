# VERIFY_BY_HUMAN.md

> **배경**: [`DEBUG_PLAN.md`](DEBUG_PLAN.md) §2-B "Step 1 — B2 잔여: 실기 검증 4건(S4·S5·S5·S2)" 중 Claude in Chrome·Tauri MCP로 자동 검증이 가능한지 조사했다. 결과 절반은 자동화됐고, 나머지는 구조적으로 자동화가 불가능해 사람이 직접 확인해야 한다. 이 문서는 **사람이 직접 수행해야 하는 항목만** 모은 목록이다.

## 자동 검증 완료 (참고용, 2026-08-30)

`tauri-plugin-mcp-bridge`를 dev 전용으로 임시 설치해 `pnpm tauri dev` 위에서 확인. 검증 후 관련 코드는 전부 원복함(Cargo.toml·lib.rs·capabilities·overlay config 잔존물 없음).

- **S4** `asset://.../.ssh/... ` → 403: 워크스페이스 내부(200) / 밖·deny 아님(403) / deny 목록(403) 3단으로 확인 — Step 1-A(커밋 `b5a3bd1`)의 동적 scope 좁히기가 deny 목록이 아니라 allow 부재로 실제로 막고 있음을 확인.
- **S2 (콘솔 CSP 위반)**: 위반 로그 0건. DEBUG_PLAN에 적힌 "Tauri MCP Bridge가 `tauri://` 커스텀 프로토콜과 비호환"이라는 이전 결론은 이 플러그인 기반 브리지에는 해당하지 않았음.
  - ⚠️ **주의**: 이 확인은 `pnpm tauri dev`(즉 `devCsp`) 위에서 이뤄졌다. `devCsp`는 Vite HMR을 위해 `script-src 'unsafe-inline'`·추가 `connect-src` 오리진을 허용하는 **더 느슨한** 정책이라, 프로덕션 `csp`에서도 위반 0건이라는 보장은 아니다. §2 항목으로 별도 등재.

## 사람이 직접 확인해야 하는 항목

### 1. S5 — 번들 앱에서 이미지·코드블록 육안 확인

- **대상**: `pnpm tauri build` 산출물(release 빌드).
- **자동화 불가 이유**: `tauri-plugin-mcp-bridge`는 `#[cfg(debug_assertions)]`로 감싸져 있어 release 빌드엔 컴파일 자체가 안 됨. 어떤 자동 도구도 release 바이너리에 붙을 수 없음.
- **확인 방법**: 빌드된 앱 실행 → 워크스페이스 열기 → 이미지 삽입 문서·코드블록 포함 문서를 열어 육안 확인.
- **DoD**: 이미지 정상 렌더링, 코드블록 정상 렌더링, 0.8.5 회귀(R4) 재발 없음.

### 2. S5 — `pnpm tauri build` 후 HMR 무관 정상 동작

- **대상**: 위와 동일한 release 빌드.
- **자동화 불가 이유**: "HMR 무관"이라는 조건 자체가 Vite dev 서버를 배제한 상태를 요구함. dev 기반 검증(브리지 포함)으로는 이 조건 자체를 테스트할 수 없음 — dev로 우회하면 이 항목이 잡으려는 문제(빌드 산출물 특유의 자산 경로·정적 서빙 차이)가 검사 대상에서 빠져버림.
- **확인 방법**: 빌드된 앱을 dev 서버 없이 실행. 문서 열기·편집·저장·탭 전환 등 §6.2 공통 회귀(R1~R6)를 dev와 동일하게 통과하는지 확인.

### 3. S2 — 네트워크 요청 0건 (부분 미해결)

- **배경**: 콘솔 CSP 위반은 자동 확인됐으나(0건), "네트워크 요청 0건"은 Performance Resource Timing API로 시도했지만 `asset://` 커스텀 프로토콜 요청이 이 API에 기록되지 않아 확정 증거를 얻지 못함.
- **확인 방법(제안)**: OS 레벨 커넥션 모니터링(Little Snitch, `lsof -i` 전/후 스냅샷 비교 등)으로 deny 대상 경로 접근 시 외부 네트워크 커넥션이 실제로 0건인지 확인. 또는 Rust 쪽 asset protocol 핸들러에 임시 로깅을 넣어 직접 계측.

### 4. S2 — 프로덕션 `csp` 자체 재확인

- **배경**: 위 자동 검증은 전부 `pnpm tauri dev`(`devCsp`) 위에서 수행됐다. `devCsp`는 `script-src 'unsafe-inline'`과 HMR용 추가 `connect-src` 오리진을 허용하는 더 느슨한 정책이라, dev에서 위반 0건이 나와도 프로덕션 `csp`(더 엄격)에서 동일하다는 보장이 없다.
- **확인 방법**: `pnpm tauri build` 산출물을 실행한 상태에서 콘솔에 CSP 위반 로그가 없는지 직접 확인. (자동 브리지가 release 빌드에 못 붙으므로 — 위 1·2번과 동일한 제약.)

### 5. 워크스페이스 밖에서 드래그·드롭 이미지 붙여넣기 회귀 확인

- **배경**: Step 1-A에서 `fs:allow-home-read-recursive` 권한을 제거하는 과정에서 Finder 드래그앤드롭·URI 리스트 붙여넣기(`useTauriInputManager.ts`의 `readFile` 경로)가 깨지는 회귀가 발견되어, `devoras_image_save`와 동일한 scope-bypass 패턴의 `devoras_read_dropped_file` Rust 커맨드로 수정됨(project-b8 세션, 커밋 `b5a3bd1`).
- **확인 방법**: 워크스페이스 **밖**에 있는 이미지 파일을 Finder에서 에디터로 드래그앤드롭 / URI 리스트로 붙여넣기 해서 정상적으로 삽입되는지 확인. 회귀 재발 여부 및 scope 우회가 워크스페이스 경계를 다시 뚫지 않는지(`ensure_inside` 동일 검증 로직 적용 여부) 함께 확인.

## 검증 종료 후

각 항목 확인이 끝나면 [`DEBUG_PLAN.md`](DEBUG_PLAN.md) §2-B 표와 §7 DoD 체크박스에 결과를 반영하고, 이 문서는 삭제한다.
