# Advanced Rendering & Memory Optimization Strategy (향후 과제)

본 문서는 Devoras가 향후 **3D Freeform 뷰(Architecture View), 고성능 스케줄러, 특화 문서(TODO 등)**와 같이 무거운 렌더링을 요구하는 기능을 도입할 때 발생할 수 있는 **Webview 메모리 과점유 문제**를 선제적으로 방어하기 위한 최적화 아키텍처 기획안입니다.

## 1. 배경 및 필요성
현재 마크다운 에디터와 마인드맵(ReactFlow) 렌더링만으로도 탭 하나당 약 100MB 추가 메모리가 점유됩니다. 향후 WebGL 기반의 3D 뷰나 복잡한 스케줄러 DOM이 마운트되면, 메인 Webview(WKWebView/WebView2)의 힙(Heap) 메모리가 급증하여 앱이 느려지거나 OOM(Out of Memory)으로 강제 종료될 위험이 존재합니다. 이를 방지하기 위한 정교한 메모리 라이프사이클 관리가 필요합니다.

---

## 2. 핵심 최적화 전략

### 2.1. LRU 기반의 뷰 캐싱 및 동적 언마운트 (Memory Lifecycle)
사용자가 여러 탭(문서, 3D 뷰 등)을 띄워둘 때 모든 뷰를 메모리에 유지하지 않습니다.
- **Lazy Rendering:** 탭이 활성화되는 시점(필요한 시점)에만 실제 DOM과 WebGL 컨텍스트를 마운트합니다.
- **Time-to-Live (TTL) 캐싱:** 비활성화된 탭은 화면에서 숨김(`display: none`) 처리하여 렌더링 상태를 유지하되, **일정 시간(예: 5분) 이상 접근하지 않으면 해당 컴포넌트를 완전히 파괴(Unmount)**시켜 메모리를 반환(Garbage Collection)합니다.
- 다시 해당 탭에 접근하면 저장된 직렬화 데이터(Zustand Store)를 바탕으로 뷰를 재구성합니다.

### 2.2. 연산 스레드 분리 (Web Worker & Rust Offloading)
메인 UI 스레드(렌더러 프로세스)가 멈추는 프레임 드랍을 막기 위해 무거운 연산을 격리합니다.
- **Web Worker 도입:** 3D 좌표 계산, 복잡한 스케줄러 알고리즘, 거대 마크다운 파싱 등은 메인 스레드가 아닌 브라우저 백그라운드 스레드(Web Worker)로 넘겨 병렬 처리합니다.
- **Rust 위임 (Tauri IPC):** 디스크 I/O가 수반되는 거대한 노드 데이터 연산은 Web Worker 대신 Tauri Backend(Rust)에서 직접 연산한 뒤, 필요한 결과값(View Model)만 프론트엔드로 전달하여 JS 메모리 점유 자체를 최소화합니다.

### 2.3. 다중 웹뷰 (Multi-Webview) 분리 아키텍처
특히 3D Freeform 뷰와 같이 WebGL 리소스를 대량으로 소모하는 기능의 경우:
- 메인 에디터 창과 같은 Webview를 공유하면, 3D 뷰의 메모리 누수가 에디터의 버벅임으로 직결됩니다.
- **Tauri Child Webview:** 3D 뷰 전용의 투명한 자식 웹뷰(또는 별도 윈도우)를 생성하여 **프로세스를 물리적으로 분리**하는 방식을 고려합니다. 3D 뷰를 닫으면 해당 웹뷰 프로세스 자체를 Kill하여 메모리를 OS에 100% 즉각 반환할 수 있습니다.

### 2.4. DOM 가상화 (Virtualization)
- 무한 스크롤이 가능한 TODO 리스트나 스케줄러 타임라인의 경우, 수천 개의 DOM을 한 번에 그리지 않고 화면에 보이는(Viewport) 영역의 DOM만 렌더링하는 **Virtual Rendering (예: `@tanstack/react-virtual`)** 기법을 기본 적용합니다.

---

## 3. 적용 단계 제안
1. **현재 단계:** 기존 에디터 및 ReactFlow 탭 전환 시 Unmount를 방지해 빠른 전환을 보장하되, 열려있는 탭 갯수에 제한을 두거나 가벼운 캐싱만 적용.
2. **고도화 단계 (3D 뷰 추가 시):** TTL 기반의 자동 언마운트 컴포넌트(Garbage Collector Component) 래퍼(Wrapper)를 개발하여 무거운 뷰에 우선 적용.
3. **최종 단계:** Tauri IPC와 Web Worker를 활용한 멀티 스레드/멀티 웹뷰 렌더링 파이프라인 구축.
