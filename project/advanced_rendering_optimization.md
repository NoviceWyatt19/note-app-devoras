# Advanced Rendering & Memory Optimization Strategy

## 🚀 개요 (Overview)
Devoras Design은 추후 3D Freeform 캔버스, 무한 스케줄러, TODO 특화 문서 등 무거운 컴포넌트(Heavy Views)를 탭으로 여러 개 띄울 수 있는 확장성을 목표로 합니다.
Tauri (WKWebView/WebView2) 환경에서는 WebView의 Heap Memory 한계로 인해 다수의 무거운 뷰가 마운트된 상태를 유지하면 OOM(Out Of Memory) 크래시가 발생하거나 퍼포먼스가 심각하게 저하될 수 있습니다.

본 문서는 이러한 병목을 방지하고 애플리케이션의 메모리를 최적화하기 위한 **고급 렌더링 최적화(Advanced Rendering Optimization)** 전략을 정의합니다.

---

## 🛠 주요 최적화 전략 (Core Strategies)

### 1. LRU (Least Recently Used) 기반 뷰 언마운트 & 캐싱
활성화된(Active) 탭 이외의 백그라운드 탭들이 무거운 DOM 노드나 WebGL 컨텍스트를 점유하지 않도록 관리합니다.
- **TTL (Time-To-Live) 적용:** 탭이 백그라운드로 전환된 지 일정 시간(예: 5분)이 지나면 해당 탭의 실제 React 컴포넌트를 DOM에서 언마운트(Unmount)합니다.
- **상태 보존 (State Snapshot):** 컴포넌트를 내리기 직전, 스크롤 위치, 확대/축소 배율(Zoom Level), 3D 카메라 위치 등의 View State를 Zustand 스토어나 메모리에 JSON 형태로 스냅샷 캐싱합니다.
- **Lazy Re-mount:** 사용자가 해당 탭으로 다시 돌아오면 캐싱된 상태를 기반으로 즉시 리렌더링하여 사용자는 탭이 꺼졌었다는 사실을 인지하지 못하게 합니다.

### 2. 무거운 연산의 Web Worker 스레드 분리
3D 뷰의 지오메트리 연산이나 거대한 마인드맵의 레이아웃 계산(e.g., d3-force, dagre)은 메인 렌더링 스레드(UI 스레드)를 블로킹하여 드롭 프레임(Jank)을 유발합니다.
- **연산 스레드 분리:** 레이아웃 연산, 대규모 데이터 파싱 등의 무거운 작업은 `Web Worker`로 오프로드합니다.
- **비동기 렌더링 파이프라인:** Worker에서 연산이 완료된 결과값(좌표, 구조체)만 메인 스레드로 넘겨 받아 Three.js나 React Flow 객체에 적용합니다.

### 3. Child WebView / IFRAME 분리 (Tauri 2.x 아키텍처 한정)
단일 WebView의 메모리 한계(통상 1.5GB ~ 2GB)를 돌파하기 위한 궁극적인 방법입니다.
- **Tauri Multi-Window 연동:** 극도로 무거운 3D 캔버스나 독립적인 엔진이 필요한 뷰의 경우, 숨겨진(Hidden) Tauri Child Window나 IFrame을 띄워서 프로세스 메모리를 분리하는 아키텍처를 검토합니다.
- **포스트 메시징 (IPC):** 메인 에디터와의 상태 동기화는 Tauri IPC (`invoke`, `emit`)를 통해 단방향 이벤트 스트림으로 통신합니다.

### 4. DOM Virtualization (가상화) 및 WebGL 최적화
- **리스트 가상화:** 수만 개의 노드가 있는 마인드맵이나 스케줄러의 경우, 화면(Viewport)에 보이는 영역(Frustum Culling / Bounding Box) 내의 노드만 DOM에 마운트합니다.
- **WebGL Geometry Instancing:** 3D 노드 렌더링 시 동일한 모델/재질을 공유하는 수많은 개체는 InstancedMesh를 사용하여 드로우 콜(Draw Call)을 1회로 최소화합니다.

---

## 📅 구현 로드맵 (Implementation Roadmap)

1. **Phase 1: 상태 스냅샷 아키텍처 도입**
   - 탭 전환 시 컴포넌트의 로컬 상태(Scroll, Zoom, Selection)를 전역 스토어에 임시 저장하는 인터페이스 구현.
2. **Phase 2: TTL 기반 언마운터 개발**
   - 백그라운드 탭 감지 및 5분 경과 시 컴포넌트를 더미(Dummy) 컨테이너로 교체하는 로직 적용.
3. **Phase 3: Web Worker 파이프라인 구축**
   - 마크다운 파서 및 대규모 노드 연산 로직을 Worker 단위로 모듈화.
4. **Phase 4: 3D 뷰 적용 및 검증**
   - 3D Freeform 뷰 도입 시점과 맞물려 메모리 풋프린트 모니터링 및 최적화 진행.
