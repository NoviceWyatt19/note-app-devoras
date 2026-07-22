# [Debug] H3 이하 태그를 H1, H2로 변환(블록 분할) 시 포커스 튀는 현상 버그

## 🚨 1. 발생 현상 (Symptom)
* **상황:** H3 이하의 하위 헤딩이나 일반 텍스트 라인을 H1(`# `) 또는 H2(`## `) 헤딩 태그로 변경하여 새로운 에디터 블록으로 분할(Block Split)을 유도할 때, 포커스가 쪼개진 신규 블록의 예상치 못한 위치로 튀거나 텍스트 입력 흐름이 끊기는 현상이 발생합니다.
* **구체적 현상:**
  * 텍스트 중간에 `# ` 또는 `## `를 추가하여 블록을 분리하면 커서가 사용자가 원래 편집하던 위치가 아닌 쪼개진 새 블록의 줄 맨 끝(`headingLineEnd`)으로 튀어서 강제 이동합니다.
  * 접두사 기호 입력 중에 포커스가 갑자기 점프하므로 텍스트 타이핑의 연속성이 저해됩니다.

## 🔍 2. 원인 분석 및 유추 (Root Cause Analysis)

### 초기 가설 (기각)
* `setBlocksFromContent`의 활성 블록 ID 폴백 로직 결함 → 이전 세션에서 Case A/B 분기 수정을 적용했으나 증상이 잔존함.
* → 폴백 로직 수정은 병합(H1/H2→H3) 케이스를 해결했지만, **블록 분할(H3→H1/H2) 케이스의 근본 원인이 별개의 레이어에 존재**함을 인지하지 못했음.

### ✅ 확정 원인 (2가지 복합)

**원인 A — `onUpdate` 콜백 인터페이스 설계 결함**
* [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx)의 `onUpdate: (content: string) => void` 콜백이 텍스트 내용만 전달하며, CodeMirror가 알고 있는 **실제 커서 위치(selection anchor)를 상위 레이어로 전달하지 않음**.

**원인 B — `headingLineEnd` 하드코딩**
* `handleBlockUpdate` 내에서 신규 블록이 감지되면 커서를 **항상 헤딩 줄의 맨 끝(`headingLineEnd`)**으로 강제 지정하는 로직이 존재.
* 커서가 `## ` 타이핑 직후 위치(예: offset 3)에 있더라도 `"## Section Title".length = 16`으로 점프.

```
[버그 실행 흐름]
CodeMirror keypress
  → onUpdate(text)                 ← 커서 위치 정보 소실
  → handleBlockUpdate(id, text)
      → setBlocksFromContent()     ← 분할 후 activeId는 첫 번째 블록 유지
      → newBlock 탐지
      → setTimeout: focusBlock(newBlock.id, headingLineEnd)  ← 줄 끝으로 강제 점프
```

* **핵심 원인:** `onUpdate` → `handleBlockUpdate` 레이어 간 **커서 위치 정보 단절** + 신규 블록 포커스 시 **절대 좌표 기반 역산 없이 headingLineEnd 하드코딩**.

## 💡 3. 해결 방법 및 조치 (Resolution)

### 조치 1 — `onUpdate` 인터페이스에 `cursorOffset` 파라미터 추가
* [BlockEditor.tsx](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx) 수정:
  ```typescript
  // 인터페이스 변경
  onUpdate: (content: string, cursorOffset: number) => void;
  
  // updateListener에서 anchor 함께 전달
  callbacksRef.current.onUpdate(
    update.state.doc.toString(),
    update.state.selection.main.anchor
  );
  
  // JSX onUpdate prop
  onUpdate={(text, cursorOffset) => handleBlockUpdate(block.id, text, cursorOffset)}
  ```

### 조치 2 — 절대 커서 위치 역산 + 블록 매핑 알고리즘 도입
* `handleBlockUpdate` 리팩터링:
  ```typescript
  const handleBlockUpdate = (id: string, text: string, cursorOffset: number) => {
    // 1. updateBlockContent 이전 스냅샷으로 절대 커서 위치 역산
    const prevBlocksSnapshot = useBlockStore.getState().blocks;
    const activeIndex = prevBlocksSnapshot.findIndex(b => b.id === id);
    let absoluteCursorPos = cursorOffset;
    for (let i = 0; i < activeIndex; i++) {
      absoluteCursorPos += prevBlocksSnapshot[i].content.length + 1; // +1: '\n' separator
    }
    
    // 2. 상태 업데이트 및 re-slice
    useBlockStore.getState().updateBlockContent(id, text);
    // ... headingCount 체크 후 setBlocksFromContent 호출 ...
    
    // 3. 재슬라이싱된 블록 배열에서 absoluteCursorPos → 블록+오프셋 역산
    let accumulated = 0;
    for (let i = 0; i < nextBlocks.length; i++) {
      const len = nextBlocks[i].content.length;
      if (absoluteCursorPos <= accumulated + len) {
        targetId = nextBlocks[i].id;
        targetOffset = Math.min(Math.max(0, absoluteCursorPos - accumulated), len);
        break;
      }
      accumulated += len + 1;
    }
    setTimeout(() => useBlockStore.getState().focusBlock(targetId, targetOffset), 0);
  };
  ```

```
[수정 후 실행 흐름]
CodeMirror keypress
  → onUpdate(text, anchor)         ← 커서 위치 보존
  → handleBlockUpdate(id, text, cursorOffset)
      → absoluteCursorPos 역산     ← 병합 문서 기준 절대 좌표 계산
      → setBlocksFromContent()
      → 절대 좌표 → 블록+상대 오프셋 매핑
      → setTimeout: focusBlock(targetId, targetOffset)  ← 타이핑 위치 그대로
```

## 🛡️ 4. 재발 방지 및 검증 (Prevention & Verification)
* **검증 방법:**
  1. 문서 중간의 `### Heading` 텍스트 앞에서 `## `로 수정해 블록이 분리되는 순간 커서가 사용자가 타이핑하던 위치(예: `## ` 입력 직후 offset 3)에 그대로 머무는지 확인합니다. ✅
  2. 여러 블록이 있는 문서에서 중간 블록을 분리해도 동일하게 동작하는지 교차 검증합니다. ✅
* **방지 대책:**
  * 다중 에디터 블록 구조에서 구조 변화(Split/Merge)가 일어날 때는 특정 라인 끝 포커싱 같은 근사값이 아닌, **병합 문서 기준 절대 커서 좌표(`Absolute Character Offset`) 역산 매핑 방식**을 표준으로 채택합니다.
  * CodeMirror 등 외부 에디터 인스턴스의 커서 상태는 콜백 인터페이스에 **명시적으로 포함**시켜 상위 레이어로 전달합니다.
