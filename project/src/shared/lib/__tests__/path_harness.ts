/**
 * B1 / BUG-20260826-06 — 경로 접두사 매칭 하네스 (T1)
 *
 * 결함: `startsWith(oldPath)` 로 경로를 비교하면 `/w/plan` 을 리네임·삭제할 때
 *       형제 파일 `/w/plan_v2.md` 까지 같이 걸려 무관한 탭이 오염·오폐쇄된다.
 * 처방: `isSameOrInside` / `rebasePath` (project/src/shared/lib/path.ts)
 *
 * 실행: pnpm test:path
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { isSameOrInside, rebasePath } from '../path.ts';

test('BUG-20260826-06 — 경로 접두사 매칭', async (t) => {
  await t.test('P1: 형제 파일이 접두사만 같다고 걸리지 않는다', () => {
    assert.equal(isSameOrInside('/w/plan_v2.md', '/w/plan'), false);
    // 티켓 원문 시나리오: 폴더 plan 을 지울 때 plan_v2.md 는 무관해야 한다
    assert.equal(isSameOrInside('/w/planning/a.md', '/w/plan'), false);
  });

  await t.test('P2: 자기 자신과 하위 경로는 걸린다', () => {
    assert.equal(isSameOrInside('/w/plan/a.md', '/w/plan'), true);
    assert.equal(isSameOrInside('/w/plan', '/w/plan'), true, '자기 자신도 대상이다');
    assert.equal(isSameOrInside('/w/plan/deep/nested/b.md', '/w/plan'), true);
  });

  await t.test('P3: rebasePath 가 base 만 교체한다', () => {
    assert.equal(rebasePath('/w/plan/a.md', '/w/plan', '/w/roadmap'), '/w/roadmap/a.md');
    assert.equal(rebasePath('/w/plan', '/w/plan', '/w/roadmap'), '/w/roadmap');
  });

  await t.test('P4: 경로 중간에 base 문자열이 반복돼도 접두사만 치환된다', () => {
    // '/w/plan/plan.md' 는 base '/w/plan' 이 두 번 등장한다.
    // 단순 replace 였다면 '/w/roadmap/roadmap.md' 가 되어 파일명까지 망가진다.
    assert.equal(
      rebasePath('/w/plan/plan.md', '/w/plan', '/w/roadmap'),
      '/w/roadmap/plan.md',
    );
    assert.equal(
      rebasePath('/w/plan/plan/plan.md', '/w/plan', '/w/x'),
      '/w/x/plan/plan.md',
    );
  });
});
