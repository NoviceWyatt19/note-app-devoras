import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

/**
 * `SingleDocEditor` 전용 — 재귀 중첩 DOM(`BlockNode`, `BlockEditor.tsx` 구 쓰기 경로)이
 * 만들던 L2⊃L3 중첩 카드 룩을, 평면 형제 `.cm-line` 위에 `Decoration.line()` 만으로
 * 재현한다. 값 출처는 그 컴포넌트의 `getLevelStyles`(L1/L2/L3, L4+ 는 카드 없음 —
 * 실제로 파서가 H4+ 를 별도 레벨로 분류하지 않으므로 이 데코레이터도 H1~H3 까지만
 * 다룬다).
 *
 * 기법 검증: `SPIKE-20260902-A`(spike_a_nested_card_cm.ts) — 정적 CSS 프로토타입과
 * 실제 EditorView 양쪽에서 확인했고, 거기서 발견한 두 함정을 여기서도 그대로 지킨다:
 *   1. L2/L3 클래스는 `EditorView.theme()`(비-base)로 등록해야 한다 — `baseTheme()`
 *      는 `HeadingDecorator` 의 `decorationBaseTheme`(같은 baseTheme 계층) 의
 *      shorthand `padding` 에 소스 순서와 무관하게 진다.
 *   2. `.cm-line` 텍스트는 감싸는 span 없는 순수 텍스트 노드다. L3 의 안쪽 프레임을
 *      `::before` 로 얹을 때 `.card-l3` 라인 자신에 `position:relative + z-index:0`
 *      으로 로컬 스태킹 컨텍스트를 만들고 `::before` 를 그 안에서 `z-index:-1` 로
 *      등록해야 텍스트를 가리지 않는다.
 */

// export: structural_trigger_coverage_harness.ts(T1, DEBUG_PLAN §5.0.5)가 이
// 구분자를 singleDocOrchestrator.ts 의 STRUCTURAL_TRIGGER_RE 와 대조한다.
export const HEADING_RE = /^(#{1,6})\s+/;
const FENCE_RE = /^(`{3,}|~{3,})/;

interface Section {
  level: number;
  startLine: number;
  endLine: number; // inclusive
}

/** 헤딩 라인을 스캔해 각 헤딩의 "구간"(자기 라인부터, 같거나 더 얕은 다음 헤딩
 *  직전까지)을 계산한다. `BlockNode` 의 재귀 트리 조립과 동일한 스택 알고리즘이지만
 *  라인 번호만 다룬다. 코드펜스 안의 `#` 은 헤딩으로 세지 않는다. */
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

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop()!.endLine = i - 1;
    }
    const section: Section = { level, startLine: i, endLine: doc.lines };
    sections.push(section);
    stack.push(section);
  }
  return sections;
}

interface LineCardInfo {
  l1Heading: boolean;
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
    // L3 는 자신을 감싸는 L2 의 자식일 때만 카드로 친다 — 재귀 트리와 동일하게
    // L2 없이 홀로 있는 L3 는 카드가 아니라 일반 텍스트다(getLevelStyles 의
    // L4+ 분기와 같은 취급: 카드 없음).
    const l3 = l2
      ? l3Sections.find((s) => i >= s.startLine && i <= s.endLine && s.startLine >= l2.startLine && s.endLine <= l2.endLine)
      : undefined;
    const l1 = sections.find((s) => s.level === 1 && i === s.startLine);

    info.set(i, {
      l1Heading: !!l1,
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

export class BlockCardDecorator implements SyntaxDecorator {
  readonly name = 'block-card';

  createDecorations(state: EditorState): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const info = computeLineCardInfo(state.doc);

    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      const c = info.get(i)!;
      if (!c.l1Heading && !c.l2 && !c.l3) continue;

      const classes: string[] = [];
      if (c.l1Heading) classes.push('cm-block-l1-heading');
      if (c.l2) classes.push('cm-block-card-l2');
      if (c.l2Top) classes.push('cm-block-card-l2-top');
      if (c.l2Bottom) classes.push('cm-block-card-l2-bottom');
      if (c.l3) classes.push('cm-block-card-l3');
      if (c.l3Top) classes.push('cm-block-card-l3-top');
      if (c.l3Bottom) classes.push('cm-block-card-l3-bottom');

      builder.add(line.from, line.from, Decoration.line({ class: classes.join(' ') }));
    }
    return builder.finish();
  }
}

/**
 * 값 출처: `BlockEditor.tsx` `getLevelStyles`(구 쓰기 경로) — L2
 * `p-5 rounded-2xl bg-[#141520] border-darkBorder/40 shadow-md`, L3
 * `p-4 rounded-xl bg-[#1d1f30] border-darkBorder/40`. `darkBorder` = `#272a37`
 * (`tailwind.config.js`).
 *
 * ⚠️ `.cm-line` 에 수직 `margin` 을 쓰지 말 것(BUG-20260828-01, `orchestrator.ts`
 * 의 `decorationBaseTheme` 주석 참고) — height map 이 margin 을 못 잡아 방향키가
 * 줄을 건너뛴다. 세로 간격은 전부 padding 으로만 만든다(`vertical_motion` 하네스가
 * 이 불변식을 카드 데코레이션 대상으로도 검사한다, DEBUG_PLAN §5.0.1).
 */
export const blockCardTheme = EditorView.theme({
  // 원본의 `pb-3 mb-5` — 안쪽 padding(12px) + 바깥 margin(20px) → paddingBottom 하나로 합친다.
  '&.cm-editor .cm-block-l1-heading': {
    paddingBottom: '32px',
    borderBottom: '2px solid rgba(39,42,55,0.6)',
  },

  '&.cm-editor .cm-block-card-l2': {
    backgroundColor: 'rgb(var(--surface-panel-rgb))',
    backgroundClip: 'padding-box',
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.55), inset -1px 0 0 rgba(39,42,55,0.55)',
    paddingLeft: '20px',
    paddingRight: '20px',
  },
  '&.cm-editor .cm-block-card-l2-top': {
    borderTopLeftRadius: '16px',
    borderTopRightRadius: '16px',
    // 원본(BlockNode)의 `mt-6 p-5` — 바깥 margin(24px) + 안쪽 padding(20px).
    // `.cm-line` 에는 margin 을 못 쓰므로(위 헤더 주석) 합쳐서 paddingTop 하나로 만든다.
    paddingTop: '44px',
    boxShadow:
      'inset 1px 0 0 rgba(39,42,55,0.55), inset -1px 0 0 rgba(39,42,55,0.55), inset 0 1px 0 rgba(39,42,55,0.55), 0 4px 12px rgba(0,0,0,0.25)',
  },
  '&.cm-editor .cm-block-card-l2-bottom': {
    borderBottomLeftRadius: '16px',
    borderBottomRightRadius: '16px',
    paddingBottom: '20px',
    boxShadow:
      'inset 1px 0 0 rgba(39,42,55,0.55), inset -1px 0 0 rgba(39,42,55,0.55), inset 0 -1px 0 rgba(39,42,55,0.55), 0 4px 12px rgba(0,0,0,0.25)',
  },

  // L3 는 같은 줄 위에 얹는 안쪽 페인트 레이어다(::before) — 다른 블록을
  // 구조적으로 감싸는 게 아니라 이 줄 하나의 페인트 단계이므로 "평면 형제"
  // 제약을 어기지 않는다. z-index 배치는 위 헤더 주석 2번 참고.
  '&.cm-editor .cm-block-card-l3': {
    position: 'relative',
    zIndex: '0',
    paddingLeft: '60px',
    paddingRight: '60px',
  },
  '&.cm-editor .cm-block-card-l3::before': {
    content: '""',
    position: 'absolute',
    left: '24px',
    right: '24px',
    top: '0',
    bottom: '0',
    backgroundColor: 'rgb(var(--surface-raised-rgb))',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.75), inset -1px 0 0 rgba(39,42,55,0.75)',
    zIndex: '-1',
  },
  '&.cm-editor .cm-block-card-l3-top::before': {
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.75), inset -1px 0 0 rgba(39,42,55,0.75), inset 0 1px 0 rgba(39,42,55,0.75)',
  },
  '&.cm-editor .cm-block-card-l3-bottom::before': {
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
    boxShadow: 'inset 1px 0 0 rgba(39,42,55,0.75), inset -1px 0 0 rgba(39,42,55,0.75), inset 0 -1px 0 rgba(39,42,55,0.75)',
  },
  // 원본의 `mt-4 p-4` — 바깥 margin(16px) + 안쪽 padding(16px) → paddingTop 32px 로 합친다.
  '&.cm-editor .cm-block-card-l3-top': { paddingTop: '32px' },
  '&.cm-editor .cm-block-card-l3-bottom': { paddingBottom: '16px' },
});
