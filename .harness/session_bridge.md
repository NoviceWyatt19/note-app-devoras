# Session Bridge (세션 인수인계) — v0.5.2

## 이번 세션 완수 작업
- **BUG-20260810-04 완료**: Cursor-aware Decorators 전면 적용
  - `CodeBlockDecorator`: 인라인 코드 backtick 커서 진입 시 원시 마크다운 노출 + marker hide/reveal
  - `StrikethroughDecorator`: `~~` 마커 hide/reveal + `inclusive: false`
  - `CheckboxDecorator`: 활성 줄(커서 있는 줄) replace 위젯 해제
  - `BoldItalicDecorator`, `HyperlinkDecorator`: `inclusive: false` 추가
- **BUG-20260810-03 완료**: `startWindowDrag` 제거로 윈도우 무한 숨김 해결
- **FEAT-20260810-03 완료**: White Flash 제거 (Start Hidden & Reveal)
- **BUG-20260810-02 완료**: IME True Pass-through (텍스트 증식 버그 수정)

## 다음 세션 전달사항

### Cursor-aware 검증 필요 (수동 테스트)
`pnpm tauri:dev` 실행 후:
1. `**bold**` 안에 커서 이동 → `**` 마커가 보여야 함
2. 인라인 코드 `` `code` `` 안 클릭 → 백틱이 보여야 함
3. `- [ ]` 줄에 커서 → 체크박스가 사라지고 원시 마크다운이 보여야 함
4. `~~취소선~~` 밖에서 커서 이동 → 취소선 스타일, 안에서는 `~~` 노출
5. 인라인 코드 바깥에 붙어서 타이핑 → cm-inline-code span이 확장되지 않아야 함

### 이미지 렌더링 403 문제 (미해결, 우선순위 높음)
- `asset://` 프로토콜 403 오류 지속
- 다음 세션에서 `base64 data URL` 방식 전환 검토 필요

### 다음 우선순위 작업
1. `FEATURE-TOOLBAR`: 마크다운 서식 툴바 컴포넌트 확장
2. `FEATURE-CONFIG-UI`: WorkspaceConfig 설정 UI 노출 및 영속성 연동
3. 이미지 렌더링 403 해결