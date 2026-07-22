# Ticket: refactor_20260722_195402_single_block_mode_option
**Status**: TODO
**Target Release**: v0.2.9
**Date**: 2026-07-22

---

## 1. 개요 및 티켓 목표
노트별로 H1/H2 기반 블록 분할 편집(Block Slicing Mode)을 비활성화하고, 문서 전체를 하나의 통합된 에디터 블록으로 편집할 수 있는 **단일 블록 편집 모드(Single Block Mode)** 옵션과 상태 값을 추가한다.

## 2. 도입 배경 및 요구 사항
- 현재 Devoras 노트 앱은 H1(`# `) 및 H2(`## `) 헤딩을 기준으로 문서를 여러 에디터 블록(CodeMirror)으로 강제 쪼개어 제공합니다.
- 이러한 블록 구조는 마인드맵 매핑에는 유리하나, 일반적인 마크다운 마스터링이나 연속적인 문서 편집 시 잦은 블록 포커스 변경 등으로 인해 일부 사용자에게 불편함을 줄 수 있습니다.
- **요구 사항:**
  - 노트별(또는 파일별)로 블록 분할 활성화 여부를 토글할 수 있는 상태 값을 추가합니다.
  - 이 옵션이 켜진 경우(단일 블록 모드), 슬라이싱 처리를 생략하고 전체 본문을 하나의 에디터에 담아 편집합니다.
  - 에디터는 단일 블록이 되더라도, 우측 마인드맵 캔버스(`MindView`)는 마크다운 헤딩 계층 구조를 기존 파서(`parseMarkdown`)로 파싱하여 **실시간 렌더링 및 동기화를 정상적으로 유지**해야 합니다.

## 3. 설계 및 구현 상세

### A. 상태 모델 확장
* **메타데이터 저장 구조 확장:** 
  * 노트의 단일 블록 설정 상태는 워크스페이스 메타데이터 파일(`.devoras/spatial.json`)에 파일 경로별 설정 정보로 영속화하여 관리합니다.
  * 예시 저장 형식:
    ```json
    {
      "filesConfig": {
        "/path/to/file.md": {
          "disableBlockSlicing": true
        }
      }
    }
    ```
* **documentStore 확장 (`entities/document/model/store.ts`):**
  * `disableBlockSlicingMap: Record<string, boolean>` 상태값 추가.
  * 파일 로드 시 (`loadFile`), 메타데이터 파일에서 현재 파일의 `disableBlockSlicing` 여부를 함께 로드하여 반영합니다.
  * 상태 토글 액션 `toggleBlockSlicing(filePath: string): Promise<void>` 추가 및 변경 사항 메타데이터 파일에 즉시 영속화 처리.

### B. blockStore 슬라이싱 로직 가드 (`entities/block/model/store.ts`)
* `setBlocksFromContent` 메서드를 수정하여 `disableBlockSlicing` 상태 여부를 확인합니다:
  ```typescript
  setBlocksFromContent: (content, disableBlockSlicing = false) => {
    if (disableBlockSlicing) {
      // 슬라이싱을 건너뛰고 전체 텍스트를 하나의 블록으로 설정
      const singleBlock: EditorBlock = {
        id: 'single-root-block', // 고정 ID 혹은 정준 키
        content: content
      };
      set({ blocks: [singleBlock], activeBlockId: 'single-root-block' });
      return;
    }
    // ... 기존 H1/H2 슬라이싱 알고리즘 수행
  }
  ```

### C. UI 변경 사항
* **에디터 상단 타이틀 바 (`WorkspacePage.tsx` L87~105):**
  * 현재 열려 있는 문서의 이름 옆 또는 저장 버튼 부근에 단일 블록 편집 모드를 토글할 수 있는 스위치/아이콘 버튼(예: "단일 에디터로 보기" / "블록 분할 편집")을 배치합니다.
  * 모드 전환 시, 스토어 액션을 호출하여 상태를 반전시키고, 에디터의 블록 구성을 즉시 갱신(`setBlocksFromContent`)합니다.

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [fs.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/api/fs.ts) (메타데이터 읽기/쓰기 인터페이스 필요 시 보완)
  - [document/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts)
  - [block/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)
  - [WorkspacePage.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/pages/WorkspacePage/WorkspacePage.tsx)
