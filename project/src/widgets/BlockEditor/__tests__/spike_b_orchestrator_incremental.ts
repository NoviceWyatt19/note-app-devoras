/**
 * SPIKE-20260902-B — 오케스트레이터를 뷰포트/구조 2계층으로 나눴을 때
 * 키 입력·셀렉션당 재빌드 비용이 N 에 비례하지 않는가 (B-1 후보).
 *
 * **격리**: `__tests__` 하위 전용. 프로덕션 `orchestrator.ts`/`BlockEditor.tsx` 는
 * 건드리지 않는다 — 실제 데코레이터 클래스만 가져다 쓰고, 조립(오케스트레이션)
 * 코드는 이 파일에서 새로 짠다.
 *
 * ## 왜 B-1 인가 (사전 조사로 미리 정하지 않되, 코드 근거는 확인함)
 * `SyntaxDecorator.createDecorations(state, from, to)` 를 13종 전부 실제로 열어 보면:
 *   - **10종**(BoldItalic·Strikethrough·Checkbox·Hyperlink·Image·Heading·List·
 *     Blockquote·HorizontalRule·CustomSymbol) 은 이미 `pos = from; while (pos <= to)`
 *     로 **[from,to) 만 스캔**한다 — 주석(`CustomSymbolDecorator.ts:59`)이 스스로
 *     "블록당 CM 이라 [from,to) 가 짧다"고 전제를 밝혀 뒀다.
 *   - **3종**(CodeBlock·Table·Latex) 은 다중 라인 매칭 쌍(펜스 열기~닫기)이 필요해
 *     범위 밖 컨텍스트를 봐야 하므로 **의도적으로 전체 문서를 스캔**한다.
 * 이 경계가 정확히 B-1 이 요구하는 "구조 변경만 남기고 나머지를 뷰포트로"의 경계와
 * 일치한다 — 코드가 이미 그렇게 갈라져 있었다. 그래서 B-1 을 먼저 시도한다.
 *
 * ## 계층 설계
 *   - **structuralField** (StateField) — CodeBlock·Table·Latex 3종. 매 트랜잭션마다
 *     `buildLayer(state, STRUCTURAL, 0, doc.length)` 전체 재빌드(현행과 동일 패턴,
 *     데코레이터 수만 13→3). "그 스캔이 충분히 싼지"가 이 스파이크가 실측할 질문이다.
 *   - **viewportPlugin** (ViewPlugin) — 나머지 10종. `view.visibleRanges` 로 제한한
 *     범위만 재빌드. 뷰포트/문서/셀렉션 변경 시에만 갱신.
 *
 * ## 측정
 * `window.spikeB.run()` 이 N=50/100/200 각각에서 "분리 버전" vs "현행(베이스라인,
 * 실제 orchestrator.createDecorationPlugin 그대로)" 의 키 입력 1회·화살표 1회
 * 재빌드 비용을 잰다. 측정 규율(§4.4): 조건별 워밍업 1회 폐기·3회 반복 중앙값·
 * N 조건 인터리브. **브라우저 탭이 foreground 이고 rAF 가 정상 발화해야 유효하다**
 * (§3-A-1, T2 결정적 주의) — `run()` 호출 전에 사람이/호출자가 확인해야 한다.
 */
import '@/app/styles/index.css';
import { EditorState, Extension, RangeSet, StateField, Transaction } from '@codemirror/state';
import { DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

import { SyntaxDecorator } from '@/shared/lib/editor/decorators/types';
import { createDecorationPlugin } from '@/shared/lib/editor/decorators/orchestrator';

import { BoldItalicDecorator } from '@/shared/lib/editor/decorators/impl/BoldItalicDecorator';
import { StrikethroughDecorator } from '@/shared/lib/editor/decorators/impl/StrikethroughDecorator';
import { CheckboxDecorator } from '@/shared/lib/editor/decorators/impl/CheckboxDecorator';
import { CodeBlockDecorator } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { LatexDecorator } from '@/shared/lib/editor/decorators/impl/LatexDecorator';
import { HyperlinkDecorator } from '@/shared/lib/editor/decorators/impl/HyperlinkDecorator';
import { ImageDecorator } from '@/shared/lib/editor/decorators/impl/ImageDecorator';
import { HeadingDecorator } from '@/shared/lib/editor/decorators/impl/HeadingDecorator';
import { ListDecorator } from '@/shared/lib/editor/decorators/impl/ListDecorator';
import { BlockquoteDecorator } from '@/shared/lib/editor/decorators/impl/BlockquoteDecorator';
import { HorizontalRuleDecorator } from '@/shared/lib/editor/decorators/impl/HorizontalRuleDecorator';
import { CustomSymbolDecorator } from '@/shared/lib/editor/decorators/impl/CustomSymbolDecorator';
import { TableDecorator } from '@/shared/lib/editor/decorators/impl/TableDecorator';

// ---------------------------------------------------------------------------
// 1. 데코레이터 분류
// ---------------------------------------------------------------------------

function makeRangeSafeDecorators(): SyntaxDecorator[] {
  return [
    new HeadingDecorator(),
    new BoldItalicDecorator(),
    new StrikethroughDecorator(),
    new CheckboxDecorator(),
    new HyperlinkDecorator(),
    new ImageDecorator(),
    new ListDecorator(),
    new BlockquoteDecorator(),
    new HorizontalRuleDecorator(),
    new CustomSymbolDecorator(),
  ];
}

function makeStructuralDecorators(): SyntaxDecorator[] {
  return [new CodeBlockDecorator(), new TableDecorator(), new LatexDecorator()];
}

function makeAllDecoratorsForBaseline(): SyntaxDecorator[] {
  return [...makeRangeSafeDecorators(), ...makeStructuralDecorators()];
}

// ---------------------------------------------------------------------------
// 2. 계측 카운터
// ---------------------------------------------------------------------------
//
// §8c 지적: `performance.now()` 델타는 hidden 탭에서도 순수 JS 실행 시간으로는
// 유효하지만(스케줄링 빈도만 죽지, 동기 코드 실측 CPU 시간을 왜곡하지 않는다),
// 그 주장 자체를 검증할 **독립적인, 환경에 흔들리지 않는 값**이 따로 있어야
// "hidden 탭이라 결과를 못 믿는다"는 반박에 답할 수 있다. 그래서 ms 옆에
// **호출 횟수**와 **스캔한 총 문자 수**(Σ(to-from), 데코레이터별)를 함께 센다 —
// 정수이고 타이밍/스로틀링과 무관하다. "N 에 비례하는가" 라는 질문에 이 값만으로도
// 답할 수 있다(구조 레이어는 매 트랜잭션 doc.length 전체를 N 회 훑어야 하므로
// scannedChars 가 N 에 선형 비례해야 정상이고, 뷰포트 레이어는 뷰포트 크기가
// 고정이면 scannedChars 가 N 과 무관하게 상수여야 정상).
let structuralMs = 0;
let viewportMs = 0;
let structuralCalls = 0;
let viewportCalls = 0;
let structuralCharsScanned = 0;
let viewportCharsScanned = 0;

function resetTimers(): void {
  structuralMs = 0;
  viewportMs = 0;
  structuralCalls = 0;
  viewportCalls = 0;
  structuralCharsScanned = 0;
  viewportCharsScanned = 0;
}

function buildLayer(
  state: EditorState,
  decorators: SyntaxDecorator[],
  from: number,
  to: number,
  onCall?: (chars: number) => void,
): DecorationSet {
  const sets = decorators.map((d) => {
    try {
      onCall?.(to - from);
      return d.createDecorations(state, from, to);
    } catch (err) {
      console.warn(`[spike-b] decorator "${d.name}" threw:`, err);
      return RangeSet.empty as DecorationSet;
    }
  });
  return RangeSet.join(sets);
}

// ---------------------------------------------------------------------------
// 3. structuralField — 전체 문서를 스캔하되, 데코레이터가 3종뿐이다
// ---------------------------------------------------------------------------

/** 구조 데코레이터가 반응하는 문법 트리거 문자 — 이 중 하나도 없는 삽입/삭제
 *  텍스트는 펜스/표를 새로 만들거나 깰 수 없다. */
// §8c 지적: `~~~` 도 CommonMark 유효 펜스다(CodeBlockDecorator.ts:7 의
// FENCE_OPEN_RE = /^(`{3,}|~{3,})/ 가 이미 받아들인다). 처음엔 백틱만 넣어서
// 놓쳤다 — 200자 이상 떨어진 곳에 `~~~` 를 쳐도 게이트가 트리거 없음으로 판단해
// 전체 재빌드를 건너뛰므로 새 펜스가 데코레이션되지 않는 채로 남는 정확성 결함.
const STRUCTURAL_TRIGGER_RE = /[`$|~]/;

/** `pos` 가 기존 데코레이션 중 하나의 범위(여유값 `margin` 포함) 안에 있는가.
 *  펜스/표 위젯 근처에서의 편집·커서 이동은 그 위젯의 reveal 상태를 바꿀 수
 *  있으므로 안전하게 전체 재빌드로 폴백해야 한다. */
function isNearAnyDecoration(set: DecorationSet, pos: number, margin: number): boolean {
  let found = false;
  set.between(Math.max(0, pos - margin), pos + margin, () => {
    found = true;
    return false;
  });
  return found;
}

/**
 * §8c 이후 개선(B-2 정신을 구조 레이어에 부분 적용) — 매 트랜잭션마다 무조건
 * 전체 재빌드하는 대신, **이 편집이 펜스/표 문법에 영향을 줄 수 있는지**를 먼저
 * 싸게 확인한다. 아니라면 `value.map(tr.changes)` 로 기존 데코레이션 위치만
 * 옮기고 끝낸다 — 실제 문서에서 대다수 키 입력은 일반 문단 텍스트이므로 이
 * 경로를 탄다. 트리거 문자(백틱·$·|)가 삽입/삭제되거나, 편집·커서 위치가
 * 기존 구조 데코레이션 근처면 안전하게 전체 재빌드로 폴백한다(경계 오류 방지 —
 * B-2 의 실제 위험은 여기다).
 */
function structuralTransactionNeedsFullRebuild(value: DecorationSet, tr: Transaction): boolean {
  const MARGIN = 200; // 문자 단위 여유 — 표/펜스 헤더가 조금 떨어져 있어도 안전하게 잡는다

  if (!tr.docChanged) {
    // 순수 셀렉션 변경 — 이전/이후 커서 위치 어느 쪽도 구조 데코레이션 근처가
    // 아니면 reveal 상태가 바뀔 수 없다.
    const oldHead = tr.startState.selection.main.head;
    const newHead = tr.state.selection.main.head;
    return isNearAnyDecoration(value, oldHead, MARGIN) || isNearAnyDecoration(value, newHead, MARGIN);
  }

  let triggersOrNearby = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (triggersOrNearby) return;
    if (STRUCTURAL_TRIGGER_RE.test(inserted.toString())) {
      triggersOrNearby = true;
      return;
    }
    // 삭제된 원문에 트리거 문자가 있었는지도 확인(펜스를 지워서 없앤 경우).
    const deletedText = tr.startState.doc.sliceString(fromA, toA);
    if (STRUCTURAL_TRIGGER_RE.test(deletedText)) {
      triggersOrNearby = true;
      return;
    }
    // §8c 지적(부차) — fromA 만 보면 "멀리서 시작해 기존 데코레이션 바로 앞까지
    // 지우는" 삭제가 빠져나간다. toA 도 함께 확인한다.
    if (isNearAnyDecoration(value, fromA, MARGIN) || isNearAnyDecoration(value, toA, MARGIN)) {
      triggersOrNearby = true;
    }
  });
  return triggersOrNearby;
}

function makeStructuralField(decorators: SyntaxDecorator[]): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLayer(state, decorators, 0, state.doc.length);
    },
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value;

      if (!structuralTransactionNeedsFullRebuild(value, tr)) {
        // 싼 경로 — 위치만 옮긴다. 스캔 카운터는 늘리지 않는다(진짜로 안 훑었으므로).
        return value.map(tr.changes);
      }

      const t0 = performance.now();
      const next = buildLayer(tr.state, decorators, 0, tr.state.doc.length, (chars) => {
        structuralCalls++;
        structuralCharsScanned += chars;
      });
      structuralMs += performance.now() - t0;
      return next;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// ---------------------------------------------------------------------------
// 4. viewportPlugin — view.visibleRanges 로 제한
// ---------------------------------------------------------------------------

function makeViewportPlugin(decorators: SyntaxDecorator[]): Extension {
  class ViewportDecorator implements PluginValue {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        const t0 = performance.now();
        this.decorations = this.build(update.view);
        viewportMs += performance.now() - t0;
      }
    }
    build(view: EditorView): DecorationSet {
      const sets: DecorationSet[] = [];
      for (const { from, to } of view.visibleRanges) {
        for (const d of decorators) {
          try {
            viewportCalls++;
            viewportCharsScanned += to - from;
            sets.push(d.createDecorations(view.state, from, to));
          } catch (err) {
            console.warn(`[spike-b] viewport decorator "${d.name}" threw:`, err);
          }
        }
      }
      return RangeSet.join(sets);
    }
  }
  return ViewPlugin.fromClass(ViewportDecorator, { decorations: (v) => v.decorations });
}

// ---------------------------------------------------------------------------
// 5. 합성 문서 생성기
// ---------------------------------------------------------------------------

/** N 개 H2 섹션. 본문에 굵게/기울임/링크(뷰포트 레이어 실측 대상)를 섞는다.
 *  코드펜스·KaTeX·표는 N 과 무관하게 고정 개수(구조 레이어 정확성 확인용 —
 *  개수가 아니라 "매 라인 스캔 비용"이 N 에 걸리는 변수라 스케일링할 필요가
 *  없다). §8c DoD 추가: 표(TableDecorator, `table.from~table.to` 다중 라인
 *  replace)도 포함 — KaTeX 펜스와 함께 구조 레이어의 두 다중 라인 replace
 *  사례를 모두 실측한다. */
function makeDoc(n: number): string {
  const lines: string[] = ['# 스파이크 B 검증 문서', ''];
  for (let i = 1; i <= n; i++) {
    lines.push(`## 섹션 ${i}`);
    lines.push(`본문 ${i}-A **굵게 텍스트** 와 *기울임 텍스트* 를 포함합니다.`);
    lines.push(`본문 ${i}-B [링크텍스트](https://example.com/${i}) 도 있습니다.`);
    lines.push(`본문 ${i}-C 일반 텍스트 줄입니다.`);
    if (i === Math.floor(n * 0.25)) {
      lines.push('```js');
      lines.push('function fenceA() { return 1; }');
      lines.push('```');
    }
    if (i === Math.floor(n * 0.5)) {
      lines.push('$$');
      lines.push('E = mc^2');
      lines.push('$$');
    }
    if (i === Math.floor(n * 0.6)) {
      lines.push('| 헤더 1 | 헤더 2 | 헤더 3 |');
      lines.push('| --- | --- | --- |');
      lines.push('| 셀 1 | 셀 2 | 셀 3 |');
      lines.push('| 셀 4 | 셀 5 | 셀 6 |');
    }
    if (i === Math.floor(n * 0.75)) {
      lines.push('```js');
      lines.push('function fenceB() { return 2; }');
      lines.push('```');
    }
    if (i === n) {
      lines.push('$$');
      lines.push('a^2 + b^2 = c^2');
      lines.push('$$');
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 6. 마운트 — split(2계층) vs baseline(현행 그대로)
// ---------------------------------------------------------------------------

interface Mounted {
  view: EditorView;
  container: HTMLElement;
}

/**
 * §8c 실측 지적: `EditorView.theme({'&':{height:'400px'}})` 는 `index.css` 의
 * `.cm-editor { height: 100%; }` (플레인 스타일시트, CM 의 동적 StyleModule보다
 * 캐스케이드 순서상 우선) 에 밀린다 — 실측: scroller.clientHeight ===
 * scroller.scrollHeight (뷰포트가 전체 문서 높이로 펴져 있었다, 즉 `visibleRanges`
 * 가 사실상 전체 문서였다). 컨테이너 자체에 인라인 스타일로 고정 높이를 주면
 * `.cm-editor{height:100%}` 가 그 고정 높이를 상속해 문제가 사라진다 — 캐스케이드
 * 싸움을 아예 안 하는 쪽으로 우회.
 */
function sizeContainer(container: HTMLElement): void {
  container.style.height = '400px';
  container.style.overflow = 'hidden';
}

function mountSplit(doc: string, container: HTMLElement): Mounted {
  sizeContainer(container);
  const structural = makeStructuralField(makeStructuralDecorators());
  const viewport = makeViewportPlugin(makeRangeSafeDecorators());
  const state = EditorState.create({
    doc,
    extensions: [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      EditorView.lineWrapping,
      structural,
      viewport,
      EditorView.theme({ '&': { fontSize: '14px' } }),
    ],
  });
  const view = new EditorView({ state, parent: container });
  return { view, container };
}

function mountBaseline(doc: string, container: HTMLElement): Mounted {
  sizeContainer(container);
  const decorators = makeAllDecoratorsForBaseline();
  const state = EditorState.create({
    doc,
    extensions: [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      EditorView.lineWrapping,
      createDecorationPlugin(decorators),
      EditorView.theme({ '&': { fontSize: '14px' } }),
    ],
  });
  const view = new EditorView({ state, parent: container });
  return { view, container };
}

/**
 * §3-A-1 이 겪은 "hidden 탭에서 rAF 가 아예 발화하지 않아 무한 대기" 함정을 피한다.
 * 이 스파이크가 재는 것은 **디코레이션 재빌드 JS 계산 시간**(`performance.now()` 로
 * `dispatch()` 를 직접 감싼 값)이지, §6 mount_cost_t2 처럼 실제 페인트/레이아웃
 * 사이클에 물린 값이 아니다 — 탭이 hidden 이어도(Chrome 은 hidden 탭에서 스케줄링
 * *빈도*만 죽이지, 실행된 동기 코드의 실측 CPU 시간 자체를 왜곡하지 않는다)
 * 유효하다. 그래서 rAF 가 오면 쓰고, 안 오면(hidden) 짧은 타이머로 대체한다 —
 * 스크롤/뷰포트 안정화를 위한 한 틱 양보가 목적이지, 실제 페인트 동기화가 목적이
 * 아니기 때문에 이 대체가 정당하다.
 */
async function settle(): Promise<void> {
  await Promise.race([
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    new Promise<void>((r) => setTimeout(r, 50)),
  ]);
}

// ---------------------------------------------------------------------------
// 7. 측정
// ---------------------------------------------------------------------------

interface RawSample {
  n: number;
  splitKeystrokeMs: number;
  splitStructuralMs: number;
  splitViewportMs: number;
  baselineKeystrokeMs: number;
  splitSelectionMs: number;
  baselineSelectionMs: number;
  /** §8c 제안 — 환경(hidden 탭)에 흔들리지 않는 정수 지표. */
  structuralCharsScanned: number;
  viewportCharsScanned: number;
  structuralCalls: number;
  viewportCalls: number;
}

export type EditPosition = 'near-structural' | 'far-from-structural';

/**
 * 편집 위치를 두 조건으로 나눈다 — 이 구분 자체가 실측으로 드러난 사실이다:
 * "문서 중간"(near-structural) 은 우연히 KaTeX/표 블록 근처였고, 그 근접성
 * 하나로 구조 레이어 결과가 완전히 달라졌다(§8c 이후 개선 참고).
 *   - **far-from-structural**: 펜스/표에서 충분히 떨어진 일반 문단 — 실제
 *     키 입력 대다수가 여기 해당한다(문서에 특수 블록은 드물다).
 *   - **near-structural**: 문서 "중간" 지점 — 이 합성 문서 구성상 우연히
 *     KaTeX 블록 근처라 최악 조건 역할을 한다(구조 레이어 폴백 트리거).
 */
function pickLine(mode: EditPosition, doc: EditorState['doc']): number {
  if (mode === 'far-from-structural') return 8;
  return Math.max(2, Math.floor(doc.lines / 2));
}

/** 지정된 위치에서 키 입력 1회 + undo, 그리고 화살표 이동 1회를 잰다.
 *  undo/이동 자체는 타이밍 창 밖에서 수행한다. */
function measureOnce(split: Mounted, baseline: Mounted, n: number, mode: EditPosition): RawSample {
  const line = pickLine(mode, split.view.state.doc);
  const pos = split.view.state.doc.line(line).from + 1;
  const basePos = baseline.view.state.doc.line(line).from + 1;

  // ── 키 입력 1회 ──────────────────────────────────────────────────────
  resetTimers();
  const t0 = performance.now();
  split.view.dispatch({ changes: { from: pos, insert: 'x' } });
  const splitKeystrokeMs = performance.now() - t0;
  const splitStructuralMs = structuralMs;
  const splitViewportMs = viewportMs;
  // 키 입력 1회분의 스캔량만 반영한다 — 아래 화살표 측정이 전역 카운터를 더 늘리기
  // 전에 스냅샷을 떠 둔다(전역 누적 카운터를 그대로 읽으면 화살표 측정분까지 섞인다).
  const keystrokeStructuralChars = structuralCharsScanned;
  const keystrokeViewportChars = viewportCharsScanned;
  const keystrokeStructuralCalls = structuralCalls;
  const keystrokeViewportCalls = viewportCalls;
  // undo — 다음 반복을 위해 문서를 원상복구 (타이밍 창 밖)
  split.view.dispatch({ changes: { from: pos, to: pos + 1, insert: '' } });

  const tb0 = performance.now();
  baseline.view.dispatch({ changes: { from: basePos, insert: 'x' } });
  const baselineKeystrokeMs = performance.now() - tb0;
  baseline.view.dispatch({ changes: { from: basePos, to: basePos + 1, insert: '' } });

  // ── 화살표 1회(셀렉션 변경만, 문서 변경 없음) ──────────────────────────
  const anchor1 = Math.min(pos + 5, split.view.state.doc.length);
  const ts0 = performance.now();
  split.view.dispatch({ selection: { anchor: anchor1 } });
  const splitSelectionMs = performance.now() - ts0;

  const baseAnchor1 = Math.min(basePos + 5, baseline.view.state.doc.length);
  const tbs0 = performance.now();
  baseline.view.dispatch({ selection: { anchor: baseAnchor1 } });
  const baselineSelectionMs = performance.now() - tbs0;

  return {
    n,
    splitKeystrokeMs,
    splitStructuralMs,
    splitViewportMs,
    baselineKeystrokeMs,
    splitSelectionMs,
    baselineSelectionMs,
    structuralCharsScanned: keystrokeStructuralChars,
    viewportCharsScanned: keystrokeViewportChars,
    structuralCalls: keystrokeStructuralCalls,
    viewportCalls: keystrokeViewportCalls,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface SpikeBResult {
  n: number;
  keystroke: { split: number; splitStructural: number; splitViewport: number; baseline: number };
  selection: { split: number; baseline: number };
  /** §8c 제안 — hidden 탭이든 아니든 흔들리지 않는 정수 지표(키 입력 1회 기준). */
  chars: { structural: number; viewport: number };
  calls: { structural: number; viewport: number };
  /** 뷰포트 유효성 가드 — 실제로 문서 전체가 아니라 일부만 보고 있는지. */
  viewportValidity: { visibleSpanChars: number; docLengthChars: number; ratio: number; valid: boolean };
}

/**
 * 측정 규율(§4.4): 조건별 워밍업 1회 폐기, 3회 반복 중앙값, N 조건 인터리브.
 *
 * `document.visibilityState` 가 hidden 이어도 `settle()` 이 더 이상 멈추지 않는다
 * (rAF/타이머 경합, 위 주석 참고). 이 스파이크는 §6(mount_cost_t2) 과 달리
 * 페인트/레이아웃 사이클이 아니라 `performance.now()` 로 감싼 **동기 JS 계산
 * 시간**을 재므로 hidden 상태에서도 유효하다 — 다만 hidden 이면 콘솔에 경고를
 * 남긴다(육안 확인이 필요한 다른 DoD 항목까지 자동으로 보증하진 않는다).
 */
export async function run(
  ns: number[] = [50, 100, 200],
  reps = 4,
  mode: EditPosition = 'far-from-structural',
): Promise<SpikeBResult[]> {
  if (document.visibilityState !== 'visible') {
    console.warn(
      '[spike-b] document.visibilityState !== "visible" — JS 계산 시간(performance.now() 델타)은 유효하지만, ' +
        '이 실행만으로 화면 렌더(커서 진입 위젯 해제 등)까지 검증된 것은 아니다. 별도로 육안 확인할 것.',
    );
  }

  const root = document.getElementById('root')!;
  root.innerHTML = '';

  const mounts = new Map<number, { split: Mounted; baseline: Mounted }>();
  for (const n of ns) {
    const doc = makeDoc(n);

    const splitContainer = document.createElement('div');
    splitContainer.innerHTML = `<div style="font:11px monospace;color:#94a3b8;padding:4px 0;">split N=${n}</div>`;
    root.appendChild(splitContainer);
    const splitHost = document.createElement('div');
    splitContainer.appendChild(splitHost);
    const split = mountSplit(doc, splitHost);

    const baseContainer = document.createElement('div');
    baseContainer.innerHTML = `<div style="font:11px monospace;color:#94a3b8;padding:4px 0;">baseline N=${n}</div>`;
    root.appendChild(baseContainer);
    const baseHost = document.createElement('div');
    baseContainer.appendChild(baseHost);
    const baseline = mountBaseline(doc, baseHost);

    // 뷰포트가 실제로 문서 일부만 보이도록 중간 지점까지 스크롤한다.
    const scroller = split.view.scrollDOM;
    scroller.scrollTop = scroller.scrollHeight / 3;
    const baseScroller = baseline.view.scrollDOM;
    baseScroller.scrollTop = baseScroller.scrollHeight / 3;

    mounts.set(n, { split, baseline });
  }

  await settle();
  // 뷰포트 계산이 스크롤 반영 후 안정화되도록 한 번 더 대기 + 강제 measure.
  for (const { split } of mounts.values()) split.view.requestMeasure();
  await settle();

  // ── §8c 지적 — 뷰포트 유효성 가드 ────────────────────────────────────
  // `visibleRanges` 가 실제로 문서 일부만 가리키는지 확인한다. 전체 문서를
  // 가리키고 있다면(예: 컨테이너 높이 CSS 가 안 먹어서 스크롤러가 콘텐츠
  // 전체 높이로 펴짐) 뷰포트 레이어가 "일 안 해서 빠른" 것이지 설계가 이겨서
  // 빠른 게 아니다 — 그 결과는 무효로 표시한다.
  const viewportValidityByN = new Map<number, { visibleSpanChars: number; docLengthChars: number; ratio: number; valid: boolean }>();
  for (const [n, { split }] of mounts) {
    const visibleSpanChars = split.view.visibleRanges.reduce((sum, r) => sum + (r.to - r.from), 0);
    const docLengthChars = split.view.state.doc.length;
    const ratio = visibleSpanChars / docLengthChars;
    // 뷰포트가 400px 고정 컨테이너인데 문서가 그보다 훨씬 크면(N>=100 근방) ratio 가
    // 뚜렷하게 1 미만이어야 한다. 느슨하게 0.9 를 문턱으로 삼는다.
    const valid = ratio < 0.9;
    viewportValidityByN.set(n, { visibleSpanChars, docLengthChars, ratio, valid });
    console.log(
      `[spike-b] N=${n} viewport validity: visible=${visibleSpanChars}/${docLengthChars} chars (${(ratio * 100).toFixed(1)}%) ${valid ? 'OK — 실제로 일부만 본다' : '⚠️ INVALID — 사실상 전체 문서를 보고 있다, 뷰포트 레이어 결과 무효'}`,
    );
  }

  const samplesByN = new Map<number, RawSample[]>();
  for (const n of ns) samplesByN.set(n, []);

  for (let rep = 0; rep < reps; rep++) {
    for (const n of ns) {
      const { split, baseline } = mounts.get(n)!;
      const sample = measureOnce(split, baseline, n, mode);
      samplesByN.get(n)!.push(sample);
      // eslint-disable-next-line no-await-in-loop
      await settle();
    }
  }

  const results: SpikeBResult[] = [];
  for (const n of ns) {
    const samples = samplesByN.get(n)!.slice(1); // 첫 반복(워밍업) 폐기
    results.push({
      n,
      keystroke: {
        split: median(samples.map((s) => s.splitKeystrokeMs)),
        splitStructural: median(samples.map((s) => s.splitStructuralMs)),
        splitViewport: median(samples.map((s) => s.splitViewportMs)),
        baseline: median(samples.map((s) => s.baselineKeystrokeMs)),
      },
      selection: {
        split: median(samples.map((s) => s.splitSelectionMs)),
        baseline: median(samples.map((s) => s.baselineSelectionMs)),
      },
      chars: {
        structural: median(samples.map((s) => s.structuralCharsScanned)),
        viewport: median(samples.map((s) => s.viewportCharsScanned)),
      },
      calls: {
        structural: median(samples.map((s) => s.structuralCalls)),
        viewport: median(samples.map((s) => s.viewportCalls)),
      },
      viewportValidity: viewportValidityByN.get(n)!,
    });
  }

  console.log(`[spike-b] mode=${mode}`);
  console.table(
    results.map((r) => ({
      N: r.n,
      valid: r.viewportValidity.valid ? 'OK' : '⚠️ INVALID',
      'chars structural': r.chars.structural,
      'chars viewport': r.chars.viewport,
      'keystroke split(ms)': r.keystroke.split.toFixed(3),
      '  structural': r.keystroke.splitStructural.toFixed(3),
      '  viewport': r.keystroke.splitViewport.toFixed(3),
      'keystroke baseline(ms)': r.keystroke.baseline.toFixed(3),
      'selection split(ms)': r.selection.split.toFixed(3),
      'selection baseline(ms)': r.selection.baseline.toFixed(3),
    })),
  );

  lastMounts = mounts;
  return results;
}

/** 콘솔에서 직접 위젯/커서 동작을 확인할 수 있도록 마지막 run() 의 뷰를 노출한다. */
let lastMounts: Map<number, { split: Mounted; baseline: Mounted }> | null = null;

function getSplitView(n: number): EditorView {
  const m = lastMounts?.get(n);
  if (!m) throw new Error(`[spike-b] N=${n} 이 마운트돼 있지 않다 — 먼저 run() 을 호출할 것`);
  return m.split.view;
}

/**
 * 위젯 렌더 여부를 **DOM 가상화/스크롤 위치와 무관하게** 검증한다 — 구조
 * 레이어는 StateField 라 전체 문서에 대해 항상 데코레이션을 만들지만, DOM 은
 * CodeMirror 자체가 뷰포트 근방만 마운트하므로(가상화) "DOM 에 없다"가 곧
 * "데코레이션이 안 만들어졌다"를 의미하지 않는다 — 그 둘을 분리해서 본다.
 * 결과의 `replace` 항목이 KaTeX 펜스/표 위젯이 실제로 존재하는지를 말해준다.
 */
function debugStructuralDecorations(n: number): Array<{ from: number; to: number; text: string }> {
  const view = getSplitView(n);
  const set = buildLayer(view.state, makeStructuralDecorators(), 0, view.state.doc.length);
  const out: Array<{ from: number; to: number; text: string }> = [];
  const cursor = set.iter();
  while (cursor.value) {
    if (cursor.value.spec.widget) {
      out.push({ from: cursor.from, to: cursor.to, text: view.state.sliceDoc(cursor.from, cursor.to).slice(0, 40) });
    }
    cursor.next();
  }
  return out;
}

(
  window as unknown as {
    spikeB: { run: typeof run; getSplitView: typeof getSplitView; debugStructuralDecorations: typeof debugStructuralDecorations };
  }
).spikeB = { run, getSplitView, debugStructuralDecorations };
