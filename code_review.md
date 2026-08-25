# Devoras 프로젝트 코드 리뷰 & 리팩토링 가이드

> 작성일: 2026-08-15 | 대상 버전: 현재 `main` 브랜치

---

## 📐 아키텍처 개요

```
src/
├── app/          - 앱 진입점, Provider, 글로벌 설정
├── entities/     - 핵심 도메인 모델 (document, block, workspace, erd)
├── shared/       - 재사용 유틸 (api/fs, lib/editor, lib/headingId …)
├── pages/        - 라우트 수준 컴포넌트 (WorkspacePage)
└── widgets/      - 복합 UI 컴포넌트 (BlockEditor, FileExplorer, MindView, ErdDesigner)
```

**Feature-Sliced Design (FSD)** 구조를 지향하나, 일부 레이어 간 경계가 흐릿합니다. 전반적인 품질은 양호하나, 아래에서 계층별·이슈별로 개선 지점을 정리합니다.

---

## 🔴 Critical Issues (즉시 개선 권장)

### 1. `setActiveTab` — 탭 전환 시 미저장 데이터 손실 (데이터 로스 버그)

**위치**: [`store.ts (document)#L209-L235`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts#L209-L235)

```typescript
// ❌ 치명적: 탭 전환마다 디스크에서 파일을 재독취해 rawContent를 덮어씀!
setActiveTab: async (paneId, tabId) => {
  // ...
  const content = await fileSystemRepository.readFile(targetTab.fileEntry.path);
  set({ rawContent: content, ... }); // ← 미저장 편집 내용이 사라짐
}
```

**시나리오**: 탭 A를 편집(미저장) → 탭 B로 전환 → 탭 A로 복귀 → A의 모든 편집 내용 증발!
이는 가장 심각한 버그로, 실제 사용 시 **사용자 데이터를 영구 손실**시킬 수 있습니다.

**개선 방향**:
```typescript
// ✅ 탭별 캐시에서 복원 (캐시 없으면 디스크 읽기)
interface TabItem {
  cache?: { rawContent: string; nodes: MindNode[]; spatialData: Record<string, ...> };
}
// setActiveTab에서 cache가 있으면 readFile 호출하지 않음
if (targetTab.cache) {
  set({ rawContent: targetTab.cache.rawContent, ... });
  return;
}
```

---

### 2. `ReadView.applyFormat` — 중첩 블록 포맷 무조건 실패

**위치**: [`ReadView.tsx#L258`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/ReadView.tsx#L258)

```typescript
// ❌ blocks는 중첩 트리인데 find()로 최상위 루트만 탐색
const currentBlocks = useBlockStore.getState().blocks;
const block = currentBlocks.find((b) => b.id === floatingBar.blockId);
// H2, H3, 중첩 텍스트 블록은 find 결과가 항상 undefined → 포맷 조용히 실패
```

**개선 방향**:
```typescript
// ✅ flattenTree로 전체 트리 평면화 후 탐색
import { flattenTree } from '@/entities/block/model/store';
const block = flattenTree(useBlockStore.getState().blocks).find(
  (b) => b.id === floatingBar.blockId
);
```

---

### 3. `documentStore` — 전역 단일 상태의 멀티탭 충돌

**위치**: [`store.ts (document)`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts#L75-L80)

```typescript
// ❌ 현재: 전역 단일 rawContent/nodes/isDirty
rawContent: '',
nodes: [],
isDirty: false,
viewMode: 'write',
```

**문제**: `rawContent`, `nodes`, `isDirty`, `viewMode`는 "전역 1개"로 관리됩니다. 멀티 패인의 경우 한 패인의 편집이 다른 패인의 상태를 덮어쓸 위험이 있습니다.

**개선 방향**: 탭에 `cache` 필드를 추가하고, `setActiveTab` 시 캐시에서 복원하면 이슈 1과 함께 해결됩니다.

---

### 4. `handleBlockUpdate` — 매 키 입력마다 과도한 재연산

**위치**: [`BlockEditor.tsx`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx#L360-L419)

```typescript
// ❌ 현재: 키 입력마다 전체 블록 트리를 선형 탐색
const currentFlatBlocks = flattenTree(state.blocks);  // ← O(N) 매번
const lines = merged.replace(/\r\n/g, '\n').split('\n');
lines.forEach(...)  // ← 또 O(N)
```

**문제**: 키 입력 → `flattenTree` → `findIndex` → `getMergedContent` → 줄 파싱 순서로 **매 입력마다 3~4회 O(N) 순회**. 문서가 커질수록 입력 지연이 증가합니다.

---

### 5. 크로스-레이어 직접 호출 (`getState()` 남용)

**위치**: 전반

```typescript
// ❌ 여러 곳에서 발견되는 패턴
useBlockStore.getState().getMergedContent()
useBlockStore.getState().setBlocksFromContent(merged)
useDocumentStore.getState().setDirty(true)
```

`getState()`는 리액티비티를 우회하는 escape hatch입니다. 하지만 현재 **BlockEditor 내부에서 렌더 외부에서 2개 스토어를 직접 조작**하는 패턴이 많아, 사이드 이펙트 추적이 어렵습니다.

**위치**: [`store.ts (document)`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts#L75-L80)

```typescript
// ❌ 현재: 전역 단일 rawContent/nodes/isDirty
rawContent: '',
nodes: [],
isDirty: false,
viewMode: 'write',
```

**문제**: `rawContent`, `nodes`, `isDirty`, `viewMode` 등은 "전역 1개"로 관리됩니다. 그러나 `panes`에는 다수의 탭이 존재할 수 있어, 탭 전환 시 항상 캐시를 수동으로 백업/복원해야 합니다. 
또한 가장 심각한 문제는 **워크스페이스 전환 시 격리 대책 부재**입니다. `documentStore`의 `resetDocumentState`가 존재하나, `blockStore`의 `blocks` 상태 등 연관된 전역 스토어들이 초기화되지 않아 **이전 워크스페이스의 문서 AST 데이터가 메모리에 남아있는(Memory Leak 및 Data Contamination) 구조적 결함**이 존재합니다. 
이로 인해 탭 전환/패인 분할/워크스페이스 변경 등 모든 **컨텍스트 경계(Boundary) 변경** 시마다 수동으로 상태를 정리해야 하며, 누락 시 치명적인 데이터 오염(다른 문서 내용으로 덮어쓰기)이 발생합니다.

**개선 방향**:
1. **단기 조치 (Phase 3)**: 워크스페이스 전환 이벤트 발생 시 `documentStore`뿐만 아니라 `blockStore`, `mindmapStore` 등 모든 관련 스토어의 상태를 명시적으로 초기화(Reset)하는 중앙 통제 로직(`useWorkspaceManager` 등) 구축.
2. **장기 아키텍처 (Phase 4~5)**: 전역 Zustand 싱글톤을 폐기하고, React Context 기반으로 **Tab-Scoped State (탭 단위 독립 스토어)** 및 **Workspace-Scoped State**로 아키텍처 전면 개편. 상태가 생명주기(Unmount)와 함께 자연스럽게 소멸되도록 불변성(Immutability)을 구조적으로 강제.

---

### 2. `handleBlockUpdate` — 매 키 입력마다 과도한 재연산

**위치**: [`BlockEditor.tsx`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx#L360-L419)

```typescript
// ❌ 현재: 키 입력마다 전체 블록 트리를 선형 탐색
const state = useBlockStore.getState();
const currentFlatBlocks = flattenTree(state.blocks);  // ← O(N) 매번
const activeIndex = currentFlatBlocks.findIndex(b => b.id === id);

// 커서 위치 계산을 위해 또 선형 반복
for (let i = 0; i < activeIndex; i++) {
  absoluteCursorPos += currentFlatBlocks[i].content.length + 1;
}

// 분할 감지를 위해 merged 문자열을 줄 단위로 다시 전체 파싱
const lines = merged.replace(/\r\n/g, '\n').split('\n');
lines.forEach(...)  // ← 또 O(N)
```

**문제**: 키 입력 → `flattenTree` → `findIndex` → `getMergedContent` → 줄 파싱 순서로 **매 입력마다 3~4회 O(N) 순회**. 문서가 커질수록 입력 지연이 증가합니다.

**개선 방향**:
```typescript
// ✅ 블록 수가 변경됐는지만 비교 (splitting heuristic 단순화)
const prevBlockCount = currentFlatBlocks.length;
state.updateBlockContent(id, text);
// heading이 추가/삭제됐는지는 'text'만 보면 알 수 있음
const newHeadingCount = (text.match(/^#{1,3} /gm) || []).length;
```

---

### 3. 크로스-레이어 직접 호출 (`getState()` 남용)

**위치**: 전반

```typescript
// ❌ 여러 곳에서 발견되는 패턴
useBlockStore.getState().getMergedContent()
useBlockStore.getState().setBlocksFromContent(merged)
useDocumentStore.getState().setDirty(true)
```

`getState()`는 리액티비티를 우회하는 escape hatch입니다. 이것이 필요한 경우는 콜백/이벤트 핸들러 내부 등 극히 제한적이어야 합니다. 하지만 현재 **BlockEditor 내부에서 렌더 외부에서 2개 스토어를 직접 조작**하는 패턴이 많아, 사이드 이펙트 추적이 어렵습니다.

**개선 방향**: `useBlockStore`와 `useDocumentStore`의 협력이 필요한 로직은 각 스토어의 액션으로 캡슐화하거나, `useEditorManager` 같은 커스텀 훅으로 통합합니다.

---

## 🟡 Major Issues (우선순위 높음)

### 6. `mergeBlockWithPrevious` — H1 블록 병합 Regex 버그

**위치**: [`block/model/store.ts#L204`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts#L204)

```typescript
// ❌ ###?#? 는 ##, ###, #### 만 매칭. # (H1)은 매칭 실패!
currentBlock.content.replace(/^(###?#?)\s*/, '')
```

H1 블록(`# 제목`)을 이전 블록과 병합할 때 `#` 기호가 제거되지 않아, `# 제목` 문자열 그대로가 이전 블록에 붙습니다.

**수정**:
```typescript
// ✅ #{1,4} 로 1~4개 모두 매칭
currentBlock.content.replace(/^#{1,4}\s*/, '')
```

---

### 7. `CodeMirrorBlock` — EditorView 재생성 금지 의존성 배열 누락 (문서화 필요)

**위치**: [`BlockEditor.tsx#L81-L192`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx#L81-L192)

빈 의존성 배열로 마운트 시 1회만 `EditorView`를 생성하는 패턴은 `callbacksRef`로 보완되어 있으나, **의도를 설명하는 주석이 없어** 향후 유지보수자가 의존성을 실수로 추가할 위험이 있습니다.

```typescript
// NOTE: EditorView는 마운트 시 단 1회 생성. 이후 prop 변경은 별도 useEffect로 처리.
// callbacksRef를 통해 콜백 최신값을 보장 (stale closure 회피 패턴).
useEffect(() => { ... }, []);
```

---

### 8. `BlockEditor.handleBlockUpdate` — `setTimeout` 사용 패턴 위험

```typescript
// ⚠️ React 18 동시성 모드에서 동작이 불확정적
setTimeout(() => useBlockStore.getState().focusBlock(targetId, targetOffset), 0);
// ⚠️ 150ms 내 저장 시 마지막 변경 누락 가능
contentSyncTimerRef.current = setTimeout(() => { ... }, 150);
```

**개선 방향**: `setTimeout(fn, 0)` → `queueMicrotask(fn)` 또는 `flushSync`, 디바운스는 `useDebouncedCallback` 훅으로 추출.

---

### 9. `ImageDecorator` — 동일 라인 이미지 다수 처리 버그

**위치**: [`ImageDecorator.ts#L89`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/lib/editor/decorators/impl/ImageDecorator.ts#L89)

```typescript
// ❌ 커서가 첫 번째 이미지 위에 있을 때 pos = line.to + 1로 점프
// → 같은 줄의 두 번째, 세 번째 이미지가 모두 스킵됨
pos = line.to + 1;
continue;
```

한 줄에 `![img1](a.png) ![img2](b.png)`처럼 이미지가 여러 개 있을 경우, 커서가 첫 번째 이미지에 닿으면 두 번째 이미지부터는 렌더링이 스킵됩니다.

---

### 10. `handleFileRenamed` / `handleFileDeleted` — `erd` 탭 타입 누락

**위치**: [`store.ts (document)#L327, L361`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts#L327)

```typescript
// ❌ 'markdown'만 처리, 'erd' 탭은 이름 변경/삭제 이벤트 미처리
if (t.type === 'markdown' && t.filePath && ...)
```

**수정**:
```typescript
if ((t.type === 'markdown' || t.type === 'erd') && t.filePath && ...)
```

---

### 11. `splitPane` — `direction` 파라미터 미사용

**위치**: [`store.ts (document)#L304`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts#L304)

```typescript
// ❌ direction을 받지만 완전히 무시됨
splitPane: (sourcePaneId, _direction) => {
  set({ panes: [...panes, newPane] }); // 항상 동일하게 오른쪽에 추가
}
```

수직/수평 분할이 시각적으로 구분되지 않습니다.

**위치**: [`BlockEditor.tsx#L81-L192`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/BlockEditor/ui/BlockEditor.tsx#L81-L192)

```typescript
// ⚠️ 현재: 빈 의존성 배열로 마운트 시 1회만 EditorView 생성
useEffect(() => {
  // ... EditorState.create, new EditorView ...
}, []); // ← 의도적이지만 위험
```

이는 `block.content`, `onUpdate` 등의 prop 변경에 반응하지 않도록 의도적으로 설계된 것이나, `callbacksRef` 패턴으로 콜백 참조를 중간에 교체합니다. 이 패턴이 제대로 작동하려면 `callbacksRef`가 모든 경우에 최신 값을 갖고 있어야 하는데, 현재 `useEffect(() => { callbacksRef.current = ... })` (의존성 없음)으로 매 렌더마다 업데이트하고 있어 **의도는 올바르나 문서화가 부족**합니다.

**개선 방향**: 명시적인 주석을 남겨 의도를 코드에 박제합니다.
```typescript
// NOTE: EditorView는 마운트 시 단 1회 생성. 이후 prop 변경은 별도 useEffect로 처리.
// callbacksRef를 통해 콜백 최신값을 보장 (stale closure 회피 패턴).
```

---

### 5. `BlockEditor.handleBlockUpdate` — `setTimeout` 사용 패턴 위험

```typescript
// ⚠️ 현재
setTimeout(() => useBlockStore.getState().focusBlock(targetId, targetOffset), 0);
// ...
contentSyncTimerRef.current = setTimeout(() => { ... }, 150);
```

두 가지 `setTimeout`이 있습니다:
1. `delay: 0`으로 렌더 사이클 뒤에 포커스 이동 → React 18의 동시성 모드에서 동작이 불확정적
2. `delay: 150`으로 콘텐츠 동기화 디바운싱 → 150ms 내에 저장하면 마지막 변경 누락 가능

**개선 방향**:
- `setTimeout(fn, 0)` → `queueMicrotask(fn)` 또는 `flushSync` + React `startTransition`
- 디바운스는 `useDebouncedCallback` 커스텀 훅으로 추출해 컴포넌트에서 관리

---

### 6. `splitPane` — `direction` 파라미터 미사용

**위치**: [`store.ts (document)#L304`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts#L304)

```typescript
// ❌ direction을 받지만 완전히 무시됨
splitPane: (sourcePaneId, _direction) => {
  // ... 항상 오른쪽에 추가
  set({ panes: [...panes, newPane] });
}
```

수직/수평 분할이 시각적으로 구분되지 않습니다. 실제 레이아웃도 CSS로 분기하지 않아, `splitPane`을 아무리 호출해도 동일하게 우측 추가만 됩니다.

---

### 7. `handleFileRenamed` — `erd` 탭 타입 누락

**위치**: [`store.ts (document)#L327`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/model/store.ts#L327)

```typescript
// ❌ 'markdown'만 처리, 'erd' 탭은 이름 변경 이벤트 미처리
if (t.type === 'markdown' && t.filePath && t.filePath.startsWith(oldPath)) {
```

ERD 파일을 이름 변경하면 열린 탭의 경로가 업데이트되지 않습니다.

**수정**:
```typescript
if ((t.type === 'markdown' || t.type === 'erd') && t.filePath && t.filePath.startsWith(oldPath)) {
```

---

### 8. `ErdDesignerMainView` — `useEffect` 의존성 무한 루프 위험

**위치**: [`ErdDesignerMainView.tsx#L42`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/ErdDesigner/ui/ErdDesignerMainView.tsx#L42)

```typescript
// ⚠️ updateContent가 매 렌더마다 새 참조를 반환하면 무한 루프
useEffect(() => {
  // ... needsUpdate 시 updateContent(JSON.stringify(finalDoc)) 호출
}, [rawContent, updateContent]);  // updateContent는 zustand 액션이라 안정적이긴 하나...
```

`needsUpdate` 분기에서 `updateContent`를 호출하면 → `rawContent`가 바뀌고 → Effect가 재실행되는 순환이 발생할 수 있습니다. 실제로는 JSON이 동일해 두 번째에 `needsUpdate = false`가 되겠지만, 매번 `JSON.parse` + `JSON.stringify`가 실행되는 불필요한 사이클이 생깁니다.

**개선 방향**: `rawContent`를 직접 의존성으로 쓰지 말고, `activeTabId`를 의존성으로 써서 탭 전환 시에만 파싱하게 합니다.

---

## 🟢 Minor Issues / 코드 품질 개선

### 9. `Cmd+C/V` 클립보드 — 브라우저 기본 Cmd+C 충돌

**위치**: [`FileExplorer.tsx`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/FileExplorer/ui/FileExplorer.tsx)

방금 구현한 `Cmd+C` 리스너가 `window`에 달려 있어, **에디터 내에서 텍스트 복사 중에도 파일 클립보드가 설정**됩니다. 텍스트 복사와 파일 복사가 충돌합니다.

**개선 방향**: FileExplorer 컨테이너 `div`에만 이벤트 리스너를 달거나, 파일 트리에 포커스가 있을 때만 활성화합니다.

```typescript
// ✅ 파일 탐색기 영역에서만 처리
const containerRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  el.addEventListener('keydown', handleKeyDown);
  return () => el.removeEventListener('keydown', handleKeyDown);
}, [...]);
```

---

### 10. `CodeBlockDecorator` — `codeContent` 수집 방식 비효율

**위치**: [`CodeBlockDecorator.ts#L80-L83`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/shared/lib/editor/decorators/impl/CodeBlockDecorator.ts#L80-L83)

```typescript
// ⚠️ 매 줄마다 문자열 연결 (O(N²) 잠재 위험)
currentFence.codeContent += text + '\n';
```

코드 블록이 크면 클수록 문자열 연결 비용이 증가합니다.

**개선 방향**:
```typescript
// ✅ 배열로 모으고 마지막에 join
const codeLines: string[] = [];
// ...
codeLines.push(text);
// close 시:
codeContent: codeLines.join('\n')
```

---

### 11. 매직 넘버 & 인라인 스타일

**위치**: 다수

```typescript
// ❌ 의미 불명한 숫자들
yOffset += 120;          // parser.ts — 마인드맵 초기 Y 간격
Math.max(11, Math.min(22, s.fontSize + delta))  // 최소/최대 폰트 크기
'pane-1', 'pane-main'   // 패인 ID 하드코딩
```

```typescript
// ✅ 상수 파일로 추출 (shared/lib/constants.ts)
export const EDITOR_FONT_SIZE = { MIN: 11, MAX: 22 };
export const MINDMAP_NODE_Y_GAP = 120;
export const PANE_ID_MAIN = 'pane-main';
```

---

### 12. `generateId` — 충돌 가능성

**위치**: [`block/model/store.ts#L24`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/block/model/store.ts#L24)

```typescript
// ⚠️ Math.random() 기반 7자리 ID — 충돌 가능성 존재 (1/36^7 ≈ 1/78억)
const generateId = () => Math.random().toString(36).substring(2, 9);
```

문서 내 블록 수가 수천 개가 되거나 테스트 환경에서 seed가 고정되면 충돌 발생. `crypto.randomUUID()` 사용 권장:
```typescript
const generateId = () => crypto.randomUUID().substring(0, 8);
```

---

### 13. `WorkspacePage` — 단일 파일에 너무 많은 책임

**위치**: [`WorkspacePage.tsx`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/pages/WorkspacePage/WorkspacePage.tsx) (295줄)

- 사이드바 리사이저 로직
- MindView 리사이저 로직  
- 키보드 단축키 처리
- File 메뉴 드롭다운 상태
- 탭/패인 렌더링

**개선 방향**: 리사이저 로직은 `usePaneResizer` 훅으로, 단축키는 `useGlobalShortcuts` 훅으로 추출합니다.

---

### 14. `FileExplorer` — 트리 렌더링 성능

**위치**: [`FileExplorer.tsx`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/widgets/FileExplorer/ui/FileExplorer.tsx)

`TreeNode`는 `React.memo`로 메모이제이션되어 있지 않습니다. 파일이 많은 워크스페이스에서 드래그 중 `dragOverPath` 상태가 바뀔 때마다 **전체 트리가 리렌더링**됩니다.

```typescript
// ✅ TreeNode를 React.memo로 감싸기
const TreeNode = React.memo<TreeNodeProps>(({ ... }) => { ... });
```

---

### 15. `parser.ts` — 초기 레이아웃 좌표 하드코딩

**위치**: [`parser.ts#L73-L78`](file:///Users/wyattkim/Desktop/Devoras-Design/project/src/entities/document/lib/parser.ts#L73-L78)

```typescript
// ❌ 파서(순수 함수)가 레이아웃 계산(UI 관심사)을 담당
nodes.forEach((node) => {
  node.x = node.level * 220;
  node.y = yOffset;
  yOffset += 120;
});
```

파서는 구조만 반환하고, 초기 레이아웃 좌표 계산은 MindView 레이어에서 처리해야 합니다. 현재는 `spatialData`가 없을 때 parser가 x/y를 제공하지만 관심사 분리 위반입니다.

---

## 📊 리팩토링 우선순위 요약

| 순위 | 이슈 | 유형 | 영향도 | 난이도 |
|------|------|------|--------|--------|
| 1 | **`setActiveTab` 탭 전환 시 미저장 데이터 손실** | 🔴 버그 | 치명 | 중간 |
| 2 | **`ReadView.applyFormat` 중첩 블록 포맷 실패** | 🔴 버그 | 치명 | 쉬움 |
| 3 | **`mergeBlockWithPrevious` H1 Regex 버그** | 🔴 버그 | High | 쉬움 |
| 4 | **`handleFileRenamed/Deleted` ERD 타입 누락** | 🔴 버그 | High | 쉬움 |
| 5 | **`ImageDecorator` 동일 라인 다중 이미지 스킵** | 🟡 버그 | Medium | 중간 |
| 6 | `documentStore` 탭별 상태 캐시 도입 | 🟡 리팩토링 | Medium | 중간 |
| 7 | `handleBlockUpdate` O(N) 연산 최적화 | 🟡 성능 | Medium | 중간 |
| 8 | `Cmd+C` 전역 리스너 스코프 제한 | 🟡 UX | Medium | 쉬움 |
| 9 | `ErdDesignerMainView` useEffect 순환 위험 | 🟡 안정성 | Medium | 쉬움 |
| 10 | `TreeNode` React.memo 추가 | 🟢 성능 | Low | 쉬움 |
| 11 | 매직 넘버 상수화 | 🟢 품질 | Low | 쉬움 |
| 12 | `generateId` → `crypto.randomUUID` | 🟢 품질 | Low | 쉬움 |
| 13 | `codeContent` 배열 수집 최적화 | 🟢 성능 | Low | 쉬움 |
| 14 | `parser.ts` 레이아웃 관심사 분리 | 🟢 구조 | Low | 중간 |
| 15 | `WorkspacePage` 책임 분리 (커스텀 훅) | 🟢 구조 | Low | 중간 |

> **즉시 수정 권장 (버그)**: 순위 1~5는 코드 한 줄~수 줄 수정으로 해결 가능하면서 사용자 경험에 직접 영향을 주는 버그들입니다.

---

## ✅ 잘 설계된 부분

- **Decorator Orchestrator 패턴**: 각 Decorator가 `SyntaxDecorator` 인터페이스를 구현하고, Orchestrator가 합쳐 적용하는 구조는 확장성이 뛰어납니다. 새로운 마크다운 문법 추가 시 파일 1개만 추가하면 됩니다.
- **IME 3중 방어선**: `setImeEffect` + `imeStateField` + `compositionstart/end` 래치로 한국어 입력 문제를 철저히 처리합니다.
- **FSD 레이어 구조**: `entities`, `shared`, `widgets`, `pages`의 의존성 방향(entities ← widgets ← pages)이 올바르게 지켜지고 있습니다.
- **Tauri/Mock 이중 구현**: `FileSystemRepository` 인터페이스를 통해 브라우저 Mock과 Tauri 구현을 교체 가능하게 한 설계는 테스트 친화적입니다.
- **ERD 엔티티 타입 안전성**: `erd.ts`의 런타임 검증 함수들(`isRecord`, `normalizeTable`, `normalizeRelation`)이 상세하게 구현되어 있습니다.
- **BUG 레퍼런스 코드 관리**: `BUG-20260810-05`, `REF-20260810-01` 등 코드 내 이슈 트래킹 관행은 유지보수에 도움이 됩니다.
- **엄격한 TypeScript 설정**: `strict`, `noImplicitAny`, `noUnusedLocals` 등 가장 엄격한 설정을 사용하고 있습니다.

