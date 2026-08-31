# 고급 렌더링 & 메모리 최적화 전략 (Advanced Rendering & Memory Optimization Strategy)

> **최종 갱신**: 2026-08-27 | **대상 버전**: `v0.8.18`
> **통합 이력**: `ticket/impl/advanced_rendering_optimization.md`(36줄)와 `project/advanced_rendering_optimization.md`(44줄) 두 독립 초안을 본 문서로 통합.
> **연계 문서**: [`code_review.md`](code_review.md) — 아래 §5는 현재 코드에서 이미 발생 중인 메모리 이슈와의 연결 지점입니다. [`implementation_plan.md`](implementation_plan.md) 「스파이크」 §S.4 — §3.4.2 는 그 스파이크의 성능 측 근거입니다.

---

## 🚀 1. 개요 (Overview)

Devoras는 향후 **3D Freeform 뷰(Architecture View), 무한 스케줄러, TODO 특화 문서** 등 무거운 렌더링을 요구하는 컴포넌트(Heavy Views)를 여러 탭으로 동시에 띄울 수 있는 확장성을 목표로 합니다.

Tauri(WKWebView/WebView2) 환경에서는 WebView의 Heap Memory 한계로 인해, 다수의 무거운 뷰가 마운트된 상태를 유지하면 퍼포먼스가 급격히 저하되거나 OOM(Out Of Memory) 크래시가 발생합니다.

본 문서는 이 병목을 **선제적으로** 방어하기 위한 렌더링/메모리 라이프사이클 아키텍처를 정의합니다.

---

## 📉 2. 배경 및 필요성

- **현재 실측**: 마크다운 에디터 + 마인드맵(ReactFlow) 렌더링만으로도 **탭 하나당 약 100MB**의 추가 메모리가 점유됩니다.
- **플랫폼 한계**: 단일 WebView가 사용할 수 있는 힙 메모리는 통상 **1.5GB ~ 2GB** 수준입니다.
- **예상 증가분**: WebGL 기반 3D 뷰나 복잡한 스케줄러 DOM이 마운트되면 위 한계선에 빠르게 근접하여, 앱 전체가 느려지거나 강제 종료될 위험이 있습니다.

따라서 "탭을 많이 열어도 죽지 않는" 정교한 메모리 라이프사이클 관리가 3D 뷰 도입 **이전에** 갖춰져야 합니다.

---

## 🛠 3. 핵심 최적화 전략 (Core Strategies)

### 3.1. LRU 기반 뷰 캐싱 및 동적 언마운트 (Memory Lifecycle)

여러 탭을 띄워두더라도 **모든 뷰를 메모리에 유지하지 않습니다.**

- **Lazy Rendering**: 탭이 실제로 활성화되는 시점에만 DOM과 WebGL 컨텍스트를 마운트합니다.
- **TTL(Time-To-Live) 언마운트**: 비활성 탭은 우선 `display: none`으로 렌더링 상태를 보존하되, **일정 시간(예: 5분) 이상 미접근 시 컴포넌트를 완전히 파괴(Unmount)** 하여 메모리를 회수(GC)합니다.
- **상태 스냅샷(State Snapshot)**: 컴포넌트를 내리기 직전, 스크롤 위치 / 확대·축소 배율(Zoom) / 3D 카메라 위치 / 선택 상태 등 View State를 Zustand 스토어에 JSON으로 캐싱합니다.
- **Lazy Re-mount**: 사용자가 해당 탭으로 돌아오면 캐싱된 스냅샷으로 즉시 복원하여, 탭이 내려갔었다는 사실 자체를 인지하지 못하게 합니다.

### 3.2. 연산 스레드 분리 (Web Worker & Rust Offloading)

메인 UI 스레드를 블로킹하는 프레임 드랍(Jank)을 막기 위해 무거운 연산을 격리합니다.

- **Web Worker 오프로딩**: 3D 지오메트리/좌표 계산, 대규모 마인드맵 레이아웃(d3-force, dagre), 거대 마크다운 파싱을 백그라운드 스레드로 넘깁니다.
- **비동기 렌더링 파이프라인**: Worker는 연산 결과(좌표·구조체)만 메인 스레드로 전달하고, 메인 스레드는 이를 Three.js / React Flow 객체에 적용만 합니다.
- **Rust 위임 (Tauri IPC)**: 디스크 I/O가 수반되는 거대 노드 데이터 연산은 Worker 대신 **Rust 백엔드에서 처리**한 뒤 View Model만 전달하여, JS 힙 점유 자체를 최소화합니다.

### 3.3. 다중 웹뷰 / Child WebView 분리 아키텍처 (Tauri 2.x)

단일 WebView의 메모리 한계를 돌파하기 위한 궁극적 수단입니다.

- **문제**: 3D 뷰가 메인 에디터와 같은 WebView를 공유하면, 3D 쪽 메모리 누수가 곧바로 에디터 버벅임으로 전이됩니다.
- **Tauri Child Window / IFrame**: 3D 캔버스처럼 독립 엔진이 필요한 뷰는 별도(숨김) 자식 윈도우로 띄워 **프로세스 메모리를 물리적으로 분리**합니다. 뷰를 닫으면 해당 프로세스를 Kill하여 OS에 메모리를 100% 즉시 반환할 수 있습니다.
- **포스트 메시징**: 메인 에디터와의 상태 동기화는 Tauri IPC(`invoke`, `emit`) 기반의 단방향 이벤트 스트림으로 통신합니다.

### 3.4. DOM 가상화 및 WebGL 최적화

- **리스트 가상화**: 무한 스크롤 TODO 리스트, 스케줄러 타임라인, 수만 노드 마인드맵은 뷰포트(Frustum Culling / Bounding Box) 내부 요소만 DOM에 마운트합니다. (예: `@tanstack/react-virtual`)
- **WebGL Geometry Instancing**: 동일 모델/재질을 공유하는 3D 노드는 `InstancedMesh`로 묶어 드로우 콜을 1회로 최소화합니다.

#### 3.4.1. 블록 에디터 가상화 (2026-08-27 신규 · **우선순위 상향**)

`DEBUG_PLAN.md` 의 **편집 표면 상시화(Option B)** 로 CodeMirror 인스턴스가 **포커스된 1개 → 블록 수 N개**로 늘어납니다. 이 문서에서 가장 먼저 실현되는 가상화 대상이 마인드맵이 아니라 **블록 에디터**가 되었습니다.

- **착수 조건**: `DEBUG_PLAN.md` §5 **E0 타당성 게이트**의 실측 결과에 따릅니다.
  - N=200 에서 마운트 300ms 이하 · 블록당 150KB 이하 → 가상화는 후행(E7) 가능
  - 예산 초과 → **가상화를 상시화 구현보다 먼저** 수행
- **윈도 크기**: 뷰포트 **±2 화면 높이**. 캐럿 근처에서 마운트/언마운트가 절대 일어나지 않아야 합니다.
- **⚠️ 높이 캐시는 선택이 아니라 필수**: 언마운트 구간을 **정확한 실측 높이의 플레이스홀더**로 대체하지 않으면, **가상화 자체가 BUG-20260827-13(스크롤 점프)을 재생산**합니다. 블록 높이를 측정·캐시하는 인프라를 가상화와 **동시에** 만들어야 합니다.
- **`architecture_stages.md` Stage 3 와의 관계**: 캔버스 뷰포트 컬링과 동일한 윈도잉 개념을 공유하도록 설계하여 중복 구현을 피합니다.

#### 3.4.2. Write Mode 데코레이터 오케스트레이터 (2026-08-27 신규 · 커스텀 문법 스파이크에서 식별)

`createDecorationPlugin`(`src/shared/lib/editor/decorators/orchestrator.ts`)의 `buildAll` 은 문서(블록) 갱신마다 **등록된 데코레이터 전부를 순서대로 호출**하고, 각 데코레이터는 **자기 몫의 라인 분류(코드펜스 여부 등)를 독립적으로 재계산**합니다. `->`/`=>` 커스텀 심볼을 추가하며 이 구조를 그대로 답습했더니, 코드펜스 판정 로직이 `CodeBlockDecorator` 와 신규 `CustomSymbolDecorator` 양쪽에 **중복**으로 존재하게 되었습니다 (전자는 라인 상태, 후자는 `protectedRegions.ts`).

- **현재 비용**: 데코레이터 N 개 → 블록 갱신 1회당 문서 전수 순회 N 회 + 코드펜스/수식펜스 판정이 데코레이터마다 각자 실행됨.
- **§3.4.1 (블록 에디터 가상화) 과의 관계**: 가상화가 들어와도 이 문제는 사라지지 않습니다 — 뷰포트 안에 있는 블록 각각이 여전히 N 회 순회를 겪습니다. 오히려 **블록 수가 늘어날수록** 데코레이터 개수(커스텀 심볼은 개수 제한이 없음)에 의한 비용도 함께 커지므로, 가상화와는 **독립적으로** 해결해야 하는 축입니다.
- **제안**: `buildAll` 이 라인 분류(코드펜스/수식펜스 상태, 점유 범위)를 **1회만 계산**해 `DecorationContext` 로 모든 데코레이터에 공유. 상세 인터페이스 초안은 `implementation_plan.md` 「스파이크」 §S.4 참조 — 이 항목은 그 인프라의 **성능 측 정당화 근거**입니다 (안정성 측 근거는 겹치는 `Decoration.replace` 방지).
- **착수 시점**: 별도 스프린트가 아니라 §S.4/§S.5 (데코레이터 중재 인프라) 구현과 **동시에** 처리하는 편이 비용이 낮습니다 — 점유 원장(ledger)을 만드는 김에 라인 분류도 함께 캐싱하면 되기 때문입니다.

---

## 📅 4. 구현 로드맵 (Implementation Roadmap)

| 단계 | 내용 | 착수 시점 |
|---|---|---|
| **Phase 0 (현재)** | 에디터·ReactFlow 탭은 전환 시 언마운트하지 않아 빠른 전환을 보장하되, **동시 열람 탭 수 제한** 또는 경량 캐싱만 적용 | v0.8.x |
| **Phase 1** | ✅ **완료(2026-08-31, REF-20260831-01 / Step 7-C, C-1~C-4)** — 상태 스냅샷 아키텍처. §4.1 참고. | v0.8.48 |
| **Phase 1.5 (신규)** | **블록 에디터 가상화** (§3.4.1) — 높이 캐시 + 플레이스홀더 인프라 포함 | `DEBUG_PLAN.md` E0 게이트 결과에 따라 **E1 이전 또는 E7** |
| **Phase 2** | TTL 기반 언마운터(Garbage Collector Component) 래퍼 개발 — 유휴 5분 경과 시 활성 패널이라도 더미 컨테이너로 교체. 계약은 §4.1 이 이미 확정해 뒀다 — 새로 설계할 게 없다 | 착수 가능(Phase 1 완료됨) |
| **Phase 3** | Web Worker 파이프라인 구축 — 마크다운 파서 및 대규모 노드 연산의 Worker 모듈화 | 문서 크기 이슈 발생 시 |
| **Phase 4** | 3D 뷰 적용 및 검증 — Child WebView 분리 + 메모리 풋프린트 모니터링 | 3D Freeform 뷰 도입 시점 |

> **완료 기록**: Phase 1과 [`code_review.md`](code_review.md) **P0-3(분할 패널 전역 상태 공유)** 의 탭 스코프 스토어 개편은 동일 지점이라 예정대로 함께 처리됐다(REF-20260831-01, `project/ticket/refactor/20260831_0641_tab_scoped_store.yml`).

### 4.1. Phase 1 완료 — 탭 스코프 스토어의 `serialize()`/`hydrate()` 계약 (C-5)

Phase 1 이 요구한 "탭 전환 시 로컬 상태를 임시 저장하는 인터페이스"는 REF-20260831-01
의 `createTabStore(tabId)`(`project/src/entities/document/model/tabStore.ts`)로
구현됐다. Phase 2 가 그대로 가져다 쓸 수 있도록 계약을 여기 확정해 둔다 — **이 절이
바뀌면 Stage 2 Thin Client 의 IPC 경계(`getBlockTree(tabId)`, `updateBlock(tabId,
blockId, content)`) 초안도 함께 바뀐다**(`architecture_stages.md`).

**생명주기 소유권 (open_question 2 의 답)** — 탭 스코프 스토어의 생명은 지금도
앞으로도 `TabDocumentProvider`(React 컴포넌트)의 마운트/언마운트가 소유한다. **Phase 2
는 이 소유권 모델을 바꾸지 않는다** — 한 단계 위에서, "언제 `TabDocumentProvider` 렌더를
멈출 것인가"를 결정하는 정책만 추가한다:

- **오늘(C-4 까지)**: 활성 패널의 활성 탭이 바뀌는 순간(사용자가 다른 탭을 클릭)에만
  언마운트한다. `PaneContainer`(`WorkspacePage.tsx`)가 `_snapshotActiveTab()` 으로
  떠나는 탭의 최신 상태를 **먼저** `TabItem.cache` 에 반영한 뒤, 새 탭을 위한
  `TabDocumentProvider` 를 그 탭의 `cache.rawContent`/`cache.nodes` 로 다시 만든다.
  이 왕복은 이미 프로덕션 경로이고 `pane_ownership_harness.ts`(`test:paneownership`)
  가 5개 소유권 이전 지점 전부를 덮는다.
- **Phase 2 가 더하는 것**: 탭을 **안 바꿔도**(같은 탭을 계속 보고 있어도) 일정 시간
  조작이 없으면 같은 왕복을 강제로 트리거하는 유휴 타이머. 메커니즘은 새로 짤 게
  없다 — 오늘 탭 전환이 이미 타는 "스냅샷 → 언마운트 → 재시드" 경로를 유휴 타이머가
  대신 트리거하기만 하면 된다.

**`initialContent`/`initialNodes` 재시드 vs `hydrate()` — 언제 무엇을 쓰는가**:

- `PaneContainer` 가 오늘 쓰는 방식(캐시에서 `initialContent`/`initialNodes` 를 뽑아
  `createTabStore` 를 **새로** 호출)은 `rawContent`/`blocks`/`nodes` 는 정확히
  복원하지만 `activeBlockId`/`focusOffset`/`viewMode` 는 기본값(`null`/`0`/`'write'`)
  으로 리셋된다 — 탭 전환은 어차피 캐럿 위치가 안 이어져도 자연스럽다.
- Phase 2 의 유휴-TTL 언마운트는 사용자 입장에서 "탭이 내려갔었다는 사실 자체를
  인지하지 못해야" 한다(§3.1 목표) — 즉 캐럿·viewMode 까지 정확히 이어져야 한다.
  그래서 Phase 2 는 `initialContent` 재시드가 아니라 **`serialize()` → (어딘가에 보관)
  → 새 스토어에 `hydrate()`** 경로를 써야 한다. `hydrate()` 는 C-1 부터 이미 존재하고
  `tab_store_isolation_harness.ts`(`test:tabstore`)가 왕복을 검증해 뒀다 — Phase 2 가
  새로 만들 것은 **"언제 스냅샷 뜨고 언제 hydrate 할지"를 결정하는 유휴 타이머 하나**뿐이다.
- 스냅샷 보관 위치는 `TabItem.cache`(이미 있는 필드)를 그대로 쓰는 걸 권장한다 —
  `TabStoreSnapshot` 의 `rawContent`/`nodes` 는 `TabCache` 와 이미 같은 모양이고,
  `activeBlockId`/`focusOffset`/`viewMode`/`blocks`/`isDirty` 만 추가로 얹으면 된다.
  별도 저장소를 새로 만들면 캐시가 두 벌로 갈라진다.

**직렬화 형식 함정(constraints 절 재확인)**: `serialize()` 가 뽑는 `rawContent` 는
블록을 `\n` 으로 이어 붙인 것이라 **마지막 블록만 후행 개행이 없다**(join 순서
아티팩트, Step 4 에서 발견). 스냅샷을 콘텐츠 해시나 문자열 동등 비교로 캐싱 키를
만들 계획이 있다면 정규화 없이 비교하지 말 것 — 정확히 같은 문서라도 블록 재정렬
직후엔 문자열이 달라질 수 있다.

**open_question 1(동일 파일 다중 패널 공유)의 현재 상태**: 아직 미해결이며, 의도적으로
그렇다. 7-A 가 택한 회피("동일 파일을 다른 패널에서 열면 새 탭 대신 그 패널로 포커스만
이동")가 지금도 살아 있고, `tabStoreRegistry.ts` 는 `tabId → 스토어 하나` 관계를
전제한다(같은 tabId 로 두 번째 `TabDocumentProvider` 가 마운트되면 레지스트리의 최신
등록이 이전 것을 조용히 덮어써, 첫 번째 Provider 가 인식 못한 채 고아가 된다).
**Phase 2 든 그 이후든, 이 회피를 없애고 다중 패널 공유를 정면으로 풀려면 레지스트리를
`tabId → 스토어 인스턴스 1개` 에서 `tabId → 스토어, 참조 카운트` 로 먼저 바꿔야 한다.**
그 전까지는 회피를 유지할 것 — UX 상 흠으로 보이지만 구조적 격리(이 티켓의 핵심 성과)를
공짜로 지켜준다.

---

## 🔗 5. 현재 v0.8.2 코드의 메모리 이슈 연결 지점

본 문서는 "향후 과제" 기획안이지만, 아래 항목들은 **이미 v0.8.2 코드에서 메모리를 소모하고 있는** 실측 가능한 결함입니다. Phase 1 착수 전에 선행 처리하는 편이 비용이 낮습니다. (상세: [`code_review.md`](code_review.md))

| 리뷰 항목 | 현상 | 본 전략과의 관계 |
|---|---|---|
| **P1-8** 이미지 base64 인라인 | 모든 이미지를 원본 대비 약 1.37배 크기의 Data URL로 DOM에 상주시킴 | §3.4 최적화 이전에 제거해야 할 최대 단일 할당원. `convertFileSrc` 전환으로 즉시 해소 가능 |
| **P1-3** 워크스페이스 전환 시 `blockStore` 잔존 | 이전 워크스페이스 문서 AST가 앱 종료까지 회수되지 않음 | §3.1 라이프사이클 관리의 최소 전제 조건 |
| **P2-1** 스토어 전체 구독 | 입력 1회마다 MindView SVG 전체 리렌더 | §3.2 스레드 분리 이전에 렌더 범위부터 좁혀야 효과 측정이 가능 |
| **P2-3** `renderBlockToHtml` 렌더마다 재파싱 | 블록 수 × 리렌더 횟수만큼 `marked` + `hljs` 재실행 | **Write Mode 에서는 편집 표면 상시화로 소멸**(`marked` 경로 자체가 제거됨). Read Mode 경로는 잔존하므로 §3.4 정리 대상으로 유지 |
| **신규** 블록당 CodeMirror 인스턴스 | 상시화 이후 인스턴스 수 = 블록 수. WKWebView 힙에 직접 계상됨 | §3.4.1 의 **직접 동기.** E0 게이트에서 블록당 150KB 예산으로 실측 |
| **P0-4** 디바운스 타이머 미정리 | 언마운트된 컴포넌트의 타이머가 살아남아 다른 문서 컨텍스트에서 발화 | §3.1 TTL 언마운트 도입 시 **동일 결함이 대규모로 재현**되므로 선행 수정 필수 |
| **신규** 데코레이터별 라인 분류 중복 계산 | 블록 갱신마다 코드펜스/수식펜스 판정을 데코레이터마다 각자 재계산 (`CodeBlockDecorator`, `CustomSymbolDecorator` 등) | §3.4.2 의 **직접 동기.** 커스텀 심볼 개수 제한이 없어 심볼이 늘수록 비용도 늘어남 |
