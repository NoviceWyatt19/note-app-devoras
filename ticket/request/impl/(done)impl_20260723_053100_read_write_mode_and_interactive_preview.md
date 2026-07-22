# [Implement] Read/Write Mode 전환 및 대화형 Read Mode (블록 이동 & 하이라이트 서식) 구현

## 🎯 1. 기능 개요 및 목적
* **설명:** 에디터에 Write Mode(자유 편집 모드)와 Read Mode(대화형 읽기/강조 모드) 전환 스위치를 제공하여, 작성된 노트를 편안하게 읽으면서 중요한 텍스트 영역에 형광펜(Highlight)이나 볼드/취소선을 마우스 드래그만으로 적용(대화형 서식 주입)하고, HTML 카드로 렌더링된 블록을 마우스 드래그 앤 드롭하여 직관적으로 본문 블록 순서를 재배치할 수 있는 독서 및 문서 가공 사용자 경험을 제공합니다.

## 📋 2. 요구 사항 (Requirements)
* [ ] **View Mode 스위치 및 상태 관리**: `entities/document/model/store.ts` (또는 UI 관련 스토어)에 `viewMode: 'write' | 'read'` 상태와 토글 액션을 추가하고, 에디터 타이틀바 영역에 모드 전환 버튼(Edit / Eye 아이콘)을 배치합니다.
* [ ] **Write Mode (자유 편집)**: 기존의 H1/H2 기반 블록 분할 에디터, 서식 툴바, 로컬 이미지 drag/drop 및 paste 자동 저장 기능이 정상적으로 유지 및 동작하도록 보장합니다.
* [ ] **Read Mode - 마크다운 및 이미지 완전 렌더링**: Read Mode 전환 시 개별 블록의 마크다운 서식(표, 코드 블록, 볼드, 이탤릭, 취소선, 하이라이트)과 로컬 자산 이미지(`assets/images/...`)를 깔끔하게 HTML로 렌더링해주는 프리뷰 뷰(ReadView)를 노출합니다.
* [ ] **Read Mode - 블록 드래그 순서 재배치**: HTML로 렌더링된 카드 블록을 마우스 드래그 앤 드롭하여 상하 위치를 변경할 때, `blockStore`에 배열 순서를 반영하고 변경된 문서를 즉시 파일에 저장합니다.
* [ ] **Read Mode - 선택 영역 대화형 서식**: 마우스 드래그로 프리뷰 내 텍스트 선택 시 플로팅 서식 툴바를 띄우고, Bold(`**`), Italic(`*`), Strikethrough(`~~`), Highlight(`==`) 적용 시 원본 마크다운 블록의 해당 오프셋 텍스트를 파싱하여 서식을 주입합니다.
* [ ] **더블클릭 Write Mode 쾌속 전환**: Read Mode의 특정 카드 블록을 더블클릭하면 즉시 Write Mode로 전환되며, 해당 블록의 해당하는 커서 위치로 포커스가 전이되도록 연동합니다.

## 🔄 3. 데이터 흐름 (Input & Output)
| 구분 | 타입 / 포맷 | 설명 |
| :--- | :--- | :--- |
| **Input (입력)** | `viewMode: 'write' \| 'read'` / `Drag/Drop Events` / `Mouse Selection` | UI 모드 전환 요청, 블록 드래그 앤 드롭 이동 정보 및 텍스트 마우스 드래그 선택 범위 |
| **Output (출력)** | `Rendered HTML View` / `Updated Markdown Document` | 모드에 맞게 렌더링된 프리뷰 화면 및 순서가 바뀌거나 서식이 주입된 최종 마크다운 본문 |

## ⚙️ 4. 내부 동작 및 비즈니스 로직 (Internal Logic)
* **단계별 동작:**
  1. **모드 스위칭**: 사용자가 모드를 변경하면 `viewMode` 상태가 갱신되고, 에디터 영역이 `BlockEditor` 컴포넌트에서 전체 프리뷰를 그리는 `ReadView` 컴포넌트로 마운트 교체됩니다.
  2. **블록 드래그 앤 드롭 재정렬**: 카드 블록의 드래그 완료 시, 이동 전/후 인덱스를 감지하여 `blockStore.reorderBlocks(fromIndex, toIndex)`를 실행합니다. 새롭게 정렬된 블록들의 content를 개행(`\n`)으로 결합하여 원본 파일을 동기적으로 갱신합니다.
  3. **대화형 선택 영역 서식 주입**: `onMouseUp` 이벤트를 감지하여 브라우저의 `window.getSelection()` 정보를 획득합니다. 선택된 DOM 노드의 위치와 offset을 기반으로 타깃 블록과 텍스트 상대 오프셋을 역산한 후, 원본 마크다운 본문의 텍스트에 서식 감싸기 마킹(`==Highlight==` 등)을 수행하여 상태를 갱신합니다.
  4. **더블클릭 포커스 인계**: Read Mode의 렌더링된 카드 블록 더블클릭 이벤트 발생 시, 해당 블록의 ID를 `activeBlockId`로 설정하고 `viewMode`를 `write`로 반전시킵니다.
* **예외 처리:**
  - 빈 텍스트 영역 드래그나 블록 경계를 벗어난 드래그 서식 지정 시 플로팅 툴바 노출을 무시합니다.
  - 파일 정렬이나 저장 실패 시, 이전 상태로 블록 순서를 롤백하고 사용자에게 경고 알림(Toast)을 띄웁니다.

## 🚀 5. 다음 단계 (Next Steps)
* [ ] `entities/document/model/store.ts` 내에 `viewMode` 상태 및 토글 액션 설계
* [ ] `project/src/widgets/BlockEditor/ui/ReadView.tsx` 컴포넌트 신규 구현 및 마크다운/자산 렌더링 파이프라인 구축
* [ ] HTML5 Drag and Drop API 또는 `framer-motion`/`dnd-kit`을 활용한 카드 드래그 앤 드롭 순서 변경 컴포넌트 개발
* [ ] `onMouseUp` 및 selection 좌표 매핑 기반 플로팅 툴바 및 서식 인라인 삽입 알고리즘 구현
* [ ] 더블클릭 시 에디터 포커스 및 모드 변경 이벤트 핸들러 바인딩
