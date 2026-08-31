/**
 * T3 하네스 — WKWebView 실기 검증 (V3 · V4 · V6 · R7)
 *
 * ## 왜 이 형태인가
 * 이전까지 T3 는 `tauri-plugin-mcp-bridge` 를 세션마다 붙였다 떼는 방식이었다.
 * 그래서 T3 에서 나온 결론이 **회귀로 고정되지 않고 매번 휘발**됐다
 * (ARCHITECTURE_FINDINGS.md A4). 이 파일은 그 의식을 없애기 위한 것이다 —
 * 저장소에 남고, 아무 설정 변경 없이, 개발자 콘솔 한 줄로 다시 돌릴 수 있다.
 *
 * ## 실행법
 *   1) pnpm tauri:dev
 *   2) 앱 창에서 워크스페이스를 열고 마크다운 파일을 하나 연다
 *   3) 웹뷰 개발자 도구 콘솔에 아래 한 줄을 붙여넣는다
 *
 *        const t3 = await import('/src/widgets/BlockEditor/__tests__/tauri_t3_harness.ts'); await t3.run()
 *
 *   4) 출력된 JSON 을 그대로 보고에 붙인다
 *
 * ## 판정 기준 (DEBUG_PLAN §5.1)
 * V 기준은 **0px 다. 근사치 통과 금지.** 0 이 아니면 스왑이나 리마운트가 남아 있다는 신호다.
 *
 * ## 한계 (반드시 함께 보고할 것)
 * 클릭은 `MouseEvent` 합성으로 만든다. 실제 사람의 클릭과 완전히 같지는 않다.
 * 다만 이 게이트들이 보는 것은 **클릭이 유발하는 포커스·DOM 변화가 스크롤을 흔드는가**이고,
 * 그 경로는 합성 이벤트로도 동일하게 탄다. 사람이 직접 클릭한 교차 확인이 있으면 더 좋다.
 */

type GateResult = {
  gate: string;
  pass: boolean | null;
  detail: Record<string, unknown>;
  note?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/** 패널의 스크롤 컨테이너들. 앱 구조상 `overflow-y-auto` 를 가진 div 가 패널당 하나다. */
export function paneScrollers(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const w of Array.from(document.querySelectorAll('.block-node-wrapper'))) {
    let el: HTMLElement | null = w.parentElement;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      el = el.parentElement;
    }
    if (el && !out.includes(el)) out.push(el);
  }
  return out;
}

function findScroller(): HTMLElement | null {
  return paneScrollers()[0] ?? null;
}

/** 컨테이너가 **실제로** 넘쳐서 스크롤 가능한지. 이게 아니면 V 게이트는 공허하게 통과한다. */
function isScrollable(el: HTMLElement | null): boolean {
  return !!el && el.scrollHeight > el.clientHeight + 1;
}

/** 요소 중앙에 진짜에 가까운 클릭을 합성한다 (mousedown → mouseup → click). */
function clickCenter(el: Element) {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    el.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }),
    );
  }
}

/** V 게이트가 의미를 가지려면 패널이 실제로 넘쳐야 한다. 문서를 충분히 길게 만든다. */
export function padBlocks(from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    out.push(`## 여백 블록 ${i}`, '', `여백 블록 ${i} 의 본문 첫 줄.`, `여백 블록 ${i} 의 본문 둘째 줄.`, '');
  }
  return out;
}

export async function loadFixture(markdown: string) {
  const docMod = await import('@/entities/document/model/store');
  const registryMod = await import('@/entities/document/model/tabStoreRegistry');
  const tab = docMod.useDocumentStore.getState().getActiveTab();
  if (!tab) throw new Error('열린 문서가 없습니다. 워크스페이스에서 마크다운 파일을 먼저 여세요.');
  // C-4(REF-20260831-01): 블록 스토어가 탭 스코프로 바뀌었다 — 실행 중인 앱에서
  // TabDocumentProvider 가 이미 이 탭의 스토어를 레지스트리에 등록해 뒀다.
  const tabStore = registryMod.getTabStore(tab.id);
  if (!tabStore) throw new Error(`탭 ${tab.id} 에 마운트된 탭 스코프 스토어를 찾을 수 없습니다.`);
  tabStore.getState().setContent(markdown);
  docMod.useDocumentStore.getState().updateContentForTab(tab.id, markdown);

  // 고정 sleep 을 쓰면 안 된다. 블록 하나당 마운트 비용이 40~87ms 라
  // (ARCHITECTURE_FINDINGS.md A6) 40 블록이면 2~3초가 걸리고, 그 전에 재면
  // "블록이 없다"는 잘못된 SKIP 이 난다. DOM 이 안정될 때까지 기다린다.
  const expected = markdown.split('\n').filter((l) => /^#{1,3} /.test(l)).length;
  const deadline = Date.now() + 20000;
  let stable = 0;
  let last = -1;
  while (Date.now() < deadline) {
    const n = document.querySelectorAll('.block-node-wrapper').length;
    stable = n === last && n >= expected ? stable + 1 : 0;
    last = n;
    if (stable >= 3) break;     // 연속 3프레임 동안 변화 없음 = 마운트 완료
    await raf();
    await sleep(60);
  }
  await sleep(200);
  await raf();
}

/** 블록 왕복 시 기준 블록의 화면상 위치와 스크롤이 흔들리는지 잰다. */
async function roundTrip(anchorIdx: number, rounds: number) {
  const scroller = findScroller();
  if (!isScrollable(scroller)) {
    return { skipped: true as const, reason: '패널이 넘치지 않아 스크롤 거동을 잴 수 없다', scrollerFound: !!scroller };
  }
  // 문서 중간으로 스크롤해 둔다 — 위/아래 어느 쪽으로 밀려도 관측되도록.
  scroller!.scrollTop = Math.floor((scroller!.scrollHeight - scroller!.clientHeight) / 2);
  await raf();
  await sleep(60);

  const blocks = Array.from(document.querySelectorAll('.block-node-wrapper'));
  if (blocks.length === 0) {
    return { skipped: true as const, reason: '블록이 렌더되지 않았다', scrollerFound: !!scroller };
  }
  // 화면 안에 보이는 블록만 클릭 대상으로 삼는다 (보이지 않는 블록 클릭은 무의미)
  const cRect = scroller!.getBoundingClientRect();
  const visible = blocks.filter((b) => {
    const r = b.getBoundingClientRect();
    return r.bottom > cRect.top && r.top < cRect.bottom;
  });
  const targets = visible.length >= 2 ? visible : blocks.slice(0, Math.min(4, blocks.length));
  const anchor = targets[Math.min(anchorIdx, targets.length - 1)];

  const startTop = anchor.getBoundingClientRect().top;
  const startScroll = scroller!.scrollTop;
  let maxTopDelta = 0;
  let maxScrollDelta = 0;

  for (let i = 0; i < rounds; i++) {
    for (const b of targets) {
      const target = b.querySelector('.cm-content') ?? b;
      clickCenter(target);
      await raf();
      await sleep(40);
      maxTopDelta = Math.max(maxTopDelta, Math.abs(anchor.getBoundingClientRect().top - startTop));
      maxScrollDelta = Math.max(maxScrollDelta, Math.abs(scroller!.scrollTop - startScroll));
    }
  }
  return {
    skipped: false as const,
    rounds,
    blocksTotal: blocks.length,
    blocksClickedPerRound: targets.length,
    scrollable: true,
    startScrollTop: startScroll,
    endScrollTop: scroller!.scrollTop,
    startAnchorTop: +startTop.toFixed(2),
    endAnchorTop: +anchor.getBoundingClientRect().top.toFixed(2),
    maxAnchorTopDeltaPx: +maxTopDelta.toFixed(2),
    maxScrollTopDeltaPx: +maxScrollDelta.toFixed(2),
  };
}

// ── V3: 이미지 포함 블록 ↔ 다른 블록 왕복, 이미지 로드 완료 후에도 위치 불변 ──────
export async function gateV3(assetPath: string | null): Promise<GateResult> {
  if (!assetPath) {
    return { gate: 'V3 이미지 블록 왕복', pass: null, detail: {}, note: 'R7 자산 생성 실패로 미실행' };
  }
  await loadFixture(
    [
      '# V3 이미지 왕복',
      '',
      '기준 문단 — 이 줄의 화면 위치가 흔들리면 실패다.',
      '',
      '## 이미지 블록',
      '',
      `![t3](${assetPath})`,
      '',
      ...padBlocks(1, 40),
    ].join('\n'),
  );

  // 이미지 로드가 끝난 뒤를 재야 의미가 있다 (레이아웃이 늦게 커지는 것이 이 게이트의 표적)
  const imgs = Array.from(document.querySelectorAll('.cm-editor img')) as HTMLImageElement[];
  await Promise.all(
    imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; }))),
  );
  await sleep(300);
  await raf();

  const res = await roundTrip(0, 3);
  const loaded = imgs.filter((im) => im.naturalWidth > 0).length;
  if (res.skipped) {
    return { gate: 'V3 이미지 블록 왕복', pass: null, detail: { ...res, imgCount: imgs.length, imgLoaded: loaded }, note: res.reason };
  }
  return {
    gate: 'V3 이미지 블록 왕복',
    pass: res.maxAnchorTopDeltaPx === 0 && res.maxScrollTopDeltaPx === 0,
    detail: { ...res, imgCount: imgs.length, imgLoaded: loaded },
  };
}

// ── V4: 코드펜스 블록 왕복 10회, 누적 드리프트 0px ────────────────────────────
export async function gateV4(): Promise<GateResult> {
  await loadFixture(
    [
      '# V4 코드펜스 왕복',
      '',
      '기준 문단 — 이 줄의 화면 위치가 흔들리면 실패다.',
      '',
      '## 코드 블록',
      '',
      '```js|title|="t3.js"',
      'const a = 1;',
      'const b = 2;',
      'console.log(a + b);',
      '```',
      '',
      ...padBlocks(1, 40),
    ].join('\n'),
  );
  const res = await roundTrip(0, 10);
  if (res.skipped) {
    return { gate: 'V4 코드펜스 왕복 10회', pass: null, detail: res, note: res.reason };
  }
  return {
    gate: 'V4 코드펜스 왕복 10회',
    pass: res.maxAnchorTopDeltaPx === 0 && res.maxScrollTopDeltaPx === 0,
    detail: res,
  };
}

// ── V6: 좌우 분할 2패널 — 한쪽 클릭이 반대 패널 scrollTop 을 흔들지 않는다 ────────
export async function gateV6(): Promise<GateResult> {
  const docMod = await import('@/entities/document/model/store');

  // 분할 **전에** 긴 문서를 실어야 한다. 분할된 패널이 같은 문서를 물려받으므로
  // 이렇게 해야 양쪽이 모두 넘치고, 그래야 스크롤 간섭을 잴 수 있다.
  await loadFixture(['# V6 2패널', '', '기준 문단', '', ...padBlocks(1, 40)].join('\n'));

  const ds = docMod.useDocumentStore.getState();
  if (ds.panes.length < 2) ds.splitPane(ds.activePaneId, 'horizontal');
  await sleep(2500);
  await raf();

  const panes = paneScrollers();
  if (panes.length < 2) {
    return {
      gate: 'V6 2패널 상호 간섭',
      pass: null,
      detail: { paneScrollersFound: panes.length, storePanes: docMod.useDocumentStore.getState().panes.length },
      note: '스크롤 컨테이너를 2개 찾지 못했습니다. 좌우 분할 후 **양쪽 패널에 각각 문서를 열고** 다시 실행하세요.',
    };
  }
  const [left, right] = panes;
  if (!isScrollable(left) || !isScrollable(right)) {
    return {
      gate: 'V6 2패널 상호 간섭',
      pass: null,
      detail: {
        leftScrollable: isScrollable(left), rightScrollable: isScrollable(right),
        left: { sh: left.scrollHeight, ch: left.clientHeight },
        right: { sh: right.scrollHeight, ch: right.clientHeight },
      },
      note: '양쪽 패널이 모두 넘쳐야 스크롤 간섭을 잴 수 있습니다. 각 패널에 충분히 긴 문서를 여세요.',
    };
  }

  left.scrollTop = Math.floor((left.scrollHeight - left.clientHeight) / 2);
  right.scrollTop = Math.floor((right.scrollHeight - right.clientHeight) / 2);
  await raf();
  await sleep(80);
  const leftBefore = left.scrollTop;
  const rightBefore = right.scrollTop;

  const rightBlock = right.querySelector('.cm-content') ?? right.querySelector('.block-node-wrapper');
  if (rightBlock) clickCenter(rightBlock);
  await sleep(250);
  await raf();
  const leftAfterRightClick = left.scrollTop;

  const leftBlock = left.querySelector('.cm-content') ?? left.querySelector('.block-node-wrapper');
  if (leftBlock) clickCenter(leftBlock);
  await sleep(250);
  await raf();
  const rightAfterLeftClick = right.scrollTop;

  const dLeft = Math.abs(leftAfterRightClick - leftBefore);
  const dRight = Math.abs(rightAfterLeftClick - rightBefore);
  return {
    gate: 'V6 2패널 상호 간섭',
    pass: dLeft === 0 && dRight === 0,
    detail: { leftBefore, leftAfterRightClick, oppositeDeltaPx_left: dLeft,
              rightBefore, rightAfterLeftClick, oppositeDeltaPx_right: dRight },
  };
}

// ── R7: .devoras/images 자산이 Write/Read 양쪽에서 렌더된다 ────────────────────
/** 1x1 붉은 점 PNG */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 자산 저장만 따로 — 렌더 검사(R7)와 분리해야 V 게이트가 이미지 실패에 오염되지 않는다. */
export async function createProbeAsset(): Promise<{ path: string | null; error?: string }> {
  const wsMod = await import('@/entities/workspace/model/store');
  const fsMod = await import('@/shared/api/fs');
  const workspacePath = wsMod.useWorkspaceStore.getState().workspacePath;
  if (!workspacePath) return { path: null, error: '워크스페이스가 열려 있지 않습니다.' };
  const bin = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
  try {
    const p = await fsMod.fileSystemRepository.saveImageAsset(
      workspacePath, bin, `t3_probe_${Date.now()}.png`, '.devoras/images',
    );
    return { path: p };
  } catch (e) {
    return { path: null, error: String(e) };
  }
}

/** 에디터 트리가 살아 있는지. ImageWidget.toDOM 이 던지면 React 서브트리가 통째로 죽는다. */
export async function ensureEditorAlive(): Promise<boolean> {
  await loadFixture(['# 복구 확인', '', '평문 한 줄', '', '## 두 번째', '', '평문'].join('\n'));
  return document.querySelectorAll('.block-node-wrapper').length > 0;
}

export async function gateR7(mdPath: string | null, saveError?: string): Promise<GateResult> {
  const docMod = await import('@/entities/document/model/store');
  const registryMod = await import('@/entities/document/model/tabStoreRegistry');
  if (!mdPath) {
    return { gate: 'R7 .devoras/images 렌더', pass: false, detail: { saveError: saveError ?? 'unknown' } };
  }

  // Write Mode — ImageDecorator 의 위젯이 asset:// 로 실제 픽셀을 그렸는지
  await loadFixture(['# R7 이미지', '', `![probe](${mdPath})`, '', '평문 꼬리'].join('\n'));
  const wImgs = Array.from(document.querySelectorAll('.cm-editor img')) as HTMLImageElement[];
  await Promise.all(
    wImgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; }))),
  );
  await sleep(300);
  const writeOk = wImgs.some((im) => im.naturalWidth > 0);
  const writeSrc = wImgs[0]?.src ?? null;

  // Read Mode — ReadView 의 resolveAssetPaths 경로
  // C-4: viewMode 는 이제 탭 스코프 스토어 소유다 — 활성 탭의 등록된 스토어에서 토글한다.
  const activeTab = docMod.useDocumentStore.getState().getActiveTab();
  const tabStore = activeTab ? registryMod.getTabStore(activeTab.id) : undefined;
  if (!tabStore) throw new Error('활성 탭의 탭 스코프 스토어를 찾을 수 없습니다.');
  tabStore.getState().setViewMode('read');
  await sleep(900);
  const rImgs = Array.from(document.querySelectorAll('.rv-content img')) as HTMLImageElement[];
  await Promise.all(
    rImgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; }))),
  );
  await sleep(300);
  const readOk = rImgs.some((im) => im.naturalWidth > 0);
  const readSrc = rImgs[0]?.src ?? null;
  tabStore.getState().setViewMode('write');
  await sleep(600);

  return {
    gate: 'R7 .devoras/images 렌더',
    pass: writeOk && readOk,
    detail: {
      markdownPath: mdPath,
      write: { imgCount: wImgs.length, rendered: writeOk, src: writeSrc },
      read: { imgCount: rImgs.length, rendered: readOk, src: readSrc },
    },
  };
}

export async function run() {
  const started = new Date().toISOString();
  const results: GateResult[] = [];
  const errors: string[] = [];

  const isTauri =
    typeof window !== 'undefined' &&
    ((window as any).__TAURI__ !== undefined || (window as any).__TAURI_INTERNALS__ !== undefined);

  const safe = async (label: string, fn: () => Promise<GateResult>) => {
    try {
      results.push(await fn());
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      errors.push(`${label}: ${msg}`);
      results.push({ gate: label, pass: false, detail: { error: msg } });
    }
    // 앞 게이트가 에디터 트리를 죽였다면 뒤 게이트의 결과는 의미가 없다. 매번 회복시킨다.
    try {
      if (!(await ensureEditorAlive())) {
        errors.push(`${label} 이후 에디터 트리가 렌더되지 않습니다 (React 서브트리 붕괴 가능성)`);
      }
    } catch { /* 회복 실패는 다음 게이트의 note 로 드러난다 */ }
  };

  // 자산 저장은 먼저. 렌더 검사(R7)와 이미지 왕복(V3)은 마지막에 몰아둔다 —
  // 이미지 위젯이 던지면 CodeMirror 뷰와 React 서브트리가 함께 죽어서
  // 뒤따르는 게이트가 "블록이 없다"는 잘못된 결과를 내기 때문이다.
  const asset = await createProbeAsset();

  await safe('V4 코드펜스 왕복 10회', gateV4);
  await safe('V6 2패널 상호 간섭', gateV6);
  await safe('V3 이미지 블록 왕복', () => gateV3(asset.path));
  await safe('R7 .devoras/images 렌더', () => gateR7(asset.path, asset.error));

  const out = {
    harness: 'tauri_t3_harness',
    startedAt: started,
    engine: navigator.userAgent,
    isTauri,
    criterion: 'V 게이트는 0px. 근사치 통과 금지 (DEBUG_PLAN §5.1)',
    caveat: '클릭은 합성 MouseEvent 다. 사람이 직접 클릭한 교차 확인이 있으면 더 좋다.',
    probeAsset: asset,
    results,
    summary: results.map((r) => `${r.gate}: ${r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}`),
    errors,
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}
