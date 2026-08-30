/**
 * T2 하네스 — 블록당 EditorView 마운트 비용 프로파일 + 판별 실험 (A6, DEBUG_PLAN Step 6)
 *
 * ## 왜 T2 인가
 * 마운트 비용은 실제 브라우저 레이아웃/페인트 엔진이 관여해야 관측되는 값이라
 * T0/T1 로는 측정 자체가 불가능하다. Tauri(WKWebView) 접근도 이 세션에서는
 * 없으므로 T2(Chromium) 가 유일하게 가능한 티어다 — 하한으로 읽을 것(WKWebView 가
 * 더 느릴 가능성이 높음, 앞선 배치의 실측 노트와 동일한 전제).
 *
 * ## 무엇을 재는가
 * BlockEditor.tsx 의 CodeMirrorBlock 생성 이펙트와 **동일한 확장 구성**(마크다운
 * 파서·데코레이터·테마·키맵)으로 EditorView N 개를 생성해 걸리는 시간을 잰다.
 * React 마운트 오버헤드를 걷어내고 "EditorView 생성 자체"의 비용만 격리한다 —
 * 합성 CodeMirror 설정이 아니라 실제 데코레이터·위젯 전체를 그대로 쓰는 이유는,
 * 그것들이야말로 인스턴스당 비용을 만들어낼 개연성이 높은 부분이라 빼면 문제를
 * 과소평가하게 되기 때문이다(project-1f 지적).
 *
 * ## 판별 실험 — 3-way (project-1f 설계, 확률적 오판 교정 포함)
 *
 * 처음 설계는 attached(라이브 레이아웃) vs detached(`display:none`) 둘만 비교해
 * "detached 에서 지수가 붕괴하면 스래싱"으로 판정하려 했다. 그런데 이건 **거짓
 * "회복 가능" 판정을 낼 수 있다**: `display:none` 서브트리는 `getBoundingClientRect`
 * 등이 전부 0 을 반환하므로, CodeMirror 가 라인 높이·뷰포트 측정 자체를 보이게 될
 * 때까지 **미룰 수 있다.** 그러면 detached 구간이 빨라 보이는 건 스래싱을 피해서가
 * 아니라 **애초에 아무 측정도 안 했기 때문**이고, 그 비용은 그대로 남아 있다가
 * 나중에 화면에 붙는 순간 전부 몰아서 나온다 — "회복 가능"으로 잘못 읽게 된다.
 *
 * 그래서 세 조건을 잰다:
 *   1. **attached** — 실제 페이지 위(화면 밖으로 밀어낸 고정 위치, 레이아웃은 정상
 *      참여) 컨테이너에 바로 생성. 오늘의 실제 비용.
 *   2. **offscreen** — attached 와 똑같이 레이아웃엔 참여하지만, 독립 컨테이너라
 *      다른 이미 마운트된 콘텐츠와의 인터리빙만 제거한 중간 대조군.
 *   3. **detachedThenAttach** — `display:none` 컨테이너에 생성(=detachedMs) 한
 *      뒤, 그 컨테이너를 보이게 전환하고 레이아웃을 강제로 flush 시켜 재는
 *      시간(=attachMs). **합계(detachedMs+attachMs)를 attached 총합과 비교한다** —
 *      CodeMirror 가 측정을 미뤘든 안 미뤘든, 실제로 필요한 측정 작업의 총량은
 *      이 합계에 결국 다 들어오므로 "언제 쟀는지"와 무관하게 유효한 비교가 된다.
 *
 * 판정:
 *   - `detachedThenAttach 합계 ≈ attached 총합` → 비용이 옮겨졌을 뿐, 필요한
 *     측정량 자체는 그대로다. **회복 불가 — EditorView 생성에 내재.**
 *   - `detachedThenAttach 합계 << attached 총합` → 이미 마운트된 콘텐츠와
 *     인터리빙되며 반복됐던 강제 동기 리플로우가 진짜로 없어졌다는 뜻.
 *     **선형 회복 가능** — 배치·`content-visibility`·측정 지연 등으로.
 *
 * ## 실행법
 *   pnpm dev
 *   → http://localhost:1420/src/widgets/BlockEditor/__tests__/mount_cost_t2.html
 *   → 콘솔에서 `await qa.runDiscriminator()`
 */
import '@/app/styles/index.css';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

import { createDecorationPlugin } from '@/shared/lib/editor/decorators/orchestrator';
import { BoldItalicDecorator } from '@/shared/lib/editor/decorators/impl/BoldItalicDecorator';
import { StrikethroughDecorator } from '@/shared/lib/editor/decorators/impl/StrikethroughDecorator';
import { CheckboxDecorator } from '@/shared/lib/editor/decorators/impl/CheckboxDecorator';
import { CodeBlockDecorator, codeBlockInteractionPlugin } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { LatexDecorator } from '@/shared/lib/editor/decorators/impl/LatexDecorator';
import { HyperlinkDecorator } from '@/shared/lib/editor/decorators/impl/HyperlinkDecorator';
import { ImageDecorator } from '@/shared/lib/editor/decorators/impl/ImageDecorator';
import { HeadingDecorator } from '@/shared/lib/editor/decorators/impl/HeadingDecorator';
import { ListDecorator } from '@/shared/lib/editor/decorators/impl/ListDecorator';
import { BlockquoteDecorator } from '@/shared/lib/editor/decorators/impl/BlockquoteDecorator';
import { HorizontalRuleDecorator } from '@/shared/lib/editor/decorators/impl/HorizontalRuleDecorator';
import { CustomSymbolDecorator } from '@/shared/lib/editor/decorators/impl/CustomSymbolDecorator';
import { parseCodeFenceInfo } from '@/shared/lib/markdown/codeFenceInfo';

const matchFenceLanguage = (info: string) => {
  const { lang } = parseCodeFenceInfo(info);
  return lang ? LanguageDescription.matchLanguageName(languages, lang, true) : null;
};

// BlockEditor.tsx 와 동일한 데코레이터 구성 — 하나라도 빠지면 측정 의미가 없다.
const markdownDecorationPlugin = createDecorationPlugin([
  new BoldItalicDecorator(),
  new StrikethroughDecorator(),
  new CheckboxDecorator(),
  new CodeBlockDecorator(),
  new LatexDecorator(),
  new HyperlinkDecorator(),
  new ImageDecorator(),
  new HeadingDecorator(),
  new ListDecorator(),
  new BlockquoteDecorator(),
  new HorizontalRuleDecorator(),
  new CustomSymbolDecorator(),
]);

const settingsEditor = {
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontSize: 16,
  lineWrapping: true,
};

/** BlockEditor.tsx 의 createEditorTheme 과 동일해야 한다. */
function createEditorTheme(se: typeof settingsEditor) {
  return EditorView.theme({
    '&': { background: 'transparent !important', height: 'auto' },
    '.cm-scroller': {
      fontFamily: se.fontFamily,
      fontSize: `${se.fontSize}px`,
      overflow: 'hidden',
      minWidth: '0',
    },
    '.cm-content': { caretColor: '#6366f1', padding: '4px 0', minWidth: '0' },
    '.cm-line': { padding: '0 4px' },
    '.cm-line > span:not([class*="cm-"])': {
      fontSize: 'inherit',
      lineHeight: 'inherit',
      verticalAlign: 'baseline',
    },
    '.cm-widgetBuffer': { fontSize: 'inherit' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#6366f1' },
    '&.cm-focused': { outline: 'none' },
  });
}

function makeBlockContent(i: number): string {
  return [
    `## Block ${i} heading`,
    '',
    `Body text for block ${i}. Some **bold** and *italic* and a [link](https://example.com/${i}) and \`inline code\`.`,
    '- a list item',
    '- another item',
  ].join('\n');
}

function buildExtensions(lineWrappingCompartment: Compartment, editorThemeCompartment: Compartment) {
  return [
    markdown({ codeLanguages: matchFenceLanguage }),
    lineWrappingCompartment.of(settingsEditor.lineWrapping ? EditorView.lineWrapping : []),
    oneDark,
    history(),
    drawSelection(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdownDecorationPlugin,
    codeBlockInteractionPlugin,
    editorThemeCompartment.of(createEditorTheme(settingsEditor)),
  ];
}

/** 컨테이너 하나에 EditorView N 개를 새로 생성하고 걸린 시간을 잰다. */
function mountN(n: number, container: HTMLElement): { ms: number; views: EditorView[] } {
  const views: EditorView[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const child = document.createElement('div');
    container.appendChild(child);
    const lineWrappingCompartment = new Compartment();
    const editorThemeCompartment = new Compartment();
    const state = EditorState.create({
      doc: makeBlockContent(i),
      extensions: buildExtensions(lineWrappingCompartment, editorThemeCompartment),
    });
    views.push(new EditorView({ state, parent: child }));
  }
  const ms = performance.now() - t0;
  return { ms, views };
}

/**
 * mountN 과 동일하지만 markdownDecorationPlugin·codeBlockInteractionPlugin(둘 다
 * BlockEditor.tsx 전용 데코레이터 오케스트레이터)을 뺀 순수 CodeMirror 코어만
 * 쓴다. attached/detached 양쪽 모두에서 O(N²) 대가 이 순수 코어 조건에서도
 * 나타나면 문제는 CodeMirror 자체(혹은 그 아래)에 있고, 사라지면 데코레이터
 * 오케스트레이터가 원인이라는 뜻이다 — 두 경우의 수리 위치가 완전히 다르다.
 */
function mountNBare(n: number, container: HTMLElement): { ms: number; views: EditorView[] } {
  const views: EditorView[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const child = document.createElement('div');
    container.appendChild(child);
    const state = EditorState.create({
      doc: makeBlockContent(i),
      extensions: [markdown({ codeLanguages: matchFenceLanguage }), oneDark, history(), drawSelection()],
    });
    views.push(new EditorView({ state, parent: child }));
  }
  const ms = performance.now() - t0;
  return { ms, views };
}

/** mountN 의 확장 구성에서 codeBlockInteractionPlugin 만 뺀 변형 — 데코레이터
 *  오케스트레이터(markdownDecorationPlugin)와 codeBlockInteractionPlugin 중
 *  어느 쪽이 O(N²) 의 원인인지 이분 탐색한다. */
function mountNNoCodeBlockPlugin(n: number, container: HTMLElement): { ms: number; views: EditorView[] } {
  const views: EditorView[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const child = document.createElement('div');
    container.appendChild(child);
    const lineWrappingCompartment = new Compartment();
    const editorThemeCompartment = new Compartment();
    const state = EditorState.create({
      doc: makeBlockContent(i),
      extensions: [
        markdown({ codeLanguages: matchFenceLanguage }),
        lineWrappingCompartment.of(settingsEditor.lineWrapping ? EditorView.lineWrapping : []),
        oneDark,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdownDecorationPlugin,
        // codeBlockInteractionPlugin 제외
        editorThemeCompartment.of(createEditorTheme(settingsEditor)),
      ],
    });
    views.push(new EditorView({ state, parent: child }));
  }
  const ms = performance.now() - t0;
  return { ms, views };
}

/** mountN 의 확장 구성에서 markdownDecorationPlugin 만 빼고 codeBlockInteractionPlugin 만 남긴 변형. */
function mountNOnlyCodeBlockPlugin(n: number, container: HTMLElement): { ms: number; views: EditorView[] } {
  const views: EditorView[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const child = document.createElement('div');
    container.appendChild(child);
    const lineWrappingCompartment = new Compartment();
    const editorThemeCompartment = new Compartment();
    const state = EditorState.create({
      doc: makeBlockContent(i),
      extensions: [
        markdown({ codeLanguages: matchFenceLanguage }),
        lineWrappingCompartment.of(settingsEditor.lineWrapping ? EditorView.lineWrapping : []),
        oneDark,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        // markdownDecorationPlugin 제외
        codeBlockInteractionPlugin,
        editorThemeCompartment.of(createEditorTheme(settingsEditor)),
      ],
    });
    views.push(new EditorView({ state, parent: child }));
  }
  const ms = performance.now() - t0;
  return { ms, views };
}

async function settle() {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

interface Sample {
  n: number;
  attachedMs: number;
  offscreenMs: number;
  detachedMs: number;
  attachMs: number;
  detachedPlusAttachMs: number;
  /** 위생 점검: attach 단계 직후 컨테이너 실측 높이. 0 이면 그 표본은 무효(측정 자체가 안 됨). */
  postAttachHeightPx: number;
}

async function measureAt(n: number): Promise<Sample> {
  // 1) attached — 화면 밖으로 밀어낸 고정 위치. 레이아웃엔 정상 참여(오늘의 실제 비용).
  const attachedContainer = document.createElement('div');
  attachedContainer.style.position = 'fixed';
  attachedContainer.style.top = '0';
  attachedContainer.style.left = '0';
  attachedContainer.style.zIndex = '-1';
  document.body.appendChild(attachedContainer);
  const attached = mountN(n, attachedContainer);
  attached.views.forEach((v) => v.destroy());
  attachedContainer.remove();
  await settle();

  // 2) offscreen — 뷰포트 훨씬 밖의 고정 위치. 레이아웃엔 역시 정상 참여하지만
  //    독립 컨테이너라 다른 콘텐츠와의 인터리빙만 제거된다(중간 대조군).
  const offscreenContainer = document.createElement('div');
  offscreenContainer.style.position = 'fixed';
  offscreenContainer.style.top = '-99999px';
  offscreenContainer.style.left = '-99999px';
  document.body.appendChild(offscreenContainer);
  const offscreen = mountN(n, offscreenContainer);
  offscreen.views.forEach((v) => v.destroy());
  offscreenContainer.remove();
  await settle();

  // 3) detachedThenAttach — display:none 으로 생성(측정이 정말 뒤로 미뤄졌을 수
  //    있음) 한 뒤, 보이게 전환하고 레이아웃을 강제로 flush 시켜 그 비용까지 잰다.
  //    두 구간의 합이 attached 총합과 얼마나 다른지가 진짜 판별 신호다.
  const detachedContainer = document.createElement('div');
  detachedContainer.style.display = 'none';
  document.body.appendChild(detachedContainer);
  const detached = mountN(n, detachedContainer);

  const tAttachStart = performance.now();
  detachedContainer.style.display = '';
  detachedContainer.style.position = 'fixed';
  detachedContainer.style.top = '0';
  detachedContainer.style.left = '0';
  detachedContainer.style.zIndex = '-1';
  // getBoundingClientRect 를 강제로 읽어 레이아웃을 동기적으로 flush 시킨다.
  const postAttachHeightPx = detachedContainer.getBoundingClientRect().height;
  await settle();
  const attachMs = performance.now() - tAttachStart;

  detached.views.forEach((v) => v.destroy());
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

export async function runDiscriminator(ns: number[] = [25, 50, 100, 200]) {
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
    if (s.postAttachHeightPx === 0) {
      console.warn(`  ⚠️ N=${n}: attach 후에도 높이가 0 — 이 표본은 무효할 수 있다(레이아웃이 실제로 안 잡혔음).`);
    }
  }

  console.table(samples);

  const first = samples[0];
  const last = samples[samples.length - 1];
  const attachedExp = growthExponent(first.n, first.attachedMs, last.n, last.attachedMs);
  const offscreenExp = growthExponent(first.n, first.offscreenMs, last.n, last.offscreenMs);
  const detachedPlusAttachExp = growthExponent(first.n, first.detachedPlusAttachMs, last.n, last.detachedPlusAttachMs);
  const recoveryRatio = last.detachedPlusAttachMs / last.attachedMs; // 1에 가까우면 "옮겨졌을 뿐", 훨씬 작으면 회복

  console.log(`\n성장 지수 (N=${first.n}→${last.n}):`);
  console.log(`  attached:              ${attachedExp.toFixed(3)}`);
  console.log(`  offscreen(중간 대조군): ${offscreenExp.toFixed(3)}`);
  console.log(`  detached+attach 합계:  ${detachedPlusAttachExp.toFixed(3)}`);
  console.log(`\nN=${last.n} 에서 (detached+attach) / attached = ${recoveryRatio.toFixed(3)}`);
  console.log(
    recoveryRatio < 0.7
      ? '\n판정: detached+attach 합계가 attached 보다 뚜렷이 작다 → 인터리빙된 강제 리플로우가 진짜로 제거됐다. 선형 회복 가능(배치/content-visibility/측정 지연).'
      : '\n판정: 합계가 attached 와 비슷하거나 오히려 크다 → 측정 비용이 옮겨졌을 뿐 없어지지 않았다. EditorView 생성 자체에 내재 — 구조 전환(§0.1) 검토 대상.',
  );

  return { samples, attachedExp, offscreenExp, detachedPlusAttachExp, recoveryRatio };
}

(window as unknown as { qa: unknown }).qa = {
  runDiscriminator,
  measureAt,
  mountN,
  mountNBare,
  mountNNoCodeBlockPlugin,
  mountNOnlyCodeBlockPlugin,
};
