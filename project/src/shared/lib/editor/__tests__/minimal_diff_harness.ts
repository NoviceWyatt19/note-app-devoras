/**
 * A2 — 최소 diff 계산(computeMinimalChange) 하네스.
 *
 * 스토어→뷰 동기화가 항상 문서 전체를 치환하던 것(A2)을 공통 접두/접미
 * 절단 기반 최소 치환으로 바꾸는 Step 5 의 핵심 유틸이다. 이 함수 자체가
 * 잘못되면 조정자 전체가 잘못된 범위를 치환하므로 독립적으로 검증한다.
 *
 * 실행: pnpm test:diff
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { computeMinimalChange } from '../minimalDiff';

function apply(oldDoc: string, change: ReturnType<typeof computeMinimalChange>): string {
  return oldDoc.slice(0, change.from) + change.insert + oldDoc.slice(change.to);
}

test('computeMinimalChange (A2)', async (t) => {
  await t.test('D1: 동일 문자열이면 변경 없음(from===to, insert 빈 문자열)', () => {
    const c = computeMinimalChange('hello', 'hello');
    assert.deepStrictEqual(c, { from: 5, to: 5, insert: '' });
  });

  await t.test('D2: 끝에 한 글자만 추가되면 그 한 글자만 치환 구간이다', () => {
    const c = computeMinimalChange('hello', 'hello!');
    assert.deepStrictEqual(c, { from: 5, to: 5, insert: '!' });
    assert.strictEqual(apply('hello', c), 'hello!');
  });

  await t.test('D3: 앞에 한 글자만 추가되면 맨 앞만 치환 구간이다', () => {
    const c = computeMinimalChange('ello', 'hello');
    assert.deepStrictEqual(c, { from: 0, to: 0, insert: 'h' });
    assert.strictEqual(apply('ello', c), 'hello');
  });

  await t.test('D4: 중간 한 글자 오타 수정은 그 글자만 치환한다(공통 접두/접미 보존)', () => {
    const c = computeMinimalChange('Hello wrold', 'Hello world');
    assert.strictEqual(apply('Hello wrold', c), 'Hello world');
    // 접두 "Hello w"(7) + 접미 "ld"(2) 는 안 건드리고 중간만 친다
    assert.ok(c.to - c.from <= 4, `치환 구간이 필요 이상으로 넓다: ${JSON.stringify(c)}`);
  });

  await t.test('D5: 전체가 다른 문자열이면 접두/접미가 없어 사실상 전체 치환이다', () => {
    const c = computeMinimalChange('abc', 'xyz');
    assert.strictEqual(apply('abc', c), 'xyz');
  });

  await t.test('D6: 빈 문서에서 내용이 생기면 삽입만 일어난다', () => {
    const c = computeMinimalChange('', '# Title');
    assert.deepStrictEqual(c, { from: 0, to: 0, insert: '# Title' });
  });

  await t.test('D7: 전체 삭제(빈 문서로)', () => {
    const c = computeMinimalChange('# Title', '');
    assert.deepStrictEqual(c, { from: 0, to: 7, insert: '' });
  });

  await t.test('D8: 공통 접두/접미가 겹치는 경계 케이스("aa" -> "aaa")가 안전하다', () => {
    const c = computeMinimalChange('aa', 'aaa');
    assert.strictEqual(apply('aa', c), 'aaa');
  });
});
