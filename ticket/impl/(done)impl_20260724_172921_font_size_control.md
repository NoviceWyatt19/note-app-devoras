# [Implement] 편집기 글꼴 크기 조절

## 🎯 1. 기능 개요 및 목적
* **설명:** 사용자가 툴바에서 글꼴 크기를 작게 또는 크게 조절하여 읽기와 편집 환경을 자신의 화면 및 선호에 맞출 수 있게 한다. 문서 마크다운 원문과 기존 편집 동작은 변경하지 않는다.

## 📋 2. 요구 사항 (Requirements)
* [x] 모든 모드의 툴바에 글꼴 크기 축소/확대 버튼과 현재 px 값을 표시한다.
* [x] 글꼴 크기는 11px~22px 범위에서 1px 단위로 조절한다.
* [x] 설정값은 Write Mode(CodeMirror)와 Read Mode 프리뷰에 동일하게 적용한다.
* [x] 크기 변경은 문서 내용, 저장 상태 및 블록 구조를 변경하지 않는다.

## 🔄 3. 데이터 흐름 (Input & Output)
| 구분 | 타입 / 포맷 | 설명 |
| :--- | :--- | :--- |
| **Input (입력)** | Toolbar button click | 축소/확대 버튼 클릭으로 `-1` 또는 `+1` 값을 전달한다. |
| **Output (출력)** | UI State / CSS custom property | Zustand의 `fontSize` 상태와 `--editor-font-size`를 갱신해 두 화면의 텍스트 크기를 렌더링한다. |

## ⚙️ 4. 내부 동작 및 비즈니스 로직 (Internal Logic)
* **단계별 동작:**
  1. 툴바 버튼이 `adjustFontSize(delta)`를 호출한다.
  2. Document store가 범위를 11~22px로 제한한 글꼴 크기 상태를 갱신한다.
  3. BlockEditor 루트가 CSS 변수로 값을 전달하고 CodeMirror 및 ReadView 스타일이 이를 상속한다.
* **예외 처리:** 최소/최대값에서 추가 축소 또는 확대 요청은 범위 값으로 유지한다.

## 🚀 5. 다음 단계 (Next Steps)
* [x] Document store 및 툴바 UI 구현
* [x] Write/Read Mode 스타일 연동
* [ ] 사용자 설정 영속화는 별도 설정 기능 티켓에서 검토
