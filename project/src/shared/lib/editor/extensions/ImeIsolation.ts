/**
 * ImeIsolation.ts
 *
 * [BUG-20260810-02 수정] StateField + dispatch 로직 전면 폐기.
 *
 * 이전 구현(RFC-20260810-01)의 문제:
 *   `dispatchImeCommit`이 COMPOSITION_COMMIT 수신 시 `view.dispatch`를 호출함.
 *   macOS IMK가 조합 중 쥐고 있던 DOM 노드를 CodeMirror가 재렌더링으로 파괴하면서
 *   `error messaging the mach port for IMKCFRunLoopWakeUpReliable` OS 에러와
 *   텍스트 증식('라라라라') 버그 발생.
 *
 * 현재 구현 — 빈 Extension (No-op):
 *   모든 IME DOM 처리는 WebKit + CodeMirror 네이티브 로직에 완전 위임.
 *   이 파일은 하위 호환성(import 경로 유지)을 위해 빈 Extension만 내보낸다.
 *
 * Store Sync Latch 전략:
 *   IME 중 onUpdate 억제는 BlockEditor.tsx의 updateListener에서
 *   `useImeInputManager()`가 반환하는 `isComposingRef`와
 *   `update.view.composing`의 OR 조합으로만 처리한다.
 */

import { Extension } from '@codemirror/state';

/**
 * @deprecated BUG-20260810-02 수정으로 내부 로직 전면 폐기.
 *             BlockEditor.tsx의 import 경로 유지를 위해 빈 Extension 반환.
 */
export function createImeIsolationExtension(): Extension {
  return []; // No-op — 모든 IME 처리는 WebKit + CodeMirror에 위임
}
