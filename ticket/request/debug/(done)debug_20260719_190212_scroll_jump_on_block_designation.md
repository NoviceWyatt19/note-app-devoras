# [Debug] 블록 지정/해제(H1, H2 변환) 시 에디터 스크롤 및 포커스 튀는 현상 버그

## 🚨 1. 발생 현상 (Symptom)
* **상황:** 기존 H1, H2 헤딩 블록을 H3 이하의 태그로 변경(블록 해제 및 병합)하거나 반대로 H3 이하의 텍스트를 H1, H2로 격상(블록 지정 및 분할)할 때, 에디터 스크롤 위치가 비정상적으로 튀거나 문서 최상단으로 강제 이동하는 현상이 발생합니다.
* **구체적 현상:**
  * 가장 하위에 위치한 블록의 헤딩(H2 등)을 H3 이하로 수정하여 이전 블록과 병합시키는 순간, 포커스와 스크롤이 문서의 최상단(첫 번째 블록)으로 강제 스크롤 점프합니다.
  * 블록 병합 시 기존 에디터 컴포넌트가 사라지면서 포커스를 유실해 사용성이 크게 저하됩니다.

## 🔍 2. 원인 분석 및 유추 (Root Cause Analysis)
* **가설 1:** 블록 분할 및 병합 시 변경된 블록 목록에서 활성 블록 ID(`activeBlockId`)를 찾지 못해 강제로 첫 번째 블록(`index 0`)으로 포커스가 폴백되는 현상.
* **확인 결과:** 
  * [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)의 `setBlocksFromContent` 액션 내 구현:
    ```typescript
    let activeId = get().activeBlockId;
    if (!activeId || !updatedBlocks.some(b => b.id === activeId)) {
      activeId = updatedBlocks[0].id; // ← 활성 블록 유실 시 첫 번째 블록으로 폴백
    }
    ```
  * 사용자가 H1/H2 헤딩을 일반 텍스트나 H3 이하로 수정하면 해당 에디터 블록은 더 이상 H1/H2 슬라이싱 경계가 아니므로 **제거**되고, 내용이 **이전 블록에 흡수/병합**됩니다.
  * 이때 기존 활성 블록(제거된 블록)의 ID는 새 블록 배열(`updatedBlocks`)에 존재하지 않으므로, 스토어는 무조건 첫 번째 블록(`updatedBlocks[0].id`)을 `activeBlockId`로 강제 지정합니다.
  * 이로 인해 CodeMirrorBlock의 포커스 동기화 효과(`useEffect`)가 첫 번째 블록을 포커싱하고, 브라우저가 화면을 문서 맨 위로 급격히 스크롤하는 현상이 발생합니다.
* **핵심 원인:** 편집 중인 블록이 병합으로 사라질 때, 포커스를 인접(흡수한) 블록과 연결 위치(`offset`)로 인계하지 않고 첫 번째 블록으로 일괄 초기화하는 설계 결함.

## 💡 3. 해결 방법 및 조치 (Resolution)
* **조치 내용:**
  * `setBlocksFromContent`에서 기존 `activeBlockId`가 유실되는 경우, 해당 블록의 인덱스(`oldIndex`)를 찾습니다.
  * `oldIndex > 0`인 경우(이전 블록이 존재하는 경우), 콘텐츠를 흡수한 **이전 블록의 ID**를 새 `activeBlockId`로 지정합니다.
  * 이때 커서 위치(`focusOffset`)는 병합 전 이전 블록의 끝 지점(`previousBlock.content.length`)으로 자연스럽게 설정되도록 스토어 상태를 갱신합니다.
* **수정 코드 제안:**
  * [store.ts](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts)의 `setBlocksFromContent` 내부 활성 ID 결정 로직 수정:
    ```typescript
    // 기존 활성 블록 ID 및 오프셋 조회
    let activeId = get().activeBlockId;
    let newFocusOffset = get().focusOffset;

    if (activeId && !updatedBlocks.some(b => b.id === activeId)) {
      const oldIndex = currentBlocks.findIndex(b => b.id === activeId);
      if (oldIndex > 0) {
        // 제거된 블록의 내용을 흡수한 이전 블록으로 포커스 대상 변경
        const precedingBlock = updatedBlocks[Math.min(oldIndex - 1, updatedBlocks.length - 1)];
        activeId = precedingBlock.id;
        // 커서 위치는 이전 블록의 원본 텍스트 끝 지점으로 설정
        newFocusOffset = currentBlocks[oldIndex - 1].content.length;
      } else {
        // 첫 번째 블록인 경우 폴백
        activeId = updatedBlocks[0].id;
        newFocusOffset = 0;
      }
    } else if (!activeId) {
      activeId = updatedBlocks[0].id;
      newFocusOffset = 0;
    }

    set({ 
      blocks: updatedBlocks, 
      activeBlockId: activeId,
      focusOffset: newFocusOffset 
    });
    ```

## 🛡️ 4. 재발 방지 및 검증 (Prevention & Verification)
* **검증 방법:** 
  1. H2 헤딩 여러 개가 있는 문서에서 가장 하단에 있는 H2 블록을 수정해 `###` 또는 일반 텍스트로 바꿉니다.
  2. 스크롤이 최상단으로 튀지 않고, 커서가 병합 지점(이전 블록의 텍스트가 끝나는 영역)에 정상 배치되는지 수동 테스트합니다.
* **방지 대책:** 에디터 조각화(Slicing/Merging) 등의 상태 파괴적 리액티브 상태 변경이 발생할 때, 기존 사용자 컨텍스트(커서 위치, 스크롤 뷰포트)가 유지될 수 있는 인접 인덱스 전이 및 보존 로직을 의무적으로 검토 및 추가합니다.
