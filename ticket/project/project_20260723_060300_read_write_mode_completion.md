# [Project] Devoras v0.3.1 - Read/Write 모드 전환 및 대화형 ReadView 구현 완료

## 🗺️ 1. 프로젝트 현재 상황 개요
* **현재 마일스톤:** Devoras 데스크톱 MVP Phase 2 (v0.3.1 - Read/Write 뷰 스위칭 & 대화형 마크다운 카드 프리뷰 완료)
* **진척도:** 80% 완료 (에디터 툴바 `functions/2` 및 Read/Write 뷰 전환 마일스톤 완성, 차기 에디터 인라인 렌더링 리팩터링 및 다중 탭 진입 준비)

---

## ⚖️ 2. 기존 기획 vs 현재 단계 비교

| 기능/도메인 | 기존 기획 (Plan / functions) | 현재 단계 및 구현 현황 (v0.3.1 Actual) |
| :--- | :--- | :--- |
| **Read/Write Mode** | 단순 텍스트 에디팅 중심 | `viewMode` 스토어 구현 및 Edit ↔ Eye 모드 전환 툴바 UI 완료 |
| **ReadView 프리뷰** | 마인드 뷰 중심 시각화 | `marked` (v18.0.7) 파서 기반 HTML/로컬 자산 이미지 프리뷰 렌더러 구축 완료 |
| **대화형 Read Mode** | 단순 읽기 전용 뷰어 | 카드 블록 HTML5 Drag & Drop 순서 변경 (`reorderBlocks`) + 텍스트 드래그 서식 주입 + 더블클릭 포커스 스위칭 완료 |
| **Write Mode 인라인 렌더링** | CodeMirror raw text 편집 | CodeMirror 6 ViewPlugin / Mark Decoration을 통한 인라인 볼드/체크박스 라이브 스타일링 리팩터링 준비 중 (`refactor_20260723_055929`) |

---

## ⚠️ 3. 기획 상의 차이점 및 변경 사유 (Gaps & Discrepancies)

* **이슈 항목 1: 대화형 Read Mode (Interactive Reading & Formatting) 채택**
  * **구현 내용**: Read Mode에서 텍스트 직접 키보드 입력은 막되, 마우스 드래그를 통한 블록 위치 이동(`reorderBlocks`) 및 텍스트 선택 드래그 서식/하이라이트 주입 허용.
  * **사유**: 노션/오브시디안과 차별화되는 Devoras만의 독창적인 읽기 및 서식 조작 사용자 경험(UX) 제공.
  * **영향도**: 읽기 모드에서의 활용도 비약적 상승.

* **이슈 항목 2: `marked` v18 패키지 도입**
  * **구현 내용**: `package.json`에 `"marked": "^18.0.7"` 의존성을 추가하여 마크다운 프리뷰 HTML 렌더링 파이프라인 구축.
  * **사유**: 경량 고속 마크다운-HTML 파싱 처리.

---

## 📋 4. 향후 계획 및 액션 플랜

* [x] `functions/1` 파일 관리 고도화 완료 (`v0.2.12`)
* [x] `functions/2` 에디터 서식 툴바 및 로컬 이미지 자산 첨부 완료 (`v0.3.0`)
* [x] Read/Write Mode 전환 및 대화형 ReadView 렌더러 구현 완료 (`v0.3.1`)
* [ ] Write Mode CodeMirror 6 인라인 마크다운 렌더링 (Mark Decoration & Checkbox Widget) 리팩터링 (`refactor_20260723_055929`)
* [ ] `functions/3_tabs_and_split_view.md` 다중 파일 탭 지원 및 스플릿 뷰 수립
