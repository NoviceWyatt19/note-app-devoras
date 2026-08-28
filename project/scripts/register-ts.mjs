/** `node --import ./scripts/register-ts.mjs <harness.ts>` 로 T1 하네스를 실행한다. */
import { register } from 'node:module';
register('./ts-hook.mjs', import.meta.url);
