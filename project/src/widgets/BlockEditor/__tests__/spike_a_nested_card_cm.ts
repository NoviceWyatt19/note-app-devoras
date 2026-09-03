/**
 * SPIKE-20260902-A, phase 2 — 실제 EditorView + Decoration.line() 재현.
 *
 * §3.4 step 2: 정적 CSS 프로토타입(spike_a_nested_card_static.html)이 성립했으므로,
 * 같은 기법을 진짜 CodeMirror 위에서 재현해 동일 결과가 나오는지 확인한다.
 *
 * **격리**: 이 파일은 `__tests__` 하위에서만 존재한다. `NestedCardDecorator` 는
 * 이 스파이크 전용이며 `orchestrator.ts`/`BlockEditor.tsx` 등 프로덕션 코드에는
 * 등록되지 않는다 — §6 위험 1 완화.
 *
 * 재사용: 실제 프로덕션 데코레이터(HeadingDecorator·CodeBlockDecorator·
 * LatexDecorator)와 실제 orchestrator(createDecorationPlugin)를 그대로 가져다
 * 쓴다 — "기존 데코레이터와의 시각 충돌"을 진짜로 검증하려면 합성이 아니라
 * 실물이어야 한다.
 *
 * 실행: pnpm dev → http://localhost:1420/src/widgets/BlockEditor/__tests__/spike_a_nested_card_cm.html
 */
import '@/app/styles/index.css';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { SyntaxDecorator } from '@/shared/lib/editor/decorators/types';
import { createDecorationPlugin } from '@/shared/lib/editor/decorators/orchestrator';
import { HeadingDecorator } from '@/shared/lib/editor/decorators/impl/HeadingDecorator';
import { CodeBlockDecorator } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { LatexDecorator } from '@/shared/lib/editor/decorators/impl/LatexDecorator';

// ---------------------------------------------------------------------------
// 1. L2/L3 라인 구간 계산 — parseMarkdown 과 같은 스택 알고리즘, 라인 번호 기준
// ---------------------------------------------------------------------------

interface Section {
  level: number;
  startLine: number; // 1-indexed
  endLine: number; // inclusive
}

const HEADING_RE = /^(#{1,6})\s+/;
const FENCE_RE = /^(`{3,}|~{3,})/;

function computeSections(doc: EditorState['doc']): Section[] {
  const sections: Section[] = [];
  const stack: Section[] = [];
  let insideFence = false;

  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text;
    if (FENCE_RE.test(text)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const match = HEADING_RE.exec(text);
    if (!match) continue;
    const level = match[1].length;

    // 현재 레벨 이상인 열린 섹션은 여기서 닫힌다(이 줄 바로 앞까지).
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      const closed = stack.pop()!;
      closed.endLine = i - 1;
    }
    const section: Section = { level, startLine: i, endLine: doc.lines };
    sections.push(section);
    stack.push(section);
  }
  // 문서 끝까지 열려 있던 섹션들은 이미 endLine=doc.lines 로 초기화돼 있다.
  return sections;
}

interface LineCardInfo {
  l2: boolean;
  l2Top: boolean;
  l2Bottom: boolean;
  l3: boolean;
  l3Top: boolean;
  l3Bottom: boolean;
}

function computeLineCardInfo(doc: EditorState['doc']): Map<number, LineCardInfo> {
  const sections = computeSections(doc);
  const l2Sections = sections.filter((s) => s.level === 2);
  const l3Sections = sections.filter((s) => s.level === 3);

  const info = new Map<number, LineCardInfo>();
  for (let i = 1; i <= doc.lines; i++) {
    const l2 = l2Sections.find((s) => i >= s.startLine && i <= s.endLine);
    // L3 는 오직 "그 L2 의 자식"일 때만 카드로 친다 — L2 없이 홀로 있는 L3 는
    // 이 스파이크의 관심사(L2 ⊃ L3 관통)가 아니므로 일반 텍스트로 둔다.
    const l3 = l2 ? l3Sections.find((s) => i >= s.startLine && i <= s.endLine && s.startLine >= l2.startLine && s.endLine <= l2.endLine) : undefined;

    info.set(i, {
      l2: !!l2,
      l2Top: !!l2 && i === l2.startLine,
      l2Bottom: !!l2 && i === l2.endLine,
      l3: !!l3,
      l3Top: !!l3 && i === l3.startLine,
      l3Bottom: !!l3 && i === l3.endLine,
    });
  }
  return info;
}

// ---------------------------------------------------------------------------
// 2. NestedCardDecorator — 이 스파이크 전용, 프로덕션에 등록되지 않음
// ---------------------------------------------------------------------------

class NestedCardDecorator implements SyntaxDecorator {
  readonly name = 'spike-nested-card';

  createDecorations(state: EditorState): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const info = computeLineCardInfo(state.doc);

    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      const c = info.get(i)!;
      if (!c.l2 && !c.l3) continue;

      const classes: string[] = [];
      if (c.l2) classes.push('card-l2');
      if (c.l2Top) classes.push('card-l2-top');
      if (c.l2Bottom) classes.push('card-l2-bottom');
      if (c.l3) classes.push('card-l3');
      if (c.l3Top) classes.push('card-l3-top');
      if (c.l3Bottom) classes.push('card-l3-bottom');

      builder.add(line.from, line.from, Decoration.line({ class: classes.join(' ') }));
    }
    return builder.finish();
  }
}

// ---------------------------------------------------------------------------
// 3. 카드 테마 — spike_a_nested_card_static.html 과 동일 값(값 출처: 그 파일 헤더 주석)
//    ⚠️ BUG-20260828-01: `.cm-line` 에는 절대 margin 을 쓰지 않는다(orchestrator.ts:103
//    설명 그대로) — 세로 간격은 padding 으로만 만든다.
// ---------------------------------------------------------------------------

// NOTE(spike finding): EditorView.baseTheme() 는 CM6 에서 항상 "기본값" 취급되어
// HeadingDecorator 가 쓰는 decorationBaseTheme(orchestrator.ts 도 baseTheme) 의
// `cm-h3-line` 같은 shorthand `padding` 규칙에 밀린다 — 소스 순서와 무관하게
// 진다(실측: card-l3-top 의 padding-top:16px 이 cm-h3-line 의 padding:'0.5rem...'
// 에 완전히 덮여 8px 로 계산됨). `EditorView.theme()`(비-base) 는 CM6 가 의도적으로
// baseTheme 보다 높은 우선순위를 주는 계층이라 여기로 옮기면 해결된다 — 이것이
// 8-D 로 채택될 경우 실제 구현에서 챙겨야 할 진짜 발견이다(§3.6 DoD 참고).
const nestedCardTheme = EditorView.theme({
  '&.cm-editor .card-l2': {
    backgroundColor: '#141520',
    backgroundClip: 'padding-box',
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.55), inset -1px 0 0 rgba(39,42,55,0.55)',
    paddingLeft: '20px',
    paddingRight: '20px',
  },
  '&.cm-editor .card-l2-top': {
    borderTopLeftRadius: '16px',
    borderTopRightRadius: '16px',
    paddingTop: '20px',
    boxShadow:
      'inset 1px 0 0 rgba(39,42,55,0.55), inset -1px 0 0 rgba(39,42,55,0.55), inset 0 1px 0 rgba(39,42,55,0.55), 0 4px 12px rgba(0,0,0,0.25)',
  },
  '&.cm-editor .card-l2-bottom': {
    borderBottomLeftRadius: '16px',
    borderBottomRightRadius: '16px',
    paddingBottom: '20px',
    boxShadow:
      'inset 1px 0 0 rgba(39,42,55,0.55), inset -1px 0 0 rgba(39,42,55,0.55), inset 0 -1px 0 rgba(39,42,55,0.55), 0 4px 12px rgba(0,0,0,0.25)',
  },
  // NOTE(spike finding #2): CodeMirror 는 .cm-line 의 텍스트를 감싸는 span 없이
  // **순수 텍스트 노드**로 렌더한다(실측: outerHTML 이 `<div class="cm-line ...">텍스트`
  // 로, 자식 엘리먼트가 없다). 그래서 정적 프로토타입처럼 텍스트 쪽에 z-index 를 얹어
  // 위로 끌어올리는 방법이 안 통한다(선택자로 텍스트 노드를 못 잡음) — `::before` 를
  // z-index:0(양수 취급) 으로 두면 CSS 페인트 순서상 인라인 텍스트(스택 레벨 5)보다
  // "위치 지정 + z-index:0" 요소(스택 레벨 6)가 나중에 그려져 텍스트를 완전히 덮어버렸다
  // (실측: get_page_text 엔 있는데 화면엔 안 보임). 해법: .card-l3 라인 자신에
  // `position:relative + z-index:0` 을 줘서 **이 줄 하나만의 로컬 스태킹 컨텍스트**를
  // 만들고, ::before 는 그 안에서 `z-index:-1` 로 등록한다 — 로컬 컨텍스트의 음수
  // z-index 는 배경(스텝1) 보다는 위, 인라인 콘텐츠(스텝3~5)보다는 아래에 그려진다.
  '&.cm-editor .card-l3': {
    position: 'relative',
    zIndex: '0',
    paddingLeft: '60px',
    paddingRight: '60px',
  },
  '&.cm-editor .card-l3::before': {
    content: '""',
    position: 'absolute',
    left: '24px',
    right: '24px',
    top: '0',
    bottom: '0',
    backgroundColor: '#1d1f30',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.75), inset -1px 0 0 rgba(39,42,55,0.75)',
    zIndex: '-1',
  },
  '&.cm-editor .card-l3-top::before': {
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.75), inset -1px 0 0 rgba(39,42,55,0.75), inset 0 1px 0 rgba(39,42,55,0.75)',
  },
  '&.cm-editor .card-l3-bottom::before': {
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.75), inset -1px 0 0 rgba(39,42,55,0.75), inset 0 -1px 0 rgba(39,42,55,0.75)',
  },
  '&.cm-editor .card-l3-top': { paddingTop: '16px' },
  '&.cm-editor .card-l3-bottom': { paddingBottom: '16px' },
});

// ---------------------------------------------------------------------------
// 4. 문서 & 마운트
// ---------------------------------------------------------------------------

const TEST_DOC = `# 스파이크 A 검증 문서
본문 1번째 줄입니다
본문 2번째 줄입니다
본문 3번째 줄입니다

## H2 노드 1
본문 A번째 줄입니다
본문 B번째 줄입니다
본문 C번째 줄입니다

### H3 1-1
서브 본문 A입니다
서브 본문 B입니다
서브 본문 C입니다

### H3 1-2
서브 본문 A입니다
서브 본문 B입니다

\`\`\`js
function hello() {
  return 42;
}
\`\`\`

## H2 노드 2
본문 X번째 줄입니다
본문 Y번째 줄입니다

### H3 2-1
서브 본문 X입니다

$$
E = mc^2
$$

### H3 2-2
서브 본문 X입니다
서브 본문 Y입니다
`;

const decorators = [new HeadingDecorator(), new CodeBlockDecorator(), new LatexDecorator(), new NestedCardDecorator()];

const state = EditorState.create({
  doc: TEST_DOC,
  extensions: [
    keymap.of([...defaultKeymap, ...historyKeymap]),
    history(),
    EditorView.lineWrapping,
    createDecorationPlugin(decorators),
    nestedCardTheme,
    EditorView.theme({
      '&': { fontSize: '15px', height: '100%' },
      '.cm-content': { padding: '24px 0' },
      '.cm-scroller': { fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
    }),
  ],
});

new EditorView({
  state,
  parent: document.getElementById('root')!,
});
