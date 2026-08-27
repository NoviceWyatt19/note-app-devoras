# Devoras Design - Function Roadmap

## 🚀 개요 (Overview)
이 문서는 Devoras Design 프로젝트의 기능 구현 스텝과 현재 진행 위치를 보여주는 로드맵입니다.
현재 프로젝트는 **MVP Phase 2**의 주요 기능 구현을 완료했으며, 새로운 플랫폼(Claude Code)으로의 이전(Handover)을 준비 중인 상태입니다.

---

## 🎯 Phase 1: MVP 기초 및 구조 셋업 (✅ 완료)
- **[✅]** FSD (Feature-Sliced Design) 아키텍처 스캐폴딩
- **[✅]** Tauri 2 + React 18 + Vite 기반 데스크톱 앱 셋업
- **[✅]** H1/H2 블록 기반 마크다운 슬라이싱 (BlockEditor)
- **[✅]** 공간 좌표(spatial metadata) 및 인메모리 파서(`parser.ts`) 구현

## 🎯 Phase 2: 핵심 에디터 기능 및 UX 개선 (✅ 완료)
- **[✅]** 에디터 툴바 및 인라인 이미지 렌더링
- **[✅]** 읽기 모드(Read Mode) 및 쓰기 모드(Write Mode) 전환
- **[✅]** 폰트 사이즈 제어 및 동적 UI 반영
- **[✅]** Decorator Orchestrator 아키텍처 도입 (마크다운 구문 강조)
- **[✅]** 한글 IME 입력 간섭 해결 (3중 방어 래치 시스템)

## 🎯 Phase 3: 파일 시스템 및 워크스페이스 확장 (✅ 완료)
- **[✅]** 워크스페이스 열기 (`Cmd+O` 및 파일 메뉴)
- **[✅]** 트리 기반 파일 탐색기 및 폴더/파일 CRUD
- **[✅]** 파일 드래그 앤 드롭 이동 (Custom Pointer Events 기반 구현) 및 복사/붙여넣기
- **[✅]** ERD Designer (`@xyflow/react`) 네이티브 통합
- **[✅]** Splash Screen 도입 및 Tauri 초기 로드 화면 Deadlock 해소
- **[✅]** 단축키 UX 개선 (`Cmd+W` 탭 닫기 전용, `Cmd+Q` 앱 종료 분리, `Cmd+S` 애니메이션)

## 📍 현재 위치 (You are here)
> **플랫폼 이전 완료 및 메모리 최적화 우선순위 상향 (현재 버전: 0.8.2)**
> - Phase 3.5의 **런처 및 앱 설정 시스템** 등 코어 UX 기반 구축 완료.
> - 에디터 마진 조절, 폰트 동기화 등 개선 완료 (v0.8.2)
> - **[긴급 수정]** 구조적 메모리 누수(300~400MB) 해결을 위해 Phase 4의 아키텍처 개편을 먼저 당겨서 진행합니다.
> - 다음 단계로 **프론트엔드 렌더링/메모리 최적화 (Sprint 3)** 착수 예정.

## 🏃 Phase 3.5: 핵심 UX 확장 및 아키텍처 재정비 (진행 중)
*(기존 기획서 및 긴급 성능 최적화)*
- **[x]** 시작 시 폴더 선택 런처 (최근 워크스페이스 목록, 즐겨찾기 핀 고정) — *참조: `functions/8_launcher_on_startup.md`*
- **[x]** 앱 설정 시스템 (폰트, 자동 저장, 줄 바꿈, 마인드맵 노드 스타일 등 영구 저장 및 실시간 핫 갱신) — *참조: `functions/5_app_settings.md`*
- **[ ]** **[New Sprint 3] 프론트엔드 렌더링 아키텍처 최적화** (다중 CodeMirror 인스턴스 통합/가상화, Base64 이미지 렌더링 폐기 및 Tauri Asset Protocol 도입)
- **[ ]** YAML 기반 커스텀 테마 및 다크/라이트 모드 전환 (실시간 핫 리로드) — *참조: `functions/6_theme_yaml_custom.md`*
- **[ ]** 워크스페이스 전역 검색 (파일명 + 본문 실시간 검색, 결과 하이라이팅, 점프 네비게이션) — *참조: `functions/4_global_search.md`*
- **[ ]** 다중 파일 탭 지원 및 에디터/마인드맵 스플릿 뷰 (가로/세로 분할) — *참조: `functions/3_tabs_and_split_view.md`*

## 🏃 Phase 4: 성능 최적화 및 렌더링 아키텍처 (⏳ 예정)
*(3계층 하이브리드 아키텍처 기반. 상세 구현 스텝은 `architecture_stages.md` 참조)*
- **[ ]** Tier 1: Rust 백엔드 상태 이관 (AST 파서, 그래프 연산, 파일 인덱싱)
- **[ ]** Tier 2: 빈번한 뷰(에디터/마인드맵/ERD) OffscreenCanvas 전환 및 RAF Pause/Resume
- **[ ]** Tier 3: GPU 집약 뷰(3D 아키텍처) Lazy Multi-Window 격리
- **[ ]** `documentStore` 전역 상태 충돌 방지를 위한 탭별 로컬 캐시 도입 (Critical)

## 🏃 Phase 5: 리팩토링 및 기술 부채 상환 (⏳ 예정)
*(상세 내용은 `code_review.md` 참조)*
- **[ ]** `BlockEditor` 입력 시 O(N) 연산 병목 최적화
- **[ ]** `ReadView` 중첩 블록 포맷팅 버그(`applyFormat` 트리 순회) 수정
- **[ ]** 파일 시스템 스코프 전역 키보드 이벤트 간섭 해결

## 🏃 Phase 6: 고급 뷰 및 사용자 정의 기능 (⏳ 예정)
- **[ ]** 마인드 뷰 캔버스 미니맵 및 자유형 노드 추가
- **[ ]** 마인드 뷰 중첩 컨테이너(Nested Box) 모드 — H1 루트 계층 파싱 기반 아키텍처/모듈 포섭 뷰 — *참조: `functions/9_mind_view_nested_container.md`*
- **[ ]** 아키텍처 뷰용 3D Freeform 캔버스 도입
  - *유즈케이스 시각화*: 흐름에 따라 레이어 간 노드 외곽선 및 연결선(Edge) 순차 하이라이팅 기능
- **[ ]** 탭 드래그 분리(Tear-off) 및 독립 서브 윈도우 생성 (Tauri Multi-Window IPC 동기화) — *참조: `functions/7_tab_tearoff_new_window.md`*
- **[ ]** 다단 레이아웃 (Multi-column) 병렬 블록 파싱 (`|| parallel-left`)
- **[ ]** 명령어 시스템 (Slash Command 기반 `\:` 명령어 자동완성 팝업)
- **[ ]** 확장 마크다운 이미지 문법 (`![alt](url || left 300px)` 크기 및 정렬 제어)
- **[ ]** 이미지 상세 뷰어 (사이드 탭에서 이미지 줌인/줌아웃 및 패닝 지원) — *참조: `functions/image_side_view.pdf`*
- **[ ]** 애플리케이션 사용자 설정 파일(`.devoras/settings.json`) 저장 연동
- **[ ]** 단일 블록 포커스 에디팅 (Zen Mode)
- **[~]** 인라인 스마트 커스텀 심볼 (Inline Smart Custom Symbols)
  - *선구현 완료*: 내장 화살표 심볼 `->` `=>` 를 Read/Write Mode 양쪽에서 인라인 SVG 로 렌더링.
    심볼 정의는 `shared/lib/markdown/customSymbols.ts` 레지스트리가 단독 소유하며,
    `registerCustomSymbols()` 로 사용자 정의 심볼을 주입할 수 있게 열어 두었다.
  - 사용자가 심볼의 특성·기능·의미를 직접 정의하고, 에디터 내에서 미니멀한 위젯(뱃지)으로 렌더링
  - 커서를 일정 시간 호버링하면 정의된 의미가 툴팁으로 표시 (잊어버림 방지)
  - *구현 전제조건:* (1) 인터랙티브 상태 변경 가능 (클릭 시 토글 등), (2) 워크스페이스 전역 쿼리 시스템(PKM 메타데이터 Aggregation)이 준비될 때 재진행
  - *참조:* `functions/custom_symbol.pdf`

