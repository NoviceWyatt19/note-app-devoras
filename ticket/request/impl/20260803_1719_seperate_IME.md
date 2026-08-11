# 🛠 IMPLEMENT TICKET
type: "IMPLEMENT_TICKET"
id: "SESS-20260803-02"
# ━━━
update: "2026-08-03 17:15"
project_ref: "PRJ-DEVORAS-MVP"
subject: "다중 탭/패널 환경의 IME 스레드 분리 및 Raw Input 격리 파이프라인 구축"
status: "Todo"
# ━━━
spec:
  inputs:
    - "다중 탭 내 개별 CodeMirror 인스턴스의 Raw Input 및 IME(Composition) 이벤트"
    - "activeTab 및 SplitPane 경로에 따른 독립적 에디터 활성 상태"
  outputs:
    - "한글/한자 조합 중 문자 씹힘, 중복 입력, 조합 끊김 현상이 제거된 텍스트 렌더링"
    - "다중 에디터 뷰 간 완전히 독립적이고 격리된 IME 트랜잭션 보장"
  internal_logic:
    - "1. Worker 스레드 도입을 통해 에디터 메인 스레드와 Raw Input 이벤트 파이프라인 분리"
    - "2. 다중 탭 환경에서 각 에디터 뷰(EditorView)의 CompositionState 개별 격리 및 동기화"
    - "3. Webkit/Flutter 환경 특유의 커서 이동 시 조합 중단 등 트랜잭션 꼬임 보정 로직 구현"
    - "4. CodeMirror extension으로 IME 격리 레이어(ImeIsolationExtension) 구현 및 등록"
# ━━━
harness:
  path: "project/src/widgets/BlockEditor/__tests__/ime_isolation_harness.ts"
  run_command: "pnpm test:ime"
# ━━━
tasks:
  - "[ ] 다중 탭/패널 구조에 맞춘 에디터 인스턴스별 IME 상태(CompositionState) 독립 관리 스토어 구현"
  - "[ ] Worker 기반 Raw Input 처리 파이프라인 구축 (ImeIsolationExtension 작성)"
  - "[ ] 한글 조합(CompositionStart, Update, End) 엣지 케이스 및 트랜잭션 보정 로직 작성"
  - "[ ] 하네스 기반 자체 테스트: 분할된 탭 간 전환 시 IME 격리 및 텍스트 입력 무결성 검증"