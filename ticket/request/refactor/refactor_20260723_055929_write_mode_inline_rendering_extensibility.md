# Ticket: refactor_20260723_055929_write_mode_inline_rendering_extensibility
**Status**: TODO
**Target Release**: v0.3.0
**Date**: 2026-07-23

---

## 1. 개요 및 티켓 목표
Write Mode(자유 편집 모드) 에디터 내에서 특수 효과 문법(볼드, 이탤릭, 취소선, 리스트, 체크박스, 코드 블록, 인라인 코드, 라텍스 등)을 인라인으로 직접 렌더링(WYSIWYG-like)하여 편집 중 가독성을 극대화한다.
특히, 향후 하이라이팅, 접기 토글, 커스텀 심볼 등 다양한 추가 문법 요구사항이 들어왔을 때 핵심 에디터 모듈을 변경하지 않고 플러그인 형태로 조립해나갈 수 있는 **확장 가능한 마크다운 데코레이션 아키텍처(Markdown Decoration Extension System)**를 구축한다.

## 2. 배경 및 설계 요구사항

### A. 가독성 개선의 필요성
- 현재 Write Mode는 순수 마크다운 문자열 위주로만 표현되어 문장 구조와 서식의 직관적 파악이 어렵습니다.
- 사용자가 Read Mode로 전환하지 않더라도 Write Mode 내에서 주요 마킹과 서식이 시각적으로 표현되어야 합니다.

### B. 확장성 중심의 아키텍처 설계
- CodeMirror 6의 `Decoration`(Widget, Mark, Replace) 및 `ViewPlugin`/`StateField`를 단순 나열식으로 코딩하면 파일 크기가 비대해지고 결합도가 지나치게 높아집니다.
- **설계 방향:**
  - 중앙의 오케스트레이터(Orchestrator Plugin)가 존재하고, 개별 문법을 파싱·렌더링하는 데코레이터들이 이 플러그인에 등록/조립되는 구조를 채택합니다.
  - 새로운 문법(예: 하이라이트 `==`, 접기 토글, 커스텀 심볼)이 추가될 때, 매니저 클래스에 해당 데코레이터 구현체만 배열에 추가 등록하면 바로 연동되도록 설계합니다.

## 3. 구현 상세 설계

### A. 데코레이터 인터페이스 정의 (`shared/lib/editor/`)
* 개별 특수 문법 처리기가 구현해야 할 공통 인터페이스 `SyntaxDecorator`를 정의합니다:
  ```typescript
  import { EditorView, DecorationSet } from '@codemirror/view';

  export interface SyntaxDecorator {
    name: string;
    // 변경 범위(from ~ to) 내에서 문법을 파싱하고 시각 효과 DecorationSet을 반환
    createDecorations(view: EditorView, from: number, to: number): DecorationSet;
  }
  ```

### B. 중앙 오케스트레이터 플러그인 구현
* `ViewPlugin` 또는 `StateField`를 활용하여 등록된 모든 `SyntaxDecorator` 인스턴스 리스트를 관리합니다.
* 뷰 업데이트(`updateListener` 또는 `update` 데코레이션 빌더) 발생 시, 변경이 발생한 뷰포트 내의 범위를 모든 데코레이터가 각각 스캔하도록 명령합니다.
* 수집된 개별 `DecorationSet`을 CodeMirror의 `RangeSet.join()` 또는 `RangeSet.of()`를 활용해 충돌 없이 안전하게 병합(Merge)하여 에디터 뷰에 반영합니다.

### C. 주요 특수 효과 데코레이터 1차 구현 대상
1. **BoldItalicDecorator**: `**bold**`, `*italic*` 영역을 각각 `cm-strong`, `cm-emphasis` 데코레이션으로 랩핑하고, 편집 커서가 텍스트 위에 있지 않을 때는 앞뒤 마크다운 프리픽스 기호(`*`, `**`)를 `Decoration.replace`로 숨겨 깔끔하게 보여줍니다.
2. **StrikethroughDecorator**: `~~strikethrough~~` 구문을 감지해 `line-through` 스타일의 Mark Decoration을 입힙니다.
3. **CheckboxDecorator**: `- [ ]` 및 `- [x]` 마크다운 문법을 HTML checkbox 요소(`Decoration.widget`)로 대체하여 에디터 내부에서 마우스 클릭으로도 토글 동작이 가능하도록 시각화합니다.
4. **CodeBlockDecorator**: 코드 펜스 내부 및 인라인 코드(`` `code` ``) 영역에 별도의 폰트 패밀리, 배경색상 패딩 데코레이션을 추가합니다.
5. **LatexDecorator**: `$...$` 및 `$$...$$` 수식 마크다운 구문을 KaTeX 또는 MathJax 라이브러리와 연동하여 실시간으로 렌더링된 수식 뷰 위젯(`Decoration.widget`)으로 교체 표현합니다.

## 4. 관련 파일 변경 목록
- **NEW**:
  - `project/src/shared/lib/editor/decorators/types.ts` (인터페이스 선언)
  - `project/src/shared/lib/editor/decorators/orchestrator.ts` (중앙 플러그인 매니저)
  - `project/src/shared/lib/editor/decorators/impl/` (각 데코레이터 구현 클래스 폴더)
- **MODIFY**:
  - [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx) (생성된 데코레이션 플러그인을 CodeMirror extensions 배열에 추가)
