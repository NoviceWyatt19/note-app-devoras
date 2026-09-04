/**
 * T2 하네스 — `SingleDocEditor` 마운트 비용 실측 (DEBUG_PLAN §5.0.4 첫 항목).
 *
 * ## 왜 이 측정이 존재하는가
 * A6(Step 6)가 실패했던 그 예산(N=200 에서 300ms) 을 단일 CM 경로가 실제로
 * 지키는지는 **한 번도 측정된 적이 없다** — 8-C 스파이크는 "키 입력 1회 재빌드
 * 비용"을 쟀지 "마운트 비용"은 안 쟀다(다른 질문이다). 이 배치 전체의 동기가
 * "동시 생존 EditorView 인스턴스 수를 N→1 로 고정하면 마운트가 빨라진다"였으므로,
 * 이 숫자가 그 가설의 최종 확인이다 — project-8c 가 "이게 안 되면 나머지 세 항목은
 * 중요하지 않다"고 지적한 이유이기도 하다.
 *
 * ## 무엇을 재는가
 * 옛 `mount_cost_t2_harness.ts`(Step 6)는 **EditorView N 개**를 만드는 시간을
 * 쟀다(블록당 CM). 이건 그 반대 실험이다 — **N 개 섹션(헤딩) 분량의 문서를 담은
 * EditorView 1 개**를 만드는 시간을 잰다. `SingleDocEditor.tsx` 와 **동일한 확장
 * 구성**(singleDocDecorationPlugin·blockCardTheme·markdown lang·keymap 전부)을
 * 그대로 써야 측정이 의미가 있다 — 옛 하네스가 지킨 "합성 설정이 아니라 실제
 * 구성 그대로" 원칙을 그대로 따른다.
 *
 * ## 판별 실험 — 옛 하네스와 동일한 3-way (attached/offscreen/detachedThenAttach)
 * 이유도 동일하다: `display:none` 에서 재면 CodeMirror 가 측정을 미룰 수 있어
 * "회복 가능"을 거짓으로 낼 수 있다(§3-A-1 의 교훈). detachedMs+attachMs 합계를
 * attached 총합과 비교해야 진짜 판별이 된다.
 *
 * ## ⚠️ 포어그라운드 필수
 * `vertical_motion` 하네스 헤더가 지적한 것과 같은 문제 — 뷰포트가 0×0 이면
 * `heightOracle` 이 기본값에 머물러 레이아웃 관련 측정 전체가 무의미해진다.
 * **브라우저 페인을 반드시 표시한 채로 측정할 것.**
 *
 * ## 실행법
 *   pnpm dev
 *   → http://localhost:1420/src/widgets/BlockEditor/__tests__/mount_cost_singledoc_t2.html
 *   → 콘솔에서 `await mountCostSingleDoc.run()` (기본 N=[50,100,200])
 *   → 예산: N=200 에서 attached 300ms 이내(A6 가 실패했던 그 예산)
 *
 * ## ⚠️ 이 숫자 하나만으로 §5.0.4 항목 1 을 닫지 말 것 — DEBUG_PLAN §5.10
 * 이 하네스는 **React 를 안 쓴다**(`:36-51`, CodeMirror 코어만). 그런데 A6 원 관측치
 * (N=200 에서 7,024~17,423ms)는 **React 포함 실제 앱 경로**("마운트 완료")를 쟀다.
 * Step 6 하네스(React 제외)가 그 관측의 8~19% 만 재현했고 — 나머지 80~92% 는
 * §3-A-0 이 지적한 대로 **한 번도 정체가 밝혀진 적이 없다.** 이 하네스가 낮은 숫자를
 * 내도 그건 "CodeMirror 계층은 무죄"라는 뜻이지 "예산을 지켰다"는 뜻이 아니다 —
 * Step 6 이 낸 바로 그 오판과 같은 모양이다.
 *
 * **§5.0.4 항목 1 의 실제 판정은 이 하네스가 아니라 실제 앱에서 낸다**: `singleDocEditorFlag.ts`
 * 를 켜고/끄고 같은 세션에서 N=200 규모 실제 문서를 열어 "마운트 완료"까지 걸리는
 * 시간을 잰다(A6 와 동일 정의, 동일 경로 — 그래서 직접 비교 가능하다). 이 하네스의
 * `attachedMs` 는 "CodeMirror 계층 자체는 예산 안인가"라는 **부분 질문**의 답일 뿐이다.
 */
import '@/app/styles/index.css';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

import { createSingleDocDecorationPlugin } from '@/shared/lib/editor/decorators/singleDocOrchestrator';
import { structuralDecorators, viewportDecorators } from '@/shared/lib/editor/decorators/singleDocDecorators';
import { blockCardTheme } from '@/shared/lib/editor/decorators/impl/BlockCardDecorator';
import { codeBlockInteractionPlugin } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { tableInteractionPlugin, tableKeymap } from '@/shared/lib/editor/decorators/impl/TableDecorator';
import { createImeIsolationExtension } from '@/shared/lib/editor/extensions/ImeIsolation';
import { parseCodeFenceInfo } from '@/shared/lib/markdown/codeFenceInfo';

const matchFenceLanguage = (info: string) => {
  const { lang } = parseCodeFenceInfo(info);
  return lang ? LanguageDescription.matchLanguageName(languages, lang, true) : null;
};

// SingleDocEditor.tsx 와 동일한 데코레이션 플러그인 인스턴스 구성.
const singleDocDecorationPlugin = createSingleDocDecorationPlugin(structuralDecorators, viewportDecorators);

const settingsEditor = { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 15 };

/** SingleDocEditor.tsx 의 createEditorTheme 과 동일해야 한다(측정 대상과 실제 조립을 갈라지게 하지 않는다). */
function createEditorTheme() {
  return EditorView.theme({
    '&': { background: 'transparent !important', height: 'auto' },
    '.cm-scroller': { fontFamily: settingsEditor.fontFamily, fontSize: `${settingsEditor.fontSize}px`, minWidth: '0' },
    '.cm-content': { caretColor: '#6366f1', padding: '24px 0', minWidth: '0' },
    '.cm-line': { padding: '0 4px' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#6366f1' },
    '&.cm-focused': { outline: 'none' },
  });
}

/**
 * N 개 H2 섹션 — spike_b_orchestrator_incremental.ts 의 makeDoc 과 같은 형태
 * (실측 재현성을 위해 의도적으로 맞춤). 코드펜스·표·KaTeX 를 고정 개수 섞어
 * 구조 레이어에도 실제 작업을 준다 — 안 그러면 마운트 비용을 과소평가한다.
 *
 * export 하는 이유: §5.10 의 실제 앱 대조 측정(플래그 on/off, React 포함 "마운트
 * 완료" 시간)에 **같은 문서**를 써야 이 하네스의 CodeMirror-only 숫자와 비교 가능한
 * 기준선이 생긴다. `fixtures/mount_cost_n200.md` 가 `makeDoc(200)` 의 산출물을
 * 그대로 저장해 둔 고정본이다 — 매번 콘솔에서 다시 생성할 필요 없이 워크스페이스에
 * 복사해 넣기만 하면 된다.
 */
export function makeDoc(n: number): string {
  const lines: string[] = ['# 마운트 비용 실측 문서', ''];
  for (let i = 1; i <= n; i++) {
    lines.push(`## 섹션 ${i}`);
    lines.push(`본문 ${i}-A **굵게** 와 *기울임* 를 포함합니다.`);
    lines.push(`본문 ${i}-B [링크](https://example.com/${i}) 도 있습니다.`);
    lines.push(`본문 ${i}-C 일반 텍스트 줄입니다.`);
    if (i === Math.floor(n * 0.25)) {
      lines.push('```js', 'function fenceA() { return 1; }', '```');
    }
    if (i === Math.floor(n * 0.5)) {
      lines.push('$$', 'E = mc^2', '$$');
    }
    if (i === Math.floor(n * 0.6)) {
      lines.push('| 헤더 1 | 헤더 2 |', '| --- | --- |', '| 셀 1 | 셀 2 |');
    }
    if (i === Math.floor(n * 0.75)) {
      lines.push('```js', 'function fenceB() { return 2; }', '```');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildExtensions() {
  return [
    markdown({ codeLanguages: matchFenceLanguage }),
    EditorView.lineWrapping,
    oneDark,
    history(),
    drawSelection(),
    tableKeymap,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    singleDocDecorationPlugin,
    blockCardTheme,
    codeBlockInteractionPlugin,
    tableInteractionPlugin,
    createImeIsolationExtension(),
    createEditorTheme(),
  ];
}

/** 문서 하나(N 섹션)를 담은 EditorView **1개**를 만드는 시간을 잰다 —
 *  옛 mount_cost_t2_harness.ts 의 mountN(EditorView N개)과 정반대 실험이다. */
function mountOne(n: number, container: HTMLElement): { ms: number; view: EditorView } {
  const doc = makeDoc(n);
  const t0 = performance.now();
  const state = EditorState.create({ doc, extensions: buildExtensions() });
  const view = new EditorView({ state, parent: container });
  const ms = performance.now() - t0;
  return { ms, view };
}

async function settle() {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

interface Sample {
  n: number;
  attachedMs: number;
  offscreenMs: number;
  detachedMs: number;
  attachMs: number;
  detachedPlusAttachMs: number;
  postAttachHeightPx: number;
}

async function measureAt(n: number): Promise<Sample> {
  // 1) attached — 화면 밖으로 밀어낸 고정 위치, 레이아웃엔 정상 참여(오늘의 실제 비용).
  const attachedContainer = document.createElement('div');
  attachedContainer.style.cssText = 'position:fixed;top:0;left:0;z-index:-1;width:800px;height:600px;overflow:auto;';
  document.body.appendChild(attachedContainer);
  const attached = mountOne(n, attachedContainer);
  attached.view.destroy();
  attachedContainer.remove();
  await settle();

  // 2) offscreen — 레이아웃 참여는 동일, 다른 콘텐츠와의 인터리빙만 제거.
  const offscreenContainer = document.createElement('div');
  offscreenContainer.style.cssText = 'position:fixed;top:-99999px;left:-99999px;width:800px;height:600px;overflow:auto;';
  document.body.appendChild(offscreenContainer);
  const offscreen = mountOne(n, offscreenContainer);
  offscreen.view.destroy();
  offscreenContainer.remove();
  await settle();

  // 3) detachedThenAttach — display:none 에서 만든 뒤 보이게 전환 + 강제 flush.
  const detachedContainer = document.createElement('div');
  detachedContainer.style.cssText = 'display:none;width:800px;height:600px;overflow:auto;';
  document.body.appendChild(detachedContainer);
  const detached = mountOne(n, detachedContainer);

  const tAttachStart = performance.now();
  detachedContainer.style.cssText = 'position:fixed;top:0;left:0;z-index:-1;width:800px;height:600px;overflow:auto;';
  const postAttachHeightPx = detachedContainer.getBoundingClientRect().height;
  detached.view.requestMeasure();
  await settle();
  const attachMs = performance.now() - tAttachStart;

  detached.view.destroy();
  detachedContainer.remove();
  await settle();

  return {
    n,
    attachedMs: attached.ms,
    offscreenMs: offscreen.ms,
    detachedMs: detached.ms,
    attachMs,
    detachedPlusAttachMs: detached.ms + attachMs,
    postAttachHeightPx,
  };
}

function growthExponent(nA: number, tA: number, nB: number, tB: number): number {
  return Math.log(tB / tA) / Math.log(nB / nA);
}

const BUDGET_MS_AT_N200 = 300;

export async function run(ns: number[] = [50, 100, 200]) {
  if (document.visibilityState !== 'visible') {
    console.warn(
      '[mount-cost-singledoc] document.visibilityState !== "visible" — §3-A-1 의 교훈대로 이 실행의 절대값은 ' +
        '참고치로만 쓸 것. 예산 판정(300ms)은 반드시 포어그라운드에서 재확인할 것.',
    );
  }

  const samples: Sample[] = [];
  for (const n of ns) {
    // eslint-disable-next-line no-await-in-loop
    const s = await measureAt(n);
    samples.push(s);
    console.log(
      `N=${n}  attached=${s.attachedMs.toFixed(1)}ms  offscreen=${s.offscreenMs.toFixed(1)}ms  ` +
        `detached=${s.detachedMs.toFixed(1)}ms + attach=${s.attachMs.toFixed(1)}ms = ${s.detachedPlusAttachMs.toFixed(1)}ms  ` +
        `(postAttachHeight=${s.postAttachHeightPx.toFixed(0)}px)`,
    );
  }

  console.table(
    samples.map((s) => ({
      N: s.n,
      'attached(ms)': s.attachedMs.toFixed(1),
      'offscreen(ms)': s.offscreenMs.toFixed(1),
      'detached+attach(ms)': s.detachedPlusAttachMs.toFixed(1),
    })),
  );

  if (samples.length >= 2) {
    const first = samples[0];
    const last = samples[samples.length - 1];
    const exp = growthExponent(first.n, first.attachedMs, last.n, last.attachedMs);
    console.log(`[mount-cost-singledoc] attached 성장 지수(N=${first.n}→${last.n}): ${exp.toFixed(3)} (1.0=선형, 1.76=A6 가 실패했던 지수)`);
  }

  const at200 = samples.find((s) => s.n === 200);
  if (at200) {
    const pass = at200.attachedMs <= BUDGET_MS_AT_N200;
    console.log(
      `[mount-cost-singledoc] N=200 예산 판정: attached=${at200.attachedMs.toFixed(1)}ms ` +
        `${pass ? '✅ 통과' : '❌ 초과'} (예산 ${BUDGET_MS_AT_N200}ms)`,
    );
  }

  return samples;
}

(window as unknown as { mountCostSingleDoc: { run: typeof run } }).mountCostSingleDoc = { run };
