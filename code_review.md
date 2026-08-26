# Devoras 코드 리뷰 & 리팩터링 통합 가이드

> **최종 갱신**: 2026-08-26 | **대상 버전**: `v0.8.2` (`main` 브랜치)
> **통합 이력**: 2026-08-15 최초 리뷰(`code_review.md`) + 2026-08-26 v0.8.2 재리뷰(`project/CODE_REVIEW.md`)를 본 문서 하나로 통합.
> **리뷰 형식**: **[파일 & 라인] ➔ [근본 원인] ➔ [조치 방안]**
> **경로 표기**: 모든 경로는 저장소 루트 기준입니다. (구 문서의 `file:///…/Devoras-Design/…` 절대 링크 21건은 저장소 이전으로 모두 유효하지 않아 상대 경로로 교체했습니다.)

---

## 📐 아키텍처 개요

```
project/src/
├── app/          - 앱 진입점, Provider, 글로벌 설정
├── entities/     - 핵심 도메인 모델 (document, block, workspace, settings, erd)
├── shared/       - 재사용 유틸 (api/fs, lib/editor, lib/headingId, lib/path …)
├── pages/        - 라우트 수준 컴포넌트 (WorkspacePage, LauncherPage)
└── widgets/      - 복합 UI 컴포넌트 (BlockEditor, FileExplorer, MindView, ErdDesigner, SettingsModal)
project/src-tauri/ - Rust 백엔드 (커맨드, 권한/capabilities, 윈도우 설정)
```

**Feature-Sliced Design(FSD)** 의존성 방향(`entities ← widgets ← pages`)은 대체로 지켜지고 있으나, 전역 Zustand 싱글톤을 통한 크로스 레이어 직접 호출(`getState()`)이 경계를 흐리고 있습니다. 이 구조적 문제가 v0.8.2 시점의 최상위 결함들(P0-3, P1-2, P1-3)의 공통 뿌리입니다.

### 리뷰 범위 (2026-08-26 기준)

`entities/document`, `entities/block`, `entities/workspace`, `entities/settings`,
`shared/api/fs.ts`, `shared/lib/editor/*`, `widgets/BlockEditor`(BlockEditor·ReadView),
`widgets/MindView`, `widgets/FileExplorer`, `pages/WorkspacePage`,
`src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

---

## ✅ 2026-08-15 지적 항목 이행 현황

| 기존 항목 | 상태 | 비고 |
|---|---|---|
| 코드 블록 격리 부재 (Point 1) | ✅ 해결 | `parser.ts:29-36` 펜스 추적 도입 |
| `split('\n\n')` 블록 분할 한계 (Point 2) | ✅ 해결 | 헤딩 경계 + 펜스 인식 스캐너로 전환 |
| 순서 변경 시 좌표 뒤틀림 (Point 3) | ⚠️ 부분 해결 | `openTab`에만 `_숫자` 접미사 폴백 존재, `updateContent`에는 미적용 → **P1-2 참고** |
| CodeMirror 렌더링 최적화 (Point 4) | ⚠️ 부분 해결 | `React.memo` 적용됐으나 인라인 props로 무력화 → **P2-2** |
| `setActiveTab` 미저장 데이터 손실 (Critical 1) | ⚠️ 부분 해결 | `TabCache` 도입됐으나 `openTab`이 우회 → **P0-2** |
| `ReadView.applyFormat` 중첩 블록 실패 (Critical 2) | ✅ 해결 | `flattenTree` 적용 (`ReadView.tsx:260`) |
| 전역 싱글톤 스토어 / 탭 단위 상태 (Critical 3) | ❌ 미해결 | 분할 뷰 출시로 **악화** → **P0-3** |
| `handleBlockUpdate` 매 입력 O(N) (Critical 4) | ⚠️ 부분 해결 | 헤딩 카운트 휴리스틱 도입, 그러나 입력당 2회 호출 → **P1-5** |
| 크로스 레이어 `getState()` 남용 (Critical 5) | ❌ 미해결 | `BlockEditor`·`ReadView`에서 2개 스토어 직접 조작 지속 |
| `mergeBlockWithPrevious` H1 Regex (Major 6) | ⚠️ 부분 해결 | `#{1,4}` — H5/H6 누락 → **P1-7** |
| `CodeMirrorBlock` 의존성 배열 문서화 (Major 7) | ❌ 미해결 | `BlockEditor.tsx:233`의 빈 배열에 의도 주석 여전히 없음 |
| `setTimeout` 디바운스 패턴 (Major 8) | ❌ 미해결 | 언마운트 정리 부재까지 추가 → **P0-4** |
| `ImageDecorator` 동일 라인 다중 이미지 (Major 9) | ✅ 해결 | 동작은 정상, 사문화된 코드 잔존 → **P2-8** |
| `handleFileRenamed/Deleted` erd 누락 (Major 10) | ✅ 해결 | 단, 경로 접두사 매칭 결함 잔존 → **P1-1** |
| `splitPane` direction 미사용 (Major 11) | ✅ 해결 | `layoutDirection` 반영 |
| `ErdDesignerMainView` useEffect 순환 위험 (Major/Minor 8) | ⚠️ 부분 해결 | `activeTabId` 분리됐으나 `rawContent` 의존성 잔존 |
| `Cmd+C` 전역 리스너 스코프 (Minor 9) | ✅ 해결 | `containerRef` + `tabIndex={-1}`로 국소화 |
| `codeContent` 배열 수집 최적화 (Minor 10) | ❌ 미해결 | **P2-4** |
| 매직 넘버 상수화 (Minor 11) | ⚠️ 부분 해결 | 폰트 크기 범위는 설정으로 이동, 패널 ID·간격 값은 하드코딩 잔존 |
| `generateId` 충돌 가능성 (Minor 12) | ❌ 미해결 | **P2-5** |
| `WorkspacePage` 책임 분리 (Minor 13) | ❌ 미해결 | 358줄, 리사이저·단축키·패널 렌더링 혼재 |
| `FileExplorer` 트리 렌더링 성능 (Minor 14) | ⚠️ 확인 필요 | `TreeNode` 메모이제이션 여전히 미적용 |
| `parser.ts` 레이아웃 관심사 분리 (Minor 15) | ✅ 해결 | 좌표 계산이 `MindView.displayNodes`로 이동 |

**요약**: 전체 23개 항목 중 **해결 8 / 부분 해결 8 / 미해결 7**.
아래 P0~P2는 위 미해결·부분 해결 항목과 2026-08-26 신규 발견분을 **심각도 기준으로 재정렬**한 실행 목록입니다.

---

# 🔴 P0 — Critical (즉시 조치)

## P0-1. 신뢰할 수 없는 마크다운 → 임의 코드 실행 + 홈 디렉터리 전체 접근

**[파일 & 라인]**
`project/src/widgets/BlockEditor/ui/ReadView.tsx:16, 41, 97-99, 450-451`
`project/src-tauri/tauri.conf.json:40` · `project/src-tauri/src/lib.rs:12-28, 32-54` · `project/src-tauri/capabilities/default.json`

**[근본 원인]**
다음 4개 결함이 하나의 공격 체인을 형성합니다.

1. `marked`가 `gfm/breaks` 옵션만으로 동작하며 **새니타이저가 전혀 없습니다** (`package.json`에 `dompurify` 미포함). `preprocessMd`는 `==...==`를 raw HTML(`<mark>`)로 주입하고, 코드 펜스의 `|title|="..."` 값은 **이스케이프 없이** 그대로 문자열 보간됩니다(라인 41). 최종 결과가 `dangerouslySetInnerHTML`로 삽입됩니다(라인 450-451).
2. `tauri.conf.json:40`의 `"csp": null` — CSP가 없어 `<img src=x onerror=...>` 같은 인라인 핸들러가 그대로 실행됩니다. (`innerHTML`이므로 `<script>`는 실행되지 않지만 이벤트 핸들러 계열은 전부 유효합니다.)
3. `save_image_file`(lib.rs:12)과 `read_image_base64`(lib.rs:32)는 `String` 경로를 **아무 검증 없이** `std::fs`에 그대로 전달합니다. 주석에 명시된 대로 plugin-fs 스코프를 의도적으로 우회하는 커맨드입니다.
4. `capabilities/default.json`이 `fs:allow-home-read-recursive` / `fs:allow-home-write-recursive` / desktop·document·download 재귀 권한과 `shell:allow-open`을 부여하고, `assetProtocol.scope`가 `["**"]` 입니다.

결과: 외부에서 받은 `.md` 파일 하나를 Read 모드로 여는 것만으로 `$HOME` 하위 임의 파일의 읽기/쓰기가 가능합니다.

**[조치 방안]**
```bash
pnpm add dompurify && pnpm add -D @types/dompurify
```
```typescript
// ReadView.tsx
import DOMPurify from 'dompurify';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
   .replace(/</g, '&lt;').replace(/>/g, '&gt;');   // & 를 반드시 먼저 치환

// 라인 41: ${title} → ${escapeHtml(title)}
// 라인 35: safeText 도 위 헬퍼로 통일 (현재 & 미처리)

function renderBlockToHtml(content: string, workspacePath: string | null): string {
  const html = markedParser.parse(preprocessMd(content)) as string;
  return DOMPurify.sanitize(resolveAssetPaths(html, workspacePath), {
    ADD_ATTR: ['data-src', 'data-code'],
  });
}
```
```json
// tauri.conf.json
"csp": "default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
```
```rust
// lib.rs — 두 커맨드 모두 워크스페이스 루트 밖 경로를 거부
fn ensure_inside(root: &str, path: &str) -> Result<std::path::PathBuf, String> {
    let root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    let target = std::path::Path::new(path);
    let probe = target.parent().unwrap_or(target);
    let probe = std::fs::canonicalize(probe).map_err(|e| e.to_string())?;
    if !probe.starts_with(&root) {
        return Err("워크스페이스 외부 경로 접근이 거부되었습니다".into());
    }
    Ok(target.to_path_buf())
}
```
추가로 `assetProtocol.scope`를 `["**"]`에서 워크스페이스 하위로 좁히고, 실제로 필요하지 않은 home/desktop/document/download 재귀 권한을 제거하십시오.

---

## P0-2. 미저장 편집 소실 — `openTab`이 신규 `TabCache`를 우회

**[파일 & 라인]**
`project/src/entities/document/model/store.ts:152-201` (특히 159, 196-200)
`project/src/widgets/FileExplorer/ui/FileExplorer.tsx:213-217`

**[근본 원인]**
캐시 백업 로직은 `setActiveTab`의 Step 1(라인 215-230)에**만** 존재합니다. `openTab`은 무조건 `readFile()`을 호출하고 `set({ rawContent: content, isDirty: false })`로 덮어쓰며, **떠나는 탭의 편집 내용을 `cache`에 저장하지 않습니다.**

- 파일 탐색기에서 다른 파일 클릭 → `loadFile → openTab` → 이전 탭의 미저장 버퍼가 영구 소실. 이후 그 탭을 다시 눌러도 `cache === undefined` 이므로 디스크의 옛 내용을 재독취합니다.
- 더 나쁜 경우: **현재 열린 dirty 파일을 탐색기에서 다시 클릭**하면 `currentFile?.path !== file.path` 조건(FileExplorer.tsx:213) 때문에 `window.confirm` 경고조차 뜨지 않고 조용히 디스크 내용으로 롤백됩니다.

즉, 기존 가이드라인 Critical-1 버그가 `setActiveTab` 경로에서만 막혔고 `openTab` 경로로 그대로 살아있습니다.

**[조치 방안]**
`setActiveTab`의 Step 1 블록을 `_snapshotActiveTab()` 내부 헬퍼로 추출하고, `openTab` 진입부에서도 동일하게 호출합니다. 또한 이미 열린 탭이면 디스크가 아닌 캐시에서 복원합니다.
```typescript
openTab: async (item) => {
  get()._snapshotActiveTab();            // ← 추가: 떠나는 탭 버퍼 보존
  // ...
  if (existingTab?.cache) {              // ← 추가: 캐시 우선 복원
    set({
      panes: /* activeTabId 갱신 */,
      rawContent: existingTab.cache.rawContent,
      nodes: existingTab.cache.nodes,
      spatialData: existingTab.cache.spatialData,
      isDirty: existingTab.isDirty ?? false,
    });
    return;
  }
  const content = await fileSystemRepository.readFile(file.path);  // 캐시 없을 때만 I/O
```

---

## P0-3. 분할 패널이 전역 상태 하나를 공유 — 두 번째 패널이 항상 활성 패널 문서를 표시

**[파일 & 라인]**
`project/src/pages/WorkspacePage/WorkspacePage.tsx:353`
`project/src/widgets/BlockEditor/ui/BlockEditor.tsx:339-369`
`project/src/entities/document/model/store.ts:489`

**[근본 원인]**
각 `PaneContainer`가 독립적으로 `<BlockEditor>`를 마운트하지만, 모든 인스턴스가
- 파일을 `getCurrentFile()` = **활성 패널의 탭**에서 얻고,
- 내용을 전역 `useBlockStore.blocks` / `useDocumentStore.rawContent`에서 읽습니다.

따라서 패널마다 `activeTabId`가 달라도 **화면에는 동일한 문서**가 그려지고, 탭 바 표시와 실제 내용이 불일치합니다. `saveFile()`(store.ts:489)은 이 불일치를 데이터 손상으로 확정시킵니다 — 저장 **경로**는 활성 패널 탭에서, 저장 **내용**은 전역 `blockStore.getMergedContent()`에서 가져오므로, 둘이 어긋나는 순간 A 문서 파일에 B 문서 본문이 기록됩니다.

**[조치 방안]**
- 단기: `PaneContainer`가 `<BlockEditor tab={activeTab} />`로 탭을 명시적으로 주입하고, 내용은 `tab.cache ?? rawContent`에서 해석합니다. `saveFile(paneId, tabId)` 시그니처로 바꿔 암묵적 전역 참조를 제거합니다.
- 구조 개선(기존 `code_review.md` Phase 4~5 항목): `rawContent / nodes / blocks / isDirty / viewMode`를 `PaneContainer` 내부에서 생성하는 React Context 기반 **탭 스코프 스토어**로 이관하여, 탭 언마운트와 함께 상태가 자연 소멸하도록 합니다.

---

## P0-4. 150ms 동기화 타이머의 언마운트 정리 부재 → 문서 간 교차 오염

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:361, 470-476`

**[근본 원인]**
`contentSyncTimerRef`는 **다음 키 입력 시에만** 해제됩니다. `<BlockEditor key={activeTab.id}>`는 탭 전환마다 언마운트되므로, 전환 직전 150ms 이내에 예약된 타이머가 **새 문서 컨텍스트에서** 발화하여 `updateContent(getMergedContent())`를 실행합니다. 그 시점 스토어 내용이 새 탭의 `rawContent`로 기록되고 새 탭이 dirty로 표시됩니다. `handleMerge`의 `setTimeout(..., 0)`(라인 481)도 동일 계열의 위험입니다.

**[조치 방안]**
```typescript
// 언마운트 시 flush-then-cancel
useEffect(() => () => {
  if (contentSyncTimerRef.current) {
    clearTimeout(contentSyncTimerRef.current);
    contentSyncTimerRef.current = null;
    useDocumentStore.getState().updateContent(
      useBlockStore.getState().getMergedContent(),
    );
  }
}, []);
```
권장: `useDebouncedCallback(fn, 150)` 커스텀 훅으로 추출하여 `cancel()` / `flush()`를 노출하고, `saveFile` 진입 시 `flush()`를 먼저 호출합니다.

---

## P0-5. `closeTab` / `Cmd+W` — dirty 탭을 경고 없이 파괴

**[파일 & 라인]**
`project/src/entities/document/model/store.ts:293-320`, `407-426`
`project/src/pages/WorkspacePage/WorkspacePage.tsx:58-65`

**[근본 원인]**
`closeTab`은 탭을 배열에서 필터링해 제거하며 `cache`와 `isDirty`를 함께 폐기합니다. 어떠한 가드도 없습니다. `Cmd+W`, 탭의 `X` 버튼이 이 액션에 직결되어 있고, `handleFileDeleted`도 이를 반복 호출합니다. 현재 앱에서 dirty 경고를 하는 유일한 지점은 파일 탐색기뿐입니다. 앱 종료 시에도 모든 dirty 탭이 조용히 소실됩니다.

**[조치 방안]**
스토어는 부수효과 없이 유지하고, UI 경계에서 가드를 겁니다.
```typescript
// PaneContainer / Cmd+W 핸들러
const tab = pane.tabs.find(t => t.id === tabId);
if (tab?.isDirty && !window.confirm('저장되지 않은 변경 사항이 있습니다. 탭을 닫으시겠습니까?')) return;
closeTab(pane.id, tabId);
```
추가로 Tauri `getCurrentWindow().onCloseRequested()`에 dirty 탭 확인 로직을 연결하십시오.

---

## P0-6. Read 모드 드래그 재정렬이 자식 블록을 고아로 만들고 즉시 디스크에 기록

**[파일 & 라인]**
`project/src/entities/block/model/store.ts:232-242`
`project/src/widgets/BlockEditor/ui/ReadView.tsx:314-330`

**[근본 원인]**
`reorderBlocks`는 `flattenTree(blocks)`의 **평면 인덱스** 하나만 splice합니다. 헤딩 노드와 그 `children`은 평면 리스트에서 별개 항목이므로, `H2` 카드를 드래그하면 **헤딩 한 줄만 이동**하고 본문·하위 섹션은 제자리에 남아 직전 헤딩의 하위로 재편입됩니다.
`handleDrop`은 이어서 `updateContent` + `await saveFile()`(라인 326)을 실행하므로, 뒤엉킨 문서가 사용자가 인지하기 전에 **디스크에 확정 저장**되며 블록 간 undo 수단이 없습니다.
또한 `findIndex`가 `-1`을 반환할 경우 `splice(-1, 1)`이 되어 잘못된 요소를 제거하거나 `undefined`가 배열에 삽입되어 후속 `.content` 접근에서 크래시합니다.

**[조치 방안]**
```typescript
reorderBlocks: (fromIndex, toIndex) => {
  const flat = flattenTree(get().blocks);
  if (fromIndex < 0 || fromIndex >= flat.length) return;   // 경계 검사
  if (toIndex < 0 || toIndex >= flat.length || fromIndex === toIndex) return;

  const node = flat[fromIndex];
  const group = [node, ...flattenTree(node.children)];      // 서브트리 통째로 이동
  const rest = flat.filter(b => !group.includes(b));
  const target = flat[toIndex];
  const insertAt = rest.indexOf(target);
  rest.splice(insertAt < 0 ? rest.length : insertAt, 0, ...group);

  get().setBlocksFromContent(rest.map(b => b.content).join('\n'));
},
```
`handleDrop`의 자동 `saveFile()`은 제거하고 dirty 표시만 남겨 `Cmd+S`로 확정하게 합니다.

---

# 🟡 P1 — Major

## P1-1. `startsWith` 경로 매칭이 이름이 비슷한 형제 파일을 오염

**[파일 & 라인]** `project/src/entities/document/model/store.ts:381, 398, 415`

**[근본 원인]**
`t.filePath.startsWith(oldPath)`는 경로를 **경계 없는 문자열 접두사**로 취급합니다.
- 폴더 `/w/plan` → `/w/roadmap` 이름 변경 시, 열려 있던 `/w/plan_v2.md` 탭까지 `/w/roadmap_v2.md`로 잘못 재작성됩니다.
- 폴더 `/w/doc` 삭제 시 `/w/document.md` 탭이 함께 닫힙니다.
- `String.replace(oldPath, newPath)` 역시 앵커링되지 않아 동일한 결함을 가집니다.

**[조치 방안]**
`shared/lib/path.ts`를 신설하고 세 지점 모두 교체합니다.
```typescript
export const isSameOrInside = (target: string, base: string) =>
  target === base || target.startsWith(base + '/');

export const rebasePath = (target: string, oldBase: string, newBase: string) =>
  newBase + target.slice(oldBase.length);
```

---

## P1-2. `isDirty`가 저장 기준선이 아닌 직전 메모리 값과의 델타

**[파일 & 라인]** `project/src/entities/document/model/store.ts:442-458`, `462-475`

**[근본 원인]**
`hasChanged = content !== rawContent`는 **직전 인메모리 값**과 비교합니다. 디스크에 저장된 내용과의 비교가 아닙니다.
- 동일 내용을 재방출하는 경로(`ErdDesignerMainView.tsx:40`, `ReadView.tsx:279`, `BlockEditor.tsx:469`와 474의 디바운스 경합)에서 `hasChanged=false`가 되어, **디스크가 아직 옛 내용인데도 dirty 점이 사라집니다.**
- 반대로 편집 후 Undo로 저장 시점 텍스트로 되돌려도 dirty가 해제되지 않습니다.
- `updateNodeCoordinate`는 전역 `isDirty`만 true로 만들고 `tabs[].isDirty`는 갱신하지 않아, 마인드맵 노드 드래그 시 탭 마커가 뜨지 않습니다(`updateContent`와 동작 불일치).

**[조치 방안]**
`TabItem`에 `savedContent`를 추가하여 `loadFile`/`saveFile`에서 갱신하고 `isDirty = content !== tab.savedContent`로 계산합니다. 패널/탭 dirty 갱신 로직은 `_setTabDirty(dirty)` 헬퍼 하나로 통합하여 `updateContent`와 `updateNodeCoordinate` 양쪽에서 호출합니다.

---

## P1-3. 워크스페이스 전환 시 `blockStore`에 이전 문서 AST가 잔존

**[파일 & 라인]**
`project/src/entities/workspace/model/store.ts:35, 51`
`project/src/entities/block/model/store.ts:106-171`

**[근본 원인]**
`openWorkspace` / `openWorkspaceByPath`는 `resetDocumentState()`만 호출합니다. `useBlockStore.blocks`는 이전 워크스페이스 문서의 전체 트리를 유지하며,
(a) 앱 생명주기 동안 회수되지 않는 메모리이고,
(b) 다음 문서 로드 시 `existingByKey` ID 매칭(라인 146-156)의 입력으로 사용되어 **문서 간 블록 identity가 누수**됩니다.
`viewMode`도 리셋 대상에서 빠져 있습니다. 이는 기존 가이드라인의 "Data Contamination 구조적 결함" 항목이 그대로 남아 있는 상태입니다.

**[조치 방안]**
`blockStore`에 `resetBlocks: () => set({ blocks: [], activeBlockId: null, focusOffset: 0 })`를 추가하고 `resetDocumentState`에서 함께 호출합니다(`viewMode: 'write'` 포함). 중기적으로는 컨텍스트 경계 변경을 일괄 통제하는 `useWorkspaceManager`로 승격시킵니다.

---

## P1-4. 비헤딩 블록이 첫 줄 원문을 키로 사용 → 블록 간 ID 탈취

**[파일 & 라인]** `project/src/entities/block/model/store.ts:47`, `146-156`

**[근본 원인]**
`deriveBlockKey`는 `level === 0` 블록에 대해 `firstLine`을 그대로 키로 반환합니다. 모든 빈 블록의 키는 `''` 이고, `- 항목`이나 `|` 로 시작하는 흔한 텍스트도 전부 충돌합니다. `existingByKey`는 **첫 번째 매치만** 보존하므로, 리빌드 시 뒤쪽 블록이 앞쪽 블록의 `id`를 물려받습니다. 결과적으로 엉뚱한 `<CodeMirrorBlock>`이 리마운트되어 포커스가 날아가고 진행 중인 IME 조합이 끊깁니다. `ticket/debug/`에 반복 등록된 커서 점프 계열 이슈의 잔존 원인으로 가장 유력합니다.

**[조치 방안]**
비헤딩 블록은 위치 기반 키를 사용합니다.
```typescript
if (!parsed) {
  const parentKey = parentKeyStack.at(-1)?.key ?? '';
  const slot = `${parentKey}#text`;
  sibMap[slot] = (sibMap[slot] ?? 0) + 1;
  return `${slot}:${sibMap[slot]}`;      // 동일 문구라도 위치가 다르면 구분
}
```

---

## P1-5. 키 입력 1회당 `onUpdate`가 2회 호출

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:173-202`

**[근본 원인]**
`EditorView.domEventHandlers.input`(173-182)과 `EditorView.updateListener`(183-202)가 **일반 타이핑에 대해 둘 다** 발화하며 각각 `callbacksRef.current.onUpdate`를 호출합니다. 결과적으로 `setDirty`, `findOldContent`, `countHeadings` 2회, `updateBlockContent`가 문자당 두 번씩 실행되고 150ms 디바운스도 두 번 재설정됩니다.

**[조치 방안]**
`domEventHandlers.input` 핸들러를 삭제합니다. `updateListener`가 동일 범위를 커버하면서 `external` 트랜잭션 필터와 IME 조합 가드까지 갖추고 있어 상위 호환입니다.

---

## P1-6. 임의 블록 언마운트가 전역 활성 에디터 뷰를 null로 만듦

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:228-232` · `project/src/shared/lib/activeEditorView.ts`

**[근본 원인]**
cleanup에서 `setActiveEditorView(null)`을 조건 없이 호출합니다. 블록은 `setBlocksFromContent`가 돌 때마다(분할·병합·재정렬) 재생성되므로, **다른 블록이 포커스를 쥐고 있는 상태에서** 무관한 블록이 파괴되어도 전역 포인터가 비워집니다. `useTauriInputManager({ enabled: () => !!getActiveEditorView() })`가 비활성화되어 사용자가 에디터를 다시 클릭할 때까지 이미지 붙여넣기가 조용히 멈춥니다.

**[조치 방안]**
```typescript
return () => {
  if (getActiveEditorView() === view) setActiveEditorView(null);
  view.destroy();
  viewRef.current = null;
};
```

---

## P1-7. 병합 시 `#{1,4}`만 제거하며, 존재하지 않을 수 있는 ID로 포커스 복원

**[파일 & 라인]** `project/src/entities/block/model/store.ts:204`, `216-222`

**[근본 원인]**
`parseHeadingLine`은 `#{1,6}`을 인식하므로 H5/H6 블록을 병합하면 `##### ` 리터럴이 본문에 남습니다.
더 심각한 것은 순서입니다 — `setBlocksFromContent(fullText)`로 트리를 **재생성한 뒤** `set({ activeBlockId: previousBlock.id })`를 실행합니다. 재생성 과정에서 키 매칭이 실패해 새 `id`가 부여되면 그 ID는 더 이상 존재하지 않고, Backspace 병합 직후 포커스가 사라집니다.

**[조치 방안]**
```typescript
const cleanedCurrentText = currentBlock.content.replace(/^#{1,6}\s*/, '');
// ...
get().setBlocksFromContent(fullText);
const rebuilt = flattenTree(get().blocks);              // 재생성 후 위치로 해석
set({ activeBlockId: rebuilt[index - 1]?.id ?? null, focusOffset });
```

---

## P1-8. 모든 이미지를 base64 Data URL로 인라인 (메모리 최적화 스프린트 직결)

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/ReadView.tsx:164-185` · `project/src-tauri/src/lib.rs:32-54`

**[근본 원인]**
`resolveAssetPaths`가 `src`를 투명 픽셀로 비우고, 이펙트가 이미지마다 `read_image_base64`를 invoke하여 **원본 대비 약 1.37배로 부푼 사본을 DOM에 상주**시킵니다. 이 이펙트는 `blocks`가 바뀔 때마다 재실행되고, `document.querySelectorAll`이 전역이라 다른 패널의 ReadView 이미지까지 함께 긁습니다. Rust 측은 `async`로 선언되었으나 내부는 블로킹 `std::fs::read`라 런타임을 점유합니다.

**[조치 방안]**
`assetProtocol`이 이미 활성화되어 있으므로 IPC 왕복과 base64 사본을 전부 제거할 수 있습니다.
```typescript
import { convertFileSrc } from '@tauri-apps/api/core';
// resolveAssetPaths 에서 곧바로:
return `src="${convertFileSrc(absPath)}"`;
```
스코프는 P0-1에 따라 워크스페이스 하위로 좁히고, `querySelectorAll`은 컴포넌트 `ref` 하위로 한정합니다.

---

# 🟢 P2 — 리팩터링 / 성능

## P2-1. 스토어 전체 구독으로 매 입력마다 앱 전역 리렌더

**[파일 & 라인]**
`BlockEditor.tsx:339` · `MindView.tsx:189` · `WorkspacePage.tsx:30-38` · `ErdDesignerMainView.tsx:7` · `ReadView.tsx:140-143`

**[근본 원인]** 셀렉터 없는 `useDocumentStore()` / `useBlockStore()`는 **모든 필드**를 구독합니다. 디바운스된 `updateContent` 한 번이 `MindView` SVG 전체와 `WorkspacePage`를 다시 그리고, 노드 드래그 중 매 mousemove의 `updateNodeCoordinate`(MindView.tsx:290-321)가 `BlockEditor` 트리 전체를 리렌더합니다.

**[조치 방안]** 필드 단위 셀렉터(`useDocumentStore(s => s.rawContent)`)로 전환하고, 다중 필드는 `useShallow`를 사용합니다. MindView 드래그는 좌표를 ref + `requestAnimationFrame`에 버퍼링한 뒤 `mouseup`에서 1회만 스토어에 커밋합니다.

## P2-2. 블록 컴포넌트의 `React.memo`가 무력화됨

**[파일 & 라인]** `BlockEditor.tsx:304-312`, `520-531`
**[근본 원인]** `BlockNode`가 렌더마다 새 화살표 함수 5개를 `CodeMirrorBlock`에 넘기고, 커서 이동마다 바뀌는 `activeBlockId`/`focusOffset`을 트리 전체에 관통시켜 memo 경계가 성립하지 않습니다.
**[조치 방안]** `CodeMirrorBlock`이 자신의 포커스 상태를 직접 구독(`useBlockStore(s => s.activeBlockId === id)`)하고, 핸들러는 `useCallback`으로 안정화한 뒤 `id`만 전달합니다.

## P2-3. `renderBlockToHtml`이 렌더마다 재파싱

**[파일 & 라인]** `ReadView.tsx:450-452`
**[근본 원인]** JSX 인라인 호출이라 부모가 리렌더될 때마다 모든 블록에서 `marked.parse` + `hljs.highlight`가 재실행됩니다.
**[조치 방안]** `const html = useMemo(() => renderBlockToHtml(block.content, workspacePath), [block.content, workspacePath]);`

## P2-4. `codeContent` 문자열 누적이 O(N²) *(기존 항목 미해결)*

**[파일 & 라인]** `CodeBlockDecorator.ts:80, 83`
**[조치 방안]** `string[]`에 `push`하고 펜스 종료 시 `join('\n')`.

## P2-5. `generateId`의 `Math.random` 의존 *(기존 항목 미해결)*

**[파일 & 라인]** `block/store.ts:24`
**[조치 방안]** `crypto.randomUUID()` 사용. 여기서의 충돌은 React key와 포커스 타깃을 동시에 망가뜨립니다.

## P2-6. 닫히지 않은 코드 펜스가 문서 전체를 한 블록으로 붕괴시킴

**[파일 & 라인]** `block/store.ts:117-132` · `parser.ts:31-36`
**[근본 원인]** `insideCodeFence` 불리언이 펜스 문자 종류·길이를 대조하지 않고 토글되며, EOF에서 리셋되지 않습니다. 사용자가 여는 펜스를 입력하는 **순간** 그 아래 모든 헤딩이 경계 자격을 잃어 문서 후반이 하나의 CodeMirror 블록으로 합쳐지고 마인드맵 노드가 사라집니다.
**[조치 방안]** `CodeBlockDecorator`처럼 여는 펜스의 문자/길이를 기억해 대응하는 닫는 펜스만 인정하고, 미종료 펜스는 슬라이싱 관점에서 "펜스 없음"으로 취급해 실시간 입력이 문서 구조를 흔들지 않게 합니다.

## P2-7. Rust 기동 경로의 panic 위험

**[파일 & 라인]** `project/src-tauri/src/lib.rs:67, 71`
**[근본 원인]** `splashscreen.close().unwrap()` / `main_window.show().unwrap()` — reveal 시퀀스 실패 시 `Err` 반환이 아니라 커맨드 내부 panic이 발생합니다. `App.tsx:28-36`에 이미 JS 폴백이 있음에도 도달하지 못합니다.
**[조치 방안]** `close_splashscreen`을 `Result<(), String>`으로 바꾸고 두 호출 모두 `map_err`로 승격합니다.

## P2-8. `ImageDecorator`의 사문화된 커서 스킵 코드

**[파일 & 라인]** `ImageDecorator.ts:93`
**[근본 원인]** 내부 정규식 루프의 `pos = line.to + 1`은 라인 105에서 즉시 덮어써집니다. 동작은 정상이나 외부 루프를 전진시키는 것처럼 읽혀 유지보수자를 오도합니다.
**[조치 방안]** 라인 93을 삭제하고 `continue;`만 남깁니다.

---

## 📊 조치 우선순위 요약

| 순위 | 항목 | 유형 | 영향도 | 난이도 |
|---|---|---|---|---|
| 1 | P0-1 마크다운 XSS → 임의 파일 접근 | 🔒 보안 | 치명 | 중간 |
| 2 | P0-2 `openTab` 미저장 편집 소실 | 🔴 데이터 로스 | 치명 | 쉬움 |
| 3 | P0-6 드래그 재정렬 문서 손상 + 즉시 저장 | 🔴 데이터 로스 | 치명 | 중간 |
| 4 | P0-4 디바운스 타이머 교차 오염 | 🔴 데이터 로스 | 높음 | 쉬움 |
| 5 | P0-5 dirty 탭 무경고 종료 | 🔴 데이터 로스 | 높음 | 쉬움 |
| 6 | P0-3 분할 패널 전역 상태 공유 | 🔴 구조 결함 | 높음 | 높음 |
| 7 | P1-1 경로 접두사 매칭 오염 | 🟡 버그 | 중간 | 쉬움 |
| 8 | P1-8 base64 이미지 인라인 (메모리) | 🟡 성능/메모리 | 중간 | 쉬움 |
| 9 | P1-4 비헤딩 블록 키 충돌 (커서 유실) | 🟡 버그 | 중간 | 중간 |
| 10 | P1-5 입력당 이중 `onUpdate` | 🟡 성능 | 중간 | 쉬움 |
| 11 | P1-2 dirty 기준선 부재 | 🟡 버그 | 중간 | 중간 |
| 12 | P1-3 워크스페이스 전환 시 blockStore 잔존 | 🟡 메모리 | 중간 | 쉬움 |
| 13 | P1-6 전역 활성 뷰 null 처리 | 🟡 버그 | 중간 | 쉬움 |
| 14 | P1-7 병합 regex / 포커스 복원 | 🟡 버그 | 중간 | 쉬움 |
| 15 | P2-1 · P2-2 · P2-3 렌더링 최적화 | 🟢 성능 | 중간 | 중간 |
| 16 | P2-4 ~ P2-8 코드 품질 | 🟢 품질 | 낮음 | 쉬움 |

### 권장 진행 순서

1. **이번 스프린트 (데이터 안전성)**: P0-2, P0-4, P0-5, P0-6 — 모두 국소 수정이며 각각이 현재 사용자 작업물을 실제로 소실시킵니다.
2. **외부 파일 공유/배포 이전 필수**: P0-1 — 유일하게 앱 경계를 넘어 파급되는 보안 결함입니다.
3. **메모리 최적화 스프린트와 병행**: P1-8, P1-3, P2-1, P2-2, P2-3 — 실제 할당·리렌더 핫스팟이며, 특히 P1-8이 단일 최대 할당원을 제거합니다.
4. **v1.0.0 탭 스코프 리팩터링에 통합**: P0-3, P1-2 — 개별 패치보다 Phase 4~5 아키텍처 개편에 함께 반영하는 편이 중복 작업을 막습니다.

---

## 👍 잘 유지되고 있는 부분

- **Decorator Orchestrator 패턴**: 신규 문법 추가 시 파일 1개 추가로 끝나는 확장성이 그대로 유지되고 있습니다.
- **IME 3중 방어선**: `useImeInputManager` + `ImeIsolation` 확장 + `view.composing` 가드가 키맵 단위까지 일관되게 적용되어 있습니다.
- **코드 펜스 격리**: 파서·블록 슬라이서·헤딩 카운터 세 곳 모두 펜스를 인식하도록 통일되었습니다(미종료 펜스 처리만 P2-6로 남음).
- **`headingId.ts` 단일화**: 파서와 블록 스토어가 동일한 키 생성 함수를 공유하여 계층 간 ID 해석이 일치합니다.
- **`FileSystemRepository` 인터페이스**: Mock/Tauri 이중 구현으로 테스트 친화성이 유지되고 있습니다.
- **패널 GC 및 병합 로직**: `REF-20260810-01` 주석과 함께 최소 1개 패널 보장·인접 패널 병합이 방어적으로 구현되어 있습니다.
- **ERD 엔티티 런타임 검증**: `erd.ts`의 `isRecord` / `normalizeTable` / `normalizeRelation`이 외부 JSON 입력을 방어적으로 정규화합니다.
- **엄격한 TypeScript 설정과 이슈 레퍼런스 주석 관행**(`BUG-20260810-05`, `REF-20260810-01` 등)이 계속 지켜지고 있습니다.

---

# 📎 부록 A. 해결 완료 항목 아카이브 (2026-08-15 → 2026-08-26)

아래는 구 `code_review.md`에서 지적되었고 v0.8.2 시점에 **코드에서 해결이 확인된** 항목입니다. 회귀 방지를 위해 원래 결함과 현재 구현을 함께 남깁니다.

| 항목 | 원래 결함 | v0.8.2 현재 구현 | 확인 위치 |
|---|---|---|---|
| 코드 블록 격리 | 정규식을 전체 라인에 매핑해 펜스 내부 `# 주석`을 헤딩으로 오인 | `insideCodeFence` 토글로 펜스 구간 스킵 | `project/src/entities/document/lib/parser.ts:29-36` |
| 블록 분할 방식 | `split('\n\n')` 으로 표·코드블록이 조각남 | 라인 스캐너가 H1~H3 경계에서만 분할, 펜스 내부는 무시 | `project/src/entities/block/model/store.ts:111-140` |
| `applyFormat` 중첩 블록 | `blocks.find()`로 루트만 탐색해 H2/H3 포맷이 무음 실패 | `flattenTree(...).find()`로 전체 트리 탐색 | `project/src/widgets/BlockEditor/ui/ReadView.tsx:259-261` |
| 탭 전환 데이터 손실 | 탭 전환마다 디스크 재독취로 미저장분 소실 | `TabCache` 스냅샷/복원 도입 (단, `openTab` 경로는 **P0-2**로 잔존) | `project/src/entities/document/model/store.ts:9-13, 215-250` |
| ERD 탭 이름변경/삭제 | `type === 'markdown'` 만 처리 | `markdown \| erd` 모두 처리 (단, 접두사 매칭은 **P1-1**) | `project/src/entities/document/model/store.ts:381, 415` |
| `splitPane` direction | 파라미터를 무시하고 항상 우측 추가 | `layoutDirection` 상태로 `flex-col/flex-row` 분기 | `project/src/entities/document/model/store.ts:357-374`, `WorkspacePage.tsx:214` |
| 동일 라인 다중 이미지 | 커서가 첫 이미지에 닿으면 이후 이미지 스킵 | `ranges` 수집 후 정렬·중첩 제거 방식으로 재작성 | `project/src/shared/lib/editor/decorators/impl/ImageDecorator.ts:69-116` |
| `Cmd+C` 전역 충돌 | `window` 리스너라 에디터 텍스트 복사와 충돌 | `containerRef` 스코프 + `tabIndex={-1}` + 선택 시 포커스 | `project/src/widgets/FileExplorer/ui/FileExplorer.tsx:176-201` |
| 파서의 레이아웃 계산 | 순수 파서가 x/y 좌표를 계산 (관심사 위반) | 파서는 구조만 반환, 좌표는 `MindView.displayNodes`에서 계산 | `project/src/widgets/MindView/ui/MindView.tsx:199-213` |

---

# 📎 부록 B. 루트 ↔ `project/` 중복 파일 점검 결과

`node_modules` / `dist` / `.git` 을 제외하고 루트 트리와 `project/` 트리의 동일 파일명을 대조한 결과입니다. (macOS는 파일명 대소문자를 구분하지 않으므로 `code_review.md` 와 `CODE_REVIEW.md` 는 **동일 파일로 취급**됩니다.)

| 파일명 | 루트 측 | `project/` 측 | 내용 검증 | 조치 |
|---|---|---|---|---|
| `code_review.md` / `CODE_REVIEW.md` | `code_review.md` (533줄, 2026-08-15) | `project/CODE_REVIEW.md` (467줄, 2026-08-26) | 동일 주제의 **세대 차이 문서**. 구 문서의 지적 23건 중 8건은 이미 해결되어 사실과 불일치, 신 문서는 해결 이력이 없음 | ✅ **본 문서로 통합 완료** (루트 `code_review.md`) |
| `advanced_rendering_optimization.md` | `ticket/impl/advanced_rendering_optimization.md` (36줄) | `project/advanced_rendering_optimization.md` (44줄) | **같은 4개 전략을 각각 다른 문장으로 서술한 독립 초안 2종.** 루트판 고유: 탭당 100MB 실측치, Rust 오프로딩, 3단계 적용안 / 프로젝트판 고유: 상태 스냅샷, WebGL Instancing, WebView 1.5~2GB 한계, 4단계 로드맵 | ✅ **루트 `advanced_rendering_optimization.md` 로 통합 완료** |
| `erd.ts` | `reference_project/erd_design/src/erd.ts` (331줄) | `project/src/entities/erd/model/erd.ts` (321줄) | 참조 구현 → FSD 이식본. 차이 12줄(임포트 경로 중심) | 유지 — 참조본은 읽기 전용 원본 |
| `relations.ts` | `reference_project/…/relations.ts` (169줄) | `project/src/entities/erd/lib/relations.ts` (162줄) | 차이 16줄 | 유지 |
| `staticRenderer.ts` | `reference_project/…/staticRenderer.ts` (176줄) | `project/src/entities/erd/lib/staticRenderer.ts` (176줄) | 차이 8줄 | 유지 |
| `settings.ts` | `reference_project/…/settings.ts` (121줄) | `project/src/entities/erd/model/settings.ts` (17줄) | ⚠️ **차이 129줄 — 이식본이 원본의 1/7 수준.** 참조 구현의 ERD 설정 옵션 대부분이 이식되지 않은 상태 | 🔎 **확인 필요** — 의도적 축소인지, 이식 누락인지 판단 후 티켓화 권장 |
| `.serena/project.yml` | `.serena/project.yml` (`project_name: "Devoras"`) | `project/.serena/project.yml` (`project_name: "project"`) | 도구 설정 중복. 이름만 상이 | 🔎 Serena 활성 프로젝트를 하나로 정리 권장 |
| `.gitignore` / `.DS_Store` | 루트 | `project/` | 정상 중복(계층별 무시 규칙 / OS 생성물) | 조치 불필요 |

### 통합 후 정리 대상 (삭제는 별도 확인 필요)

- `project/CODE_REVIEW.md` — 전 내용이 본 문서에 반영됨. **미추적(untracked) 파일이므로 삭제 시 복구 불가.**
- `project/advanced_rendering_optimization.md`, `ticket/impl/advanced_rendering_optimization.md` — 두 초안 모두 루트 통합본에 반영됨. 둘 다 git 추적 중이라 삭제해도 복구 가능.

> 참고: 통합 전 루트 `code_review.md` 원본은 `git show HEAD:code_review.md` 로 언제든 복원할 수 있습니다.
