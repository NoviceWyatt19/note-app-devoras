/**
 * T2 하네스 — 수직 캐럿 이동 회귀 검사 (BUG-20260828-01)
 *
 * ## 왜 T2 인가
 * 이 결함은 **CodeMirror height map 좌표와 실제 DOM 좌표의 불일치**가 원인이다.
 * 답에 레이아웃이 관여하므로 `DEBUG_PLAN.md` §2 규약상 T0/T1 로는 구조적으로 탐지되지 않는다.
 * 반대로 스크롤은 관여하지 않으므로 T3 까지 올릴 필요는 없다 → **T2(Chromium) 가 정답 티어**.
 *
 * ## 실행법
 *   pnpm dev
 *   → http://localhost:1420/src/widgets/BlockEditor/__tests__/vertical_motion_t2.html
 *   → 콘솔에서 `await qa.report()`
 *
 * playwright MCP 로 자동화할 때는 반드시 **뷰포트가 0×0 이 아닌 상태**여야 한다.
 * 탭이 백그라운드면 `innerWidth/innerHeight` 가 0 이 되고 CodeMirror 가 라인 높이를
 * 측정하지 못해(heightOracle 이 기본값 14px 에 머문다) 측정값 전체가 무의미해진다.
 *
 * ## 판정 기준
 * 1. `drift === 0` — 모든 라인에서 (실제 DOM top − height map top) 이 0.
 *    0 이 아니면 `.cm-line` 어딘가에 수직 `margin` 이 들어갔다는 뜻이다.
 *    height map 은 `getBoundingClientRect().height` 로 재므로 margin 을 못 본다.
 * 2. `delta === ±1` — 위/아래 한 줄씩만 이동. 2 이상이면 줄 스킵 재발.
 *
 * ## 알려진 예외 (본 결함과 무관, 별건)
 * - `---`(수평선) 라인: 위젯 렌더 박스가 라인 박스보다 훨씬 낮아서 ArrowUp 이 그 줄을
 *   건너뛴다. drift 0 인 문서에서도 재현되므로 height map 불일치와는 다른 축이다.
 * - 여러 줄을 하나로 replace 하는 위젯(`$$...$$` 디스플레이 수식, 코드펜스)은
 *   그 구간 전체가 한 블록이라 delta 가 1 을 넘는 것이 정상이다.
 */
import '@/app/styles/index.css';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
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

// BlockEditor.tsx 와 동일한 데코레이터 구성 — 하나라도 빠지면 검사 의미가 없다.
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

/** BlockEditor.tsx 의 createEditorTheme 과 동일해야 한다 (DEBUG_PLAN §9-5). */
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

const lineWrappingCompartment = new Compartment();
const editorThemeCompartment = new Compartment();

/** BUG-20260828-01 인수인계 문서 §2 의 재현 문서 두 건 + 전 데코레이터 혼합 문서. */
const DOCS = {
  /** 재현 문서 A — 블록쿼트가 전혀 없는 순수 평문. 결정적 반증용. */
  plain: [
    '# Plain Only Test',
    '',
    'Plain line A QA-A',
    'Plain line B QA-B',
    'Plain line C QA-C',
    'Plain line D QA-D',
    'Plain line E QA-E',
    'Plain line F QA-F',
    'Plain line G QA-G',
  ].join('\n'),

  /** 재현 문서 B — 원 사용자 보고(블록쿼트 구간) 재현용. */
  blockquote: [
    '# Blockquote Cursor Test',
    '',
    'Plain line before quote QA-BEFORE',
    '',
    '> Quote line 1 QA-Q1',
    '> Quote line 2 QA-Q2',
    '> Quote line 3 QA-Q3',
    '> Quote line 4 QA-Q4',
    '> Quote line 5 QA-Q5',
    '',
    'Plain line after quote QA-AFTER',
    '',
    '> Solo quote line QA-SOLO',
    '',
    'Plain line 2 QA-AFTER2',
    '',
    '>',
    '> Quote after empty marker QA-EMPTYMARK',
    '',
    'Plain line 3 QA-END',
  ].join('\n'),

  /** H1~H4 를 전부 포함한 문서 — drift 누적 지점을 데코레이터별로 분리해 보여준다. */
  headings: [
    '# H1 heading',
    '',
    'plain after h1',
    '',
    '## H2 heading',
    '',
    'plain after h2',
    '',
    '### H3 heading',
    '',
    'plain after h3',
    '',
    '#### H4 heading',
    '',
    'plain after h4',
    '',
    'tail line one',
    'tail line two',
  ].join('\n'),

  /** 전 데코레이터 혼합 — margin 이 새로 유입되는지 넓게 훑는 용도. */
  mixed: [
    '# Mixed Fixture',
    '',
    'plain line',
    '',
    '## H2 heading here',
    '',
    '### H3 heading here',
    '',
    '#### H4 heading here',
    '',
    'text after headings',
    '',
    '> Quote line 1',
    '> Quote line 2',
    '> Quote line 3',
    '',
    'plain after quote',
    '',
    '- list item one',
    '- list item two',
    '- [ ] task item',
    '- [x] done item',
    '',
    'Some **bold** and *italic* and ~~strike~~ text',
    '',
    '[a link](https://example.com) inline',
    '',
    'final plain line',
  ].join('\n'),
};

const state = EditorState.create({
  doc: DOCS.mixed,
  selection: { anchor: 0 },
  extensions: [
    markdown({ codeLanguages: matchFenceLanguage }),
    lineWrappingCompartment.of(settingsEditor.lineWrapping ? EditorView.lineWrapping : []),
    oneDark,
    history(),
    drawSelection(),
    keymap.of([{ key: 'Tab', run: indentMore }, { key: 'Shift-Tab', run: indentLess }]),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdownDecorationPlugin,
    codeBlockInteractionPlugin,
    editorThemeCompartment.of(createEditorTheme(settingsEditor)),
  ],
});

const view = new EditorView({ state, parent: document.getElementById('root')! });
view.focus();

interface DriftRow {
  n: number;
  cls: string;
  /** 실제 DOM top − height map top. margin 이 없으면 항상 0 이어야 한다. */
  drift: number;
  hmH: number;
  domH: number;
  marginTop: string;
  marginBottom: string;
}

function lineElement(pos: number): HTMLElement | null {
  let node: Node | null = view.domAtPos(pos).node;
  let el = node && node.nodeType === 3 ? node.parentElement : (node as HTMLElement | null);
  while (el && !el.classList?.contains('cm-line')) el = el.parentElement;
  return el;
}

/** 라인별 height map ↔ 실제 DOM 좌표 어긋남(drift) 측정. */
function scan(): DriftRow[] {
  // documentTop === contentDOM.top + paddingTop — height map 좌표 0 에 대응하는 화면 y.
  const docTop = view.documentTop;
  const rows: DriftRow[] = [];
  for (let n = 1; n <= view.state.doc.lines; n++) {
    const line = view.state.doc.line(n);
    const block = view.lineBlockAt(line.from);
    const el = lineElement(line.from);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    rows.push({
      n,
      cls: el.className,
      drift: +((r.top - docTop) - block.top).toFixed(2),
      hmH: +block.height.toFixed(2),
      domH: +r.height.toFixed(2),
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
    });
  }
  return rows;
}

/**
 * 문서를 끝까지 한 줄씩 이동하며 라인 델타를 기록한다.
 * `view.moveVertically` 는 `defaultKeymap` 의 `cursorLineUp`/`cursorLineDown` 이
 * 내부적으로 호출하는 바로 그 API 이므로, 실키 주입 없이도 동일 경로를 검사한다.
 */
function walk(forward: boolean): string[] {
  const out: string[] = [];
  view.dispatch({ selection: { anchor: forward ? 0 : view.state.doc.length } });
  for (let i = 0; i < view.state.doc.lines + 2; i++) {
    const range = view.state.selection.main;
    const before = view.state.doc.lineAt(range.head).number;
    const moved = view.moveVertically(range, forward);
    const after = view.state.doc.lineAt(moved.head).number;
    out.push(`${before}->${after} (${after - before})`);
    if (moved.head === range.head) break;
    view.dispatch({ selection: { anchor: moved.head, head: moved.head } });
  }
  return out;
}

function setDoc(doc: string): Promise<void> {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
  view.requestMeasure();
  return new Promise((r) => setTimeout(r, 400));
}

/** 픽스처 전체를 돌며 PASS/FAIL 판정. */
async function report() {
  const results: Array<Record<string, unknown>> = [];
  for (const [name, doc] of Object.entries(DOCS)) {
    await setDoc(doc);
    const rows = scan();
    const drifted = rows.filter((r) => Math.abs(r.drift) > 0.5);
    const down = walk(true);
    const up = walk(false);
    const badStep = [...down, ...up].filter((s) => {
      const d = Number(s.slice(s.lastIndexOf('(') + 1, -1));
      return Math.abs(d) > 1;
    });
    results.push({
      fixture: name,
      driftOk: drifted.length === 0,
      drifted: drifted.map((r) => `${r.n} ${r.cls} drift=${r.drift} mt=${r.marginTop} mb=${r.marginBottom}`),
      stepOk: badStep.length === 0,
      badSteps: badStep,
    });
  }
  const pass = results.every((r) => r.driftOk && r.stepOk);
  console.table(results.map((r) => ({ fixture: r.fixture, driftOk: r.driftOk, stepOk: r.stepOk })));
  console.log(pass ? '✅ PASS — drift 0, delta ±1' : '❌ FAIL', results);
  return { pass, results };
}

const qa = { view, DOCS, scan, walk, setDoc, report };
(window as unknown as { qa: typeof qa; view: EditorView }).qa = qa;
(window as unknown as { qa: typeof qa; view: EditorView }).view = view;
