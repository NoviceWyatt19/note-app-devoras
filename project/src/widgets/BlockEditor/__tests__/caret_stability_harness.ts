/**
 * BUG-20260831-01 — 캐럿 안정성 하네스 (T1)
 *
 * CodeMirror↔store 조정자의 캐럿 판정 로직(`decideCaretAction`,
 * `shared/lib/editor/caretCoordinator.ts`)을 실제 `EditorView` 없이 검사한다.
 * 이 로직은 순수 함수로 뽑혀 있고 `BlockEditor.tsx` 의 조정자가 그대로
 * 호출한다 — 여기서 통과하면 조정자도 같은 판정을 내린다는 뜻이다.
 *
 * 배경: focusOffset 은 "지금 캐럿이 여기 있다"는 상태가 아니라 "캐럿을 여기로
 * 옮겨라"는 명령이다. focusBlock/mergeBlockWithPrevious 가 호출될 때만
 * 갱신되고, 일반 타이핑으로는 갱신되지 않는다. 조정자가 이걸 매 렌더 캐럿
 * 정답으로 취급하면(수정 전 코드) 타이핑 중 캐럿이 낡은 위치로 계속 튄다.
 * focusToken(단조 증가)이 마지막으로 반영한 값과 다를 때만 "새 명령"으로
 * 간주해 focusOffset 을 적용하고, 그렇지 않으면 뷰 자신의 캐럿(또는 diff 로
 * 투영한 위치)을 신뢰한다.
 *
 * 실행: pnpm test:caretstability
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { decideCaretAction } from '../../../shared/lib/editor/caretCoordinator.ts';

test('caret coordinator — 캐럿 판정 로직 (BUG-20260831-01)', async (t) => {
  await t.test('C1: 내용 동일 + 포커스 유지 + 캐럿 명령 없음 → 캐럿을 옮기지 않는다', () => {
    const decision = decideCaretAction({
      contentChanged: false,
      isFocused: true,
      focusToken: 3,
      consumedFocusToken: 3, // 이미 반영한 토큰과 동일 — 새 명령 아님
      focusOffset: 0, // 낡은 값(H1 재현: 0)이 남아 있어도
      mappedAnchor: 0,
      maxOffset: 20,
    });
    assert.deepStrictEqual(decision, { type: 'skip' }, '새 명령이 없으면 일반 타이핑 중 캐럿을 절대 건드리면 안 된다');
  });

  await t.test('C2: focusBlock 직후(새 토큰) → 지정한 오프셋으로 옮긴다', () => {
    const decision = decideCaretAction({
      contentChanged: false,
      isFocused: true,
      focusToken: 4, // focusBlock 이 3 -> 4 로 올림
      consumedFocusToken: 3, // 아직 반영 전
      focusOffset: 5,
      mappedAnchor: 0,
      maxOffset: 20,
    });
    assert.deepStrictEqual(decision, { type: 'apply', anchor: 5, consumedFreshCommand: true });
  });

  await t.test('C3: 낡은 focusOffset 이 0 이 아닌 값으로 남아 있고 새 명령이 없음 → 무시한다(S2 재현 조건)', () => {
    const decision = decideCaretAction({
      contentChanged: false,
      isFocused: true,
      focusToken: 7,
      consumedFocusToken: 7, // 이미 반영됨
      focusOffset: 3, // 예전 코드였다면 캐럿이 이 지점으로 계속 끌려가 글자가 쌓였을 값
      mappedAnchor: 0,
      maxOffset: 20,
    });
    assert.deepStrictEqual(decision, { type: 'skip' }, 'focusOffset 이 0 이 아니어도(S2 재현 조건) 새 명령이 없으면 무시해야 한다');
  });

  await t.test('C4: 병합으로 내용이 바뀜 + 포커스 대상(새 토큰) → 스토어 오프셋을 따른다', () => {
    const decision = decideCaretAction({
      contentChanged: true,
      isFocused: true,
      focusToken: 9, // mergeBlockWithPrevious 가 올림
      consumedFocusToken: 8,
      focusOffset: 12, // 병합 지점
      mappedAnchor: 99, // diff 투영값 — 새 명령이 있으므로 무시돼야 한다
      maxOffset: 30,
    });
    assert.deepStrictEqual(decision, { type: 'apply', anchor: 12, consumedFreshCommand: true });
  });

  await t.test('C4b: 콘텐츠 변경 + 새 명령 없음 → diff 로 투영한 위치를 쓴다(디바운스 동기화 등)', () => {
    const decision = decideCaretAction({
      contentChanged: true,
      isFocused: true,
      focusToken: 5,
      consumedFocusToken: 5, // 새 명령 없음
      focusOffset: 0, // 낡은 값 — 쓰이면 안 된다
      mappedAnchor: 17, // diff 를 통해 투영한 "지금 caret 이 있어야 할 위치"
      maxOffset: 30,
    });
    assert.deepStrictEqual(
      decision,
      { type: 'apply', anchor: 17, consumedFreshCommand: false },
      '새 명령이 없으면 콘텐츠가 바뀌어도 낡은 focusOffset 이 아니라 diff 투영값을 써야 한다 — ' +
        'isFocused 만으로 분기하던 옛 코드가 이 케이스에서 같은 결함을 갖고 있었다',
    );
  });

  await t.test('C5: 비활성 블록 → 어떤 경우에도 캐럿을 옮기지 않는다(내용 불변 분기)', () => {
    const decision = decideCaretAction({
      contentChanged: false,
      isFocused: false,
      focusToken: 4,
      consumedFocusToken: 3, // 토큰은 새로 왔지만 이 블록을 향한 게 아니다
      focusOffset: 5,
      mappedAnchor: 0,
      maxOffset: 20,
    });
    assert.deepStrictEqual(decision, { type: 'skip' }, '비활성 블록은 focusToken 이 새로 왔어도 절대 캐럿을 옮기면 안 된다');
  });

  await t.test('C5b: 비활성 블록 + 콘텐츠 변경 → diff 투영 위치를 쓴다(포커스 명령 무시)', () => {
    const decision = decideCaretAction({
      contentChanged: true,
      isFocused: false,
      focusToken: 4,
      consumedFocusToken: 3,
      focusOffset: 5, // 이 블록을 향한 명령이 아니므로 무시돼야 한다
      mappedAnchor: 22,
      maxOffset: 30,
    });
    assert.deepStrictEqual(
      decision,
      { type: 'apply', anchor: 22, consumedFreshCommand: false },
      '비활성 블록은 콘텐츠가 바뀌어도 diff 투영 위치를 써야 한다 — focusOffset 을 쓰면 안 된다',
    );
  });

  await t.test('경계: maxOffset 클램프 — focusOffset 이 문서 길이를 넘으면 잘린다', () => {
    const decision = decideCaretAction({
      contentChanged: false,
      isFocused: true,
      focusToken: 2,
      consumedFocusToken: 1,
      focusOffset: 999,
      mappedAnchor: 0,
      maxOffset: 10,
    });
    assert.deepStrictEqual(decision, { type: 'apply', anchor: 10, consumedFreshCommand: true });
  });

  await t.test('경계: focusOffset 음수 방어 — contentChanged 분기는 0 미만을 0 으로 클램프한다', () => {
    const decision = decideCaretAction({
      contentChanged: true,
      isFocused: true,
      focusToken: 2,
      consumedFocusToken: 1,
      focusOffset: -5,
      mappedAnchor: 0,
      maxOffset: 10,
    });
    assert.deepStrictEqual(decision, { type: 'apply', anchor: 0, consumedFreshCommand: true });
  });
});
