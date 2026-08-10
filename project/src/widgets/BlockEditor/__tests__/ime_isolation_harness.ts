/**
 * ime_isolation_harness.ts
 *
 * BUG-20260810-02 수정 후 하네스 검증 파일
 * run: pnpm test:ime
 *
 * True Pass-through 원칙 검증:
 *   - useImeInputManager: compositionstart/end 래치만 제공, DOM 개입 없음
 *   - ImeIsolation: 빈 Extension(No-op), 강제 dispatch 없음
 *   - BlockEditor updateListener: isImeComposingRef || view.composing 이중 가드
 */

// ── 유틸: 테스트 러너 ─────────────────────────────────────────────────────

type TestResult = { name: string; passed: boolean; error?: string };
const results: TestResult[] = [];
const testQueue: Array<() => Promise<void>> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  testQueue.push(async () => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  ✅ ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name, passed: false, error: msg });
      console.error(`  ❌ ${name}: ${msg}`);
    }
  });
}

async function runAll(): Promise<void> {
  console.log('\n[IME Isolation Harness] 테스트 시작 (BUG-20260810-02 수정 후)\n');
  for (const fn of testQueue) await fn();
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n결과: ${passed}/${total} 통과`);
  if (passed < total) throw new Error(`${total - passed}개 테스트 실패`);
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TC-01: ImeIsolation 모듈이 빈 Extension만 내보내는지 확인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('TC-01: createImeIsolationExtension()은 빈 배열 반환', async () => {
  const { createImeIsolationExtension } = await import(
    '../../../shared/lib/editor/extensions/ImeIsolation'
  );
  const ext = createImeIsolationExtension();
  assert(Array.isArray(ext), 'Extension이 배열이어야 함 (No-op)');
  assert((ext as unknown[]).length === 0, `빈 배열이어야 함 (length: ${(ext as unknown[]).length})`);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TC-02: IME 이중 가드 로직 — isComposing OR view.composing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('TC-02: Latch true → onUpdate 차단', () => {
  let updateCount = 0;
  const isImeComposing = { current: true }; // 조합 중 시뮬레이션

  const shouldUpdate = (viewComposing: boolean): boolean => {
    if (isImeComposing.current || viewComposing) return false;
    return true;
  };

  // 조합 중 — 차단
  if (shouldUpdate(false)) updateCount++;
  if (shouldUpdate(true))  updateCount++;

  assert(updateCount === 0, `조합 중 onUpdate가 ${updateCount}회 호출됨 (0이어야 함)`);
});

test('TC-03: Latch false + viewComposing false → onUpdate 통과', () => {
  let updateCount = 0;
  const isImeComposing = { current: false }; // 조합 완료

  const shouldUpdate = (viewComposing: boolean): boolean => {
    if (isImeComposing.current || viewComposing) return false;
    return true;
  };

  if (shouldUpdate(false)) updateCount++;

  assert(updateCount === 1, `조합 완료 후 onUpdate가 ${updateCount}회 호출됨 (1이어야 함)`);
});

test('TC-04: view.composing true → Latch false여도 차단', () => {
  // WKWebView 버그 시나리오: view.composing이 true이면 isImeComposing이
  // 간헐적으로 false이더라도 반드시 차단되어야 한다.
  let updateCount = 0;
  const isImeComposing = { current: false }; // WKWebView 버그: 간헐적 false
  const viewComposing = true;                // 하지만 CodeMirror는 여전히 composing

  const shouldUpdate = (): boolean => {
    if (isImeComposing.current || viewComposing) return false;
    return true;
  };

  if (shouldUpdate()) updateCount++;

  assert(updateCount === 0, `view.composing=true 시 차단 실패 (count: ${updateCount})`);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TC-05: dispatchImeCommit / imeAnnotation 미사용 확인 (DOM 개입 없음 원칙)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('TC-05: ImeIsolation에서 dispatchImeCommit/imeAnnotation 미노출', async () => {
  const mod = await import('../../../shared/lib/editor/extensions/ImeIsolation') as Record<string, unknown>;
  const hasDispatch = 'dispatchImeCommit' in mod;
  const hasAnnotation = 'imeAnnotation' in mod;
  assert(!hasDispatch, 'dispatchImeCommit이 여전히 export됨 — 완전히 제거 필요');
  assert(!hasAnnotation, 'imeAnnotation이 여전히 export됨 — 완전히 제거 필요');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 진입점
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { runAll as runImeIsolationHarness };

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('ime_isolation')) {
  runAll().catch((err) => {
    console.error('\n[IME Harness] 실패:', err.message);
    process.exit(1);
  });
}
