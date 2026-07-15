# Feature Ticket: 2. 에디터 툴바 및 이미지 첨부
**Status**: PLANNED
**Target Release**: v0.3.0
**Priority**: High
**Date**: 2026-07-15

---

## 1. 개요 및 기능 목표
마크다운 문법을 모르는 사용자도 쉽게 편집할 수 있도록 에디터 상단/인라인 툴바를 제공하고, 문서 내 드래그 앤 드롭 및 클립보드 붙여넣기를 통한 이미지 자동 첨부 기능을 구현한다.

## 2. 요구 사항 및 유스케이스
- **서식 툴바**: 볼드(`**`), 이탤릭(`*`), 취소선(`~~`), 링크, 코드 블록, 표(Table) 등을 버튼 클릭 한 번으로 선택 영역에 씌워주는 인라인/상단 툴바 지원.
- **이미지 붙여넣기(Paste)**: 클립보드에 복사된 이미지를 에디터에 `Cmd+V` 할 때 자동으로 로컬 워크스페이스 내 자산 폴더(예: `assets/images/`)에 파일로 저장하고, 마크다운 이미지 태그(`![image](assets/images/filename.png)`) 삽입.
- **드래그 앤 드롭**: 외부 이미지 파일을 에디터 블록으로 끌어다 놓으면 동일하게 복사 저장 및 마크다운 링크 매핑 수행.

## 3. 기술적 구현 설계 (FSD 아키텍처)
- **Shared Layer (`fs.ts`)**:
  - `saveImageAsset(workspacePath: string, fileData: Uint8Array, extension: string): Promise<string>` 구현.
- **Widgets Layer (`BlockEditor.tsx`)**:
  - CodeMirror의 드롭 핸들러(Drop Handler) 및 붙여넣기 핸들러(Paste Handler) 커스텀 확장.
  - 마크다운 파서 및 위젯 툴바 UI 배치. 현재 포커스된 CodeMirror 인스턴스에 명령(Command) 전달 구조 구축.

## 4. 작업 체크리스트
- [ ] 워크스페이스 내 로컬 자산(Assets) 디렉터리 설계 및 자동 생성 구현
- [ ] 클립보드 이미지 바이너리 추출 및 파일 저장용 Tauri 플러그인 연동
- [ ] CodeMirror Drop/Paste Event Listener 구현 및 마크다운 태그 인라인 삽입
- [ ] 볼드, 이탤릭, 표 생성 등 서식 툴바 컴포넌트 추가 및 키 매핑
- [ ] 상대 경로 이미지의 MindView/BlockEditor 상 시각화 미리보기 연동
