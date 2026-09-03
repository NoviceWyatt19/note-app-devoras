import { EditorState, Extension, RangeSet, StateField, Transaction } from '@codemirror/state';
import { DecorationSet, EditorView, PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { SyntaxDecorator } from './types';

/**
 * `SingleDocEditor` 전용 오케스트레이터 — 문서 전체가 하나의 `EditorView` 인
 * 단일 CM 편집기에서만 쓴다. 블록당 CM 인스턴스인 구 쓰기 경로의
 * `orchestrator.createDecorationPlugin`(및 그 위에 쌓인 `markdownDecorationPlugin`)
 * 은 **건드리지 않는다** — 이 파일은 그 옆에 나란히 놓이는 새 조립이다
 * (DEBUG_PLAN §6 위험 7: 전환 기간 중 `createDecorationPlugin` 에 아무것도
 * 새로 등록하지 않는다).
 *
 * 기법 검증: `SPIKE-20260902-B`(spike_b_orchestrator_incremental.ts) — 실제
 * 데코레이터 13종을 감사한 결과 10종은 이미 `[from,to)` 만 스캔하는 범위 인식
 * 코드였고(`CustomSymbolDecorator.ts` 주석이 스스로 전제를 밝혀 둠), 다중 라인
 * 매칭 쌍이 필요한 3종(CodeBlock·Table·Latex)만 전체 문서 스캔이 필요했다.
 * 그 경계를 그대로 층으로 나눈다:
 *
 *   - **구조 레이어**(`StateField`) — CodeBlock·Table·Latex. 다중 라인
 *     `Decoration.replace` 는 CM6 가 뷰포트를 계산하기 전에 알아야 하므로
 *     `ViewPlugin` 이 아니라 `StateField` 여야 한다. 트리거 게이트로 대부분의
 *     트랜잭션은 전체 재빌드를 건너뛴다(아래 §트리거 게이트).
 *   - **뷰포트 레이어**(`ViewPlugin`) — 나머지 10종. `view.visibleRanges` 로
 *     제한해 문서 크기와 무관한 상수 비용을 유지한다.
 *
 * 실측(N=50/100/200, spike_b): 문법 트리거에서 먼 일반 문단 편집은 완전히
 * 평평(키 입력 6.0/5.5/4.5ms, 화살표 1.2/1.2/1.2ms) — 베이스라인(현행 오케스트
 * 레이터를 문서 전체에 그대로 적용했을 때)의 선형 증가(9.6/16.1/35.6ms,
 * 4.0/13.6/44.5ms)와 대조적이다. 펜스/표/KaTeX 에 직접 인접한 편집만 완만하게
 * 증가하고(N=200 에서 9ms, 16ms 프레임 예산 이내), 이는 `CodeBlockDecorator`/
 * `TableDecorator` 를 범위 인식으로 재작성(진짜 B-2)하면 더 줄일 수 있는
 * **유예된 후속 작업**이다(DEBUG_PLAN §5.0 결정 2) — 기각된 대안이 아니다.
 */

// ---------------------------------------------------------------------------
// 트리거 게이트 — DEBUG_PLAN §5.0.5: 결합점을 문서가 아니라 테스트로 지킨다
// ---------------------------------------------------------------------------

/**
 * 구조 데코레이터가 반응하는 문법 트리거 문자.
 *
 * ⚠️ **이 집합은 구조 데코레이터 목록이 바뀔 때마다 갱신해야 하는 결합점이다.**
 * `TableDecorator` 가 게이트 도중 등록되며 다중 라인 replace 가 1종에서 2종으로
 * 늘었고, 이 상수 자체도 실전에서 한 번 구멍이 났다 — 최초 구현은 백틱·`$`·`|`
 * 만 넣고 `~~~` 펜스(CommonMark 유효, `CodeBlockDecorator.ts` 의 `FENCE_OPEN_RE`
 * 가 이미 지원)를 놓쳤다(교차검증으로 발견, 커밋 `16fe373`). 이 결합이 다시
 * 조용히 깨지지 않도록 `structural_trigger_coverage_harness.ts`(T1) 가 이
 * 상수와 각 구조 데코레이터의 구분자를 기계적으로 대조한다 — **새 구조
 * 데코레이터를 추가하면 그 하네스가 실패해야 정상이다.**
 *
 * `#`(Step 1 추가) — `BlockCardDecorator` 는 다중 라인 매칭 쌍이 아니라
 * "헤딩 구간 전체에 라인 클래스를 씌운다"는 다른 이유로 이 레이어에 있지만,
 * 결합점 성격은 같다: 헤딩 레벨이 바뀌면(`#` 삽입/삭제) 카드 경계 자체가
 * 바뀐다. 카드 구간 **안쪽**(헤딩 문자와 무관한 일반 문단 편집)은 트리거
 * 문자 없이도 `isNearAnyDecoration` 의 근접 검사로 잡힌다 — `Decoration.line()`
 * 은 매 줄마다(제로폭이라도) 존재하므로 200자 여유 안에 반드시 걸린다.
 * `#` 이 필요한 건 오직 "기존 카드에서 멀리 떨어진 곳에 새 헤딩을 만드는"
 * 경우뿐이다 — 근접 검사로 못 잡는 유일한 케이스.
 */
export const STRUCTURAL_TRIGGER_RE = /[`$|~#]/;

/** 편집·커서 위치가 기존 구조 데코레이션 범위(여유 `margin` 포함) 안에 있는가.
 *  펜스/표/KaTeX 위젯 근처의 편집·커서 이동은 그 위젯의 reveal 상태를 바꿀 수
 *  있으므로 안전하게 전체 재빌드로 폴백해야 한다. */
function isNearAnyDecoration(set: DecorationSet, pos: number, margin: number): boolean {
  let found = false;
  set.between(Math.max(0, pos - margin), pos + margin, () => {
    found = true;
    return false;
  });
  return found;
}

/** 구조 데코레이션 근접 판정에 쓰는 여유값(문자 단위) — 표/펜스 헤더가 트랜잭션의
 *  직접 변경 지점에서 조금 떨어져 있어도 안전하게 잡는다. */
const STRUCTURAL_PROXIMITY_MARGIN = 200;

/**
 * 이 트랜잭션이 구조 레이어 전체 재빌드를 필요로 하는가.
 *
 * 아니라면 `value.map(tr.changes)` 로 위치만 옮기고 끝낸다 — 실제 문서에서
 * 대다수 키 입력은 일반 문단 텍스트이므로 이 경로를 탄다(spike_b 실측:
 * far-from-structural 모드에서 구조 레이어 스캔 문자 수 0).
 */
function structuralTransactionNeedsFullRebuild(value: DecorationSet, tr: Transaction): boolean {
  if (!tr.docChanged) {
    // 순수 셀렉션 변경 — 이전/이후 커서 위치 어느 쪽도 구조 데코레이션 근처가
    // 아니면 reveal 상태(cursorInside)가 바뀔 수 없다.
    const oldHead = tr.startState.selection.main.head;
    const newHead = tr.state.selection.main.head;
    return (
      isNearAnyDecoration(value, oldHead, STRUCTURAL_PROXIMITY_MARGIN) ||
      isNearAnyDecoration(value, newHead, STRUCTURAL_PROXIMITY_MARGIN)
    );
  }

  let needsRebuild = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (needsRebuild) return;
    if (STRUCTURAL_TRIGGER_RE.test(inserted.toString())) {
      needsRebuild = true;
      return;
    }
    // 삭제된 원문에 트리거 문자가 있었는지도 확인(펜스를 지워서 없앤 경우).
    const deletedText = tr.startState.doc.sliceString(fromA, toA);
    if (STRUCTURAL_TRIGGER_RE.test(deletedText)) {
      needsRebuild = true;
      return;
    }
    // 시작점·끝점 둘 다 확인한다 — 멀리서 시작해 기존 데코레이션 바로 앞까지
    // 지우는 삭제가 시작점만 보면 빠져나간다.
    if (
      isNearAnyDecoration(value, fromA, STRUCTURAL_PROXIMITY_MARGIN) ||
      isNearAnyDecoration(value, toA, STRUCTURAL_PROXIMITY_MARGIN)
    ) {
      needsRebuild = true;
    }
  });
  return needsRebuild;
}

function buildLayer(state: EditorState, decorators: readonly SyntaxDecorator[], from: number, to: number): DecorationSet {
  const sets = decorators.map((d) => {
    try {
      return d.createDecorations(state, from, to);
    } catch (err) {
      console.warn(`[singleDocOrchestrator] decorator "${d.name}" threw:`, err);
      return RangeSet.empty as DecorationSet;
    }
  });
  return RangeSet.join(sets);
}

// ---------------------------------------------------------------------------
// 구조 레이어 — StateField, 트리거 게이트로 대부분의 재빌드를 건너뛴다
// ---------------------------------------------------------------------------

function makeStructuralField(decorators: readonly SyntaxDecorator[]): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLayer(state, decorators, 0, state.doc.length);
    },
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value;
      if (!structuralTransactionNeedsFullRebuild(value, tr)) {
        return value.map(tr.changes);
      }
      return buildLayer(tr.state, decorators, 0, tr.state.doc.length);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// ---------------------------------------------------------------------------
// 뷰포트 레이어 — ViewPlugin, view.visibleRanges 로 제한
// ---------------------------------------------------------------------------

function makeViewportPlugin(decorators: readonly SyntaxDecorator[]): Extension {
  class ViewportDecorator implements PluginValue {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const sets: DecorationSet[] = [];
      for (const { from, to } of view.visibleRanges) {
        for (const d of decorators) {
          try {
            sets.push(d.createDecorations(view.state, from, to));
          } catch (err) {
            console.warn(`[singleDocOrchestrator] viewport decorator "${d.name}" threw:`, err);
          }
        }
      }
      return RangeSet.join(sets);
    }
  }
  return ViewPlugin.fromClass(ViewportDecorator, { decorations: (v) => v.decorations });
}

// ---------------------------------------------------------------------------
// 공개 팩토리
// ---------------------------------------------------------------------------

/**
 * `SingleDocEditor` 에서만 사용하는 2계층 데코레이션 확장을 만든다.
 *
 * @param structuralDecorators 다중 라인 매칭 쌍이 필요한 데코레이터(코드펜스·표·KaTeX).
 *   전체 문서를 스캔하지만 트리거 게이트가 대부분의 트랜잭션에서 그 스캔 자체를 건너뛴다.
 * @param viewportDecorators   `[from,to)` 만 스캔하는 나머지 데코레이터. 뷰포트로 제한된다.
 */
export function createSingleDocDecorationPlugin(
  structuralDecorators: readonly SyntaxDecorator[],
  viewportDecorators: readonly SyntaxDecorator[],
): Extension {
  return [makeStructuralField(structuralDecorators), makeViewportPlugin(viewportDecorators)];
}
