/**
 * ImeIsolation.ts
 *
 * Layer 2 — CodeMirror IME 격리 Extension
 *
 * 역할:
 *   - CodeMirror 내부에 IME 조합 상태(StateField<ImeState>)를 추적한다.
 *   - `imeAnnotation`으로 마킹된 트랜잭션을 식별하여 BlockEditor의
 *     updateListener가 IME 출처 변경을 스토어에 이중으로 커밋하는 것을 방지한다.
 *   - `dispatchImeCommit()` 헬퍼를 통해 Layer 3(BlockEditor)이 조합 확정
 *     트랜잭션을 단 1회, 안전하게 dispatch할 수 있도록 제공한다.
 *
 * 설계 결정 — pass-through 정책:
 *   compositionstart/update/end 이벤트를 suppress하지 않는다.
 *   CodeMirror의 자체 preedit 렌더링을 그대로 허용하여 조합 중 글자가
 *   에디터에 보이도록 유지한다. suppress 시 preedit 문자 미표시 위험이 있다.
 *   이 Extension은 스토어 반영 타이밍만 제어한다.
 *
 * 공개 API:
 *   - `imeAnnotation`    : IME 출처 트랜잭션 마킹용 AnnotationType
 *   - `imeStateField`    : 현재 IME 조합 상태 StateField
 *   - `dispatchImeCommit(view, text)` : 확정 텍스트를 1회 안전하게 dispatch
 *   - `createImeIsolationExtension()` : Extension 생성 팩토리
 */

import {
  Annotation,
  AnnotationType,
  Extension,
  StateEffect,
  StateField,
  Transaction,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// ── IME 조합 상태 ─────────────────────────────────────────────────────────

export interface ImeState {
  /** 현재 IME 조합 진행 중 여부 */
  composing: boolean;
  /** 현재 조합 중인 preedit 문자열 */
  preedit: string;
}

// ── StateEffect 정의 ──────────────────────────────────────────────────────

const ImeStartEffect  = StateEffect.define<string>(); // payload = 초기 preedit
const ImeUpdateEffect = StateEffect.define<string>(); // payload = 갱신 preedit
const ImeCommitEffect = StateEffect.define<string>(); // payload = 확정 문자열

// ── IME 출처 트랜잭션 마킹 Annotation ────────────────────────────────────

/**
 * IME 합성에서 비롯된 트랜잭션임을 마킹하는 Annotation.
 *
 * BlockEditor의 updateListener는 이 annotation이 있는 트랜잭션을 무시하여
 * 스토어에 preedit 중간값이 커밋되는 것을 방지한다.
 *
 * 사용 예:
 *   view.dispatch({
 *     changes: { ... },
 *     annotations: [imeAnnotation.of('ime')],
 *   });
 */
export const imeAnnotation: AnnotationType<'ime'> = Annotation.define<'ime'>();

// ── StateField ────────────────────────────────────────────────────────────

/**
 * CodeMirror 내부에서 IME 조합 상태를 추적하는 StateField.
 *
 * updateListener에서 `view.state.field(imeStateField)` 로 현재 조합 상태를
 * 확인할 수 있다.
 */
export const imeStateField = StateField.define<ImeState>({
  create: () => ({ composing: false, preedit: '' }),

  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(ImeStartEffect)) {
        return { composing: true, preedit: effect.value };
      }
      if (effect.is(ImeUpdateEffect)) {
        return { composing: true, preedit: effect.value };
      }
      if (effect.is(ImeCommitEffect)) {
        return { composing: false, preedit: '' };
      }
    }
    return state;
  },
});

// ── dispatchImeCommit ─────────────────────────────────────────────────────

/**
 * IME 조합 확정 트랜잭션을 CodeMirror에 1회 안전하게 dispatch한다.
 *
 * - `ImeCommitEffect`로 imeStateField를 composing=false로 전환
 * - `imeAnnotation.of('ime')`으로 마킹하여 updateListener의 이중 커밋 방지
 *
 * 주의: CodeMirror의 contenteditable이 이미 preedit 문자를 DOM에 삽입했으므로
 * 이 함수는 별도의 doc 변경 없이 상태 플래그만 초기화한다.
 * (실제 텍스트 삽입은 WKWebView → CodeMirror contenteditable 경로가 처리)
 *
 * @param view  현재 활성 EditorView
 * @param _text  확정 문자열 (현재는 상태 초기화에만 사용; 향후 검증용)
 */
export function dispatchImeCommit(view: EditorView, _text: string): void {
  view.dispatch({
    effects: [ImeCommitEffect.of(_text)],
    annotations: [
      imeAnnotation.of('ime'),
      Transaction.userEvent.of('ime.commit'),
    ],
  });
}

// ── Internal: domEventHandlers (capture phase) ───────────────────────────

/**
 * CodeMirror의 contentDOM에 capture phase composition 이벤트 리스너를 등록.
 *
 * pass-through 정책: 이벤트를 소비(stop)하지 않으므로 CodeMirror 자체
 * preedit 렌더링이 계속 동작한다. StateEffect만 dispatch하여 imeStateField를
 * 업데이트한다.
 */
function createCompositionHandlers(view: EditorView) {
  const onStart = (e: Event): void => {
    const ce = e as CompositionEvent;
    view.dispatch({
      effects: [ImeStartEffect.of(ce.data ?? '')],
      annotations: [imeAnnotation.of('ime')],
    });
  };

  const onUpdate = (e: Event): void => {
    const ce = e as CompositionEvent;
    view.dispatch({
      effects: [ImeUpdateEffect.of(ce.data ?? '')],
      annotations: [imeAnnotation.of('ime')],
    });
  };

  const onEnd = (e: Event): void => {
    const ce = e as CompositionEvent;
    view.dispatch({
      effects: [ImeCommitEffect.of(ce.data ?? '')],
      annotations: [imeAnnotation.of('ime')],
    });
  };

  // capture phase — CodeMirror 내부 bubble-phase 핸들러보다 먼저 실행
  view.contentDOM.addEventListener('compositionstart',  onStart,  true);
  view.contentDOM.addEventListener('compositionupdate', onUpdate, true);
  view.contentDOM.addEventListener('compositionend',    onEnd,    true);

  return () => {
    view.contentDOM.removeEventListener('compositionstart',  onStart,  true);
    view.contentDOM.removeEventListener('compositionupdate', onUpdate, true);
    view.contentDOM.removeEventListener('compositionend',    onEnd,    true);
  };
}

// ── 공개 팩토리 ───────────────────────────────────────────────────────────

/**
 * IME 격리 Extension을 생성한다.
 *
 * BlockEditor의 EditorState.create({ extensions: [..., createImeIsolationExtension()] })
 * 에 추가하면 된다.
 *
 * @returns CodeMirror Extension (StateField + ViewPlugin 대체 구현)
 */
export function createImeIsolationExtension(): Extension {
  // ViewPlugin 대신 EditorView.domEventHandlers를 통한 composition 이벤트 수신.
  // StateField만으로도 imeAnnotation 감지 역할을 하므로 ViewPlugin 불필요.
  return [
    imeStateField,
    // composition 이벤트 핸들러를 EditorView 생애주기에 맞춰 등록/해제하기 위해
    // updateListener를 일회성 연결 지점으로 활용한다.
    EditorView.updateListener.of((update) => {
      // 최초 업데이트 시 한 번만 등록 (이후에는 클로저 내부에서 상태 유지)
      if (!(update.view as unknown as { _imeCleanup?: () => void })._imeCleanup) {
        const cleanup = createCompositionHandlers(update.view);
        (update.view as unknown as { _imeCleanup?: () => void })._imeCleanup = cleanup;
      }
    }),
  ];
}
