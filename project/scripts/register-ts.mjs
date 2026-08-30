/** `node --import ./scripts/register-ts.mjs <harness.ts>` 로 T1 하네스를 실행한다. */
import { register } from 'node:module';

// Vite 가 번들 시점에 주입하는 `import.meta.env`(DEV/PROD/MODE) 는 순수 Node 에는
// 없다 — 참조하면 "Cannot read properties of undefined" 로 죽는다. ts-hook.mjs 가
// 소스의 `import.meta.env` 를 이 전역으로 바꿔치기하므로, 하네스가 로드되기 전에
// 여기서 먼저 채워 둔다(REF-20260831-01, tabStore.ts 의 DEV 전용 경고가 처음 노출).
globalThis.__DEVORAS_TEST_ENV__ = { DEV: true, PROD: false, MODE: 'test' };

register('./ts-hook.mjs', import.meta.url);
