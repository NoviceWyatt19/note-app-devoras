# [Project] Devoras v0.3.0 - 에디터 서식 툴바 및 이미지 자동 첨부 구현 완료

## 🗺️ 1. 프로젝트 현재 상황 개요
* **현재 마일스톤:** Devoras 데스크톱 MVP Phase 2 (v0.3.0 - 에디터 작성 경험 강화)
* **진척도:** 70% 완료 (파일 관리 `functions/1` 및 에디터 서식 툴바/로컬 이미지 첨부 `functions/2` 완성, 차기 탭 시스템 및 파서 정밀화 단계 진입)

---

## ⚖️ 2. 기존 기획 vs 현재 단계 비교

| 기능/도메인 | 기존 기획 (Plan / functions) | 현재 단계 및 구현 현황 (v0.3.0 Actual) |
| :--- | :--- | :--- |
| **에디터 서식 툴바** | 마크다운 직접 입력 위주 | `FormatToolbar` 추가 (볼드, 이탤릭, 취소선, 링크, 코드블록, 표 인라인 주입 지원) 완료 |
| **이미지 첨부** | 마크다운 외부 경로 링크 수동 작성 | `Cmd+V` 및 드래그 앤 드롭 시 `assets/images/` 자동 저장 및 `![image](assets/...)` 인라인 태그 자동 주입 완료 |
| **Tauri 자산 권한** | 기본 파일 접근 | `assetProtocol: { enable: true }` 및 `fs:allow-write-file` 권한 추가 및 빌드 통과 |
| **다중 파일 탭** | `functions/3` 계획 상태 | 단일 파일 편집 상태 유지 (다음 마일스톤 `functions/3`에서 다중 탭 스토어 확장 예정) |

---

## ⚠️ 3. 기획 상의 차이점 및 변경 사유 (Gaps & Discrepancies)

* **이슈 항목 1: Active CodeMirror View 싱글턴 관리 도입**
  * **구현 내용**: `activeEditorView.ts` 유틸을 도입하여 포커스 이동 및 툴바 클릭 시에도 포커스를 잃지 않도록 에디터 뷰 인스턴스를 안정적으로 보존.
  * **사유**: 툴바 버튼을 클릭할 때 에디터 포커스가 풀리거나 서식이 다른 위치에 적용되는 현상 방지 (`onMouseDown e.preventDefault` 결합).
  * **영향도**: 서식 버튼 렌더링 및 텍스트 조작 안정성 향상.

* **이슈 항목 2: 비동기 이미지 첨부 후 파서 연동**
  * **구현 내용**: 이미지 drag/drop 및 paste 시 `e.preventDefault()`로 텍스트 중복 입력을 막고, `saveImageAsset` 완결 후 dispatch로 마크다운 텍스트 자동 삽입.
  * **사유**: CodeMirror 기본 붙여넣기 동작과 이미지 파일 I/O 간의 경합 방지.

---

## 📋 4. 향후 계획 및 액션 플랜

* [x] `functions/1` 파일 관리 고도화 완료 (`v0.2.12`)
* [x] `functions/2` 에디터 서식 툴바 및 로컬 이미지 자산 첨부 완료 (`v0.3.0`)
* [ ] `functions/3_tabs_and_split_view.md` 다중 파일 탭 지원 및 스플릿 뷰 수립 (`[Implement]` 티켓 준비)
* [ ] `functions/9_mind_view_nested_container.md` H1 최상위 루트-H2 메인 카드 파서 및 중첩 박스 마인드 뷰 고도화
