/**
 * BUG-20260831-01 — CodeMirror↔store 조정자의 캐럿 판정 로직(순수 함수).
 *
 * `focusOffset` 은 "지금 캐럿이 여기 있다"는 상태가 아니라 "캐럿을 여기로
 * 옮겨라"는 명령이다 — `focusBlock`/`mergeBlockWithPrevious` 가 호출될 때만
 * 갱신되고, 일반 타이핑으로는 갱신되지 않는다. 조정자가 이걸 매 렌더의 캐럿
 * 정답으로 취급하면, 타이핑으로 뷰의 캐럿이 이미 옮겨간 뒤에도 스토어엔 낡은
 * 값이 남아 있어 매 키 입력마다 캐럿을 그 낡은 위치로 되돌린다:
 *
 *   - 낡은 값이 0 이면 → 캐럿이 "#" 앞(offset 0)으로 튄다 (H1 에서 관찰된 S1)
 *   - 낡은 값이 0 이 아니면 → 그 지점을 축으로 글자가 쌓여 순서가 뒤집힌다 (S2)
 *
 * 증상은 둘이지만 원인은 하나다. 해법은 "명령 토큰"(focusToken, 단조 증가) —
 * `focusToken` 이 이 블록 인스턴스가 마지막으로 반영한 값과 다를 때만 새
 * 명령으로 간주해 `focusOffset` 을 적용하고, 그렇지 않으면 뷰 자신의 현재
 * 캐럿(또는 diff 로 투영한 위치)을 그대로 신뢰한다.
 *
 * 이 판정은 `BlockEditor.tsx` 의 `CodeMirrorBlock` 조정자(`useLayoutEffect`)
 * 안에 원래 인라인으로 있었다. CodeMirror `EditorView` 없이도(T1, 순수 Node)
 * 검증할 수 있도록 판정 로직만 여기로 뽑았다 — `view.dispatch` 같은 실제
 * 부수효과는 호출부(BlockEditor.tsx)에 그대로 남는다.
 */
export interface CaretDecisionInput {
  /** view 의 현재 문서와 block.content 가 다른가(diff 치환이 필요한가). */
  contentChanged: boolean;
  /** 이 블록이 활성 블록인가. */
  isFocused: boolean;
  /** 스토어의 현재 캐럿 명령 토큰. */
  focusToken: number;
  /** 이 블록 인스턴스가 마지막으로 반영한 캐럿 명령 토큰. */
  consumedFocusToken: number;
  /** 스토어가 지정한 캐럿 오프셋(명령이 있을 때만 의미가 있다). */
  focusOffset: number;
  /**
   * contentChanged=true 일 때만 쓰인다 — diff(ChangeSet.mapPos) 를 통해 투영한
   * "지금 caret 이 있어야 할 위치"(새 명령이 없을 때의 정답).
   */
  mappedAnchor: number;
  /** 클램프 상한 — contentChanged=false 면 뷰의 현재 문서 길이, true 면 block.content.length. */
  maxOffset: number;
}

export type CaretDecision =
  /** 캐럿을 옮기지 않는다 — 뷰 자신의 현재 캐럿이 정답이다. */
  | { type: 'skip' }
  /**
   * 이 오프셋으로 캐럿을 옮긴다(호출부가 디스패치해야 한다).
   * `consumedFreshCommand` 가 true 면 호출부가 `consumedFocusToken` 을
   * 현재 `focusToken` 으로 갱신하고 R3 불변식(디스패치 결과 검증)을 돌려야
   * 한다 — false 면(내용 변경만 있고 명령은 없던 경우) 토큰을 건드리지 않는다.
   */
  | { type: 'apply'; anchor: number; consumedFreshCommand: boolean };

export function decideCaretAction(input: CaretDecisionInput): CaretDecision {
  const { contentChanged, isFocused, focusToken, consumedFocusToken, focusOffset, mappedAnchor, maxOffset } = input;

  // 활성 블록이 아니면(=이 블록을 향한 캐럿 명령일 수 없다) 새 명령으로 볼 수 없다.
  const hasFreshFocusCommand = isFocused && focusToken !== consumedFocusToken;

  if (!contentChanged) {
    // 내용은 그대로다 — 새 캐럿 명령이 있을 때만 옮긴다. 비활성 블록이거나
    // 명령이 없으면(=일반 타이핑 도중) 뷰의 현재 캐럿을 그대로 둔다.
    if (!hasFreshFocusCommand) return { type: 'skip' };
    return { type: 'apply', anchor: Math.min(focusOffset, maxOffset), consumedFreshCommand: true };
  }

  // 내용이 바뀌었다 — 디스패치 자체는 항상 필요하지만(치환), 캐럿 목적지는
  // 새 명령이 있을 때만 focusOffset 을 쓰고, 없으면 diff 로 투영한 위치를 쓴다.
  if (hasFreshFocusCommand) {
    return { type: 'apply', anchor: Math.min(Math.max(0, focusOffset), maxOffset), consumedFreshCommand: true };
  }
  return { type: 'apply', anchor: mappedAnchor, consumedFreshCommand: false };
}
