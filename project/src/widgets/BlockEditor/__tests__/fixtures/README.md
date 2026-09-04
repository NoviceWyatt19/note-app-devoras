# mount_cost_n200.md

`mount_cost_singledoc_t2_harness.ts` 의 `makeDoc(200)` 산출물을 그대로 저장해 둔
고정본이다(H1 1개 + H2 200개, 코드펜스 2개·표 1개·KaTeX 1개 고정 배치). 매번 콘솔에서
다시 생성하지 않아도 워크스페이스에 복사해 넣기만 하면 된다.

## 왜 필요한가 (DEBUG_PLAN §5.10)

`mount_cost_singledoc_t2_harness.ts` 는 **React 를 안 쓴다** — CodeMirror 계층
단독 마운트 비용만 잰다. 그런데 A6 원 관측치(N=200 에서 7,024~17,423ms)는
**React 포함 실제 앱 경로**("문서 클릭 → 마운트 완료")를 쟀다. 하네스 숫자가
낮게 나와도 그건 "CodeMirror 계층은 무죄"라는 뜻이지 "300ms 예산을 지켰다"는
뜻이 아니다 — 그 둘을 같다고 보는 게 Step 6 이 낸 오판과 같은 모양이다.

## 실제 앱 대조 측정 프로토콜

1. `pnpm dev`(또는 `pnpm tauri:dev`)로 앱을 연다.
2. 워크스페이스에 이 파일을 복사해 넣는다(파일명은 무엇이든 상관없다).
3. **플래그 끈 상태**(`localStorage.removeItem('devoras:singleDocEditor')` 또는
   `localStorage.setItem('devoras:singleDocEditor','0')`, 새로고침)로 파일을 클릭해
   열고, 클릭 시점부터 화면이 완전히 그려질 때까지("마운트 완료")의 시간을 잰다 —
   DevTools Performance 패널로 녹화하거나, 화면이 안정될 때까지의 체감 시간을
   스톱워치로 재도 된다. A6 원 관측과 같은 정의를 쓰는 것이 핵심이다.
4. **플래그 켠 상태**(`localStorage.setItem('devoras:singleDocEditor','1')`, 새로고침)로
   같은 세션에서 동일 파일을 다시 연다 — 환경 차이가 상쇄되도록 같은 세션 안에서
   두 조건을 다 잰다.
5. 두 숫자를 A6 원 관측치(7,024~17,423ms) 및 이 문서 옆 하네스의 `attachedMs`
   (CodeMirror 계층 단독 비용)와 나란히 기록한다.

**판정**: 플래그 켠 상태의 "마운트 완료" 시간이 300ms 예산 안에 드는지가 §5.0.4
항목 1 의 실제 판정이다. 하네스의 `attachedMs` 는 부분 질문("CodeMirror 계층
자체는 예산 안인가")의 답일 뿐이다. 두 숫자가 크게 갈리면 그 차이 자체가
§3-A-0(재현율 8~19%, 나머지 정체 불명)의 답이니 평균 내지 말고 따로 기록할 것.
