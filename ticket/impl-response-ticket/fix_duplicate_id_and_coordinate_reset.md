# Ticket: fix_duplicate_id_and_coordinate_reset
**Status**: COMPLETED
**Target Release**: v0.1.1
**Date**: 2026-07-12

---

## 1. 개요 및 티켓 목표
프로젝트 초기 빌드 검증 후 발견된 마인드 뷰 상의 두 가지 치명적인 오류를 수정한다.
1. 동일한 텍스트를 가진 헤더(노드)가 복수로 생성될 때 React Key가 충돌하며 드래그 잔상 및 연결선 렌더링이 깨지는 오류.
2. 마크다운 편집기에서 문자를 입력(타이핑)할 때마다 마인드 맵 캔버스의 노드 좌표가 파일 주석이나 `0, 0` 기본 레이아웃으로 초기화(리셋)되는 오류.

## 2. 장애 진단 및 분석

### A. 중복 헤딩 렌더링 및 드래그 섀도우 버그
- **진단**: 동일한 부모 아래 동일한 타이틀을 가지는 헤더 노드가 파싱될 때, 중복된 ID(예: `sub-node-2/sub-sub-1`)가 생성되었습니다.
- **원인**: React 렌더링 루프 시 중복 ID를 `key`로 지정하게 되어 React Reconciliation 과정에서 오작동이 일어났습니다. 결과적으로 특정 노드를 드래그해 옮겼을 때 렌더 트리 재조정이 꼬이면서 잔상이 남고, SVG 연결선(Link) 드로잉 패스가 오버레이 중복으로 쌓여 뭉개졌습니다.

### B. 타이핑 시 노드 위치 초기화 버그
- **진단**: 에디터에서 사용자가 텍스트 수정을 시도하면 마인드 뷰 노드들이 지정한 드래그 위치에서 기본 구조로 순간 리셋되는 오류입니다.
- **원인**:
  1. 사용자가 글을 타이핑하면 `useBlockStore.getMergedContent()` -> `useDocumentStore.updateContent(merged)`가 실행됩니다.
  2. `updateContent`는 `parseMarkdown`을 호출하여 텍스트 파일 원본 기준으로 노드를 리파싱합니다.
  3. 이 과정에서 파서가 리턴하는 노드 리스트는 파일 원문 하단의 좌표 주석(혹은 `0, 0` 기본 레이아웃) 정보만 참조하므로, 사용자가 마우스로 드래그하여 임시로 잡고 있던 메모리 상의 최신 좌표(`spatialData`)를 오버레이하지 않아 한 글자 타이핑만으로도 캔버스가 전부 리셋되었습니다.

## 3. 해결책 및 구현 내용

### A. 형제 노드 순번 트래킹 (`siblingCountMap` 도입)
- [parser.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts) 내부에서 동일한 부모 노드 하위 경로(`basePath`)별로 헤더 개수를 동적으로 세는 맵을 도입했습니다.
- 중복 발견 시 `_2`, `_3` 형태의 인덱스 접미사를 고유 노드 ID에 결합하여 React Key 및 AST의 유일성을 완벽하게 보장했습니다.

### B. 메모리 캔버스 좌표 실시간 병합 오버레이 적용
- [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts) 내 `updateContent` 액션을 개선했습니다.
- 파서가 반환한 노드 리스트(`nodes`)를 즉시 렌더링하지 않고, 메모리에 저장 중인 최신 좌표(`mergedSpatial`)와 매핑하여 다시 동기화해 주는 정렬 프로세스를 추가했습니다:
  ```typescript
  const alignedNodes = nodes.map((node) => {
    if (mergedSpatial[node.id]) {
      return {
        ...node,
        x: mergedSpatial[node.id].x,
        y: mergedSpatial[node.id].y,
      };
    }
    return node;
  });
  ```
- 이 맵핑을 거침으로써 텍스트 편집이나 신규 노드 생성이 일어나더라도 기존 배치했던 노드들의 좌표가 온전하게 유지됩니다.

## 4. 관련 파일 변경 목록
- **MODIFY**:
  - [project/src/entities/document/lib/parser.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts)
  - [project/src/entities/document/model/store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts)
