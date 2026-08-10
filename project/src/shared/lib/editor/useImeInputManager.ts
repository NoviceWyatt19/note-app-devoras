/**
 * useImeInputManager.ts
 *
 * Layer 1 — IME 조합 상태 Latch (가벼운 잠금 장치)
 *
 * True Pass-through 원칙:
 *   IME 조합(Preedit) 텍스트의 DOM 렌더링은 100% 브라우저(WebKit)와
 *   CodeMirror 네이티브 로직에 완전히 위임한다.
 *   이 훅은 절대로 view.dispatch를 호출하거나 DOM에 개입하지 않는다.
 *
 * 유일한 역할:
 *   compositionstart ~ compositionend 구간 동안
 *   `isComposing: true` boolean 래치를 제공하여,
 *   BlockEditor의 updateListener가 Zustand 스토어로 preedit 중간값이
 *   넘어가는 것(onUpdate 호출)을 차단하도록 돕는다.
 *
 * @example
 *   const isImeComposing = useImeInputManager();
 *   // updateListener에서:
 *   if (isImeComposing.current || update.view.composing) return;
 *   callbacksRef.current.onUpdate(...);
 */

import { useEffect, useRef } from 'react';

// ── 훅 구현 ───────────────────────────────────────────────────────────────

/**
 * IME 조합 중 여부를 추적하는 경량 Latch 훅.
 *
 * @returns MutableRefObject<boolean> — ref 형태로 반환하므로
 *          리렌더 없이 updateListener 내부에서 즉시 읽을 수 있다.
 */
export function useImeInputManager(): React.MutableRefObject<boolean> {
  const isComposingRef = useRef(false);

  useEffect(() => {
    // capture phase — CodeMirror의 bubble-phase 핸들러보다 먼저 실행.
    // WKWebView는 compositionupdate 사이에 view.composing === false를
    // 간헐적으로 보고하므로, DOM 이벤트를 직접 래치로 사용한다.
    const onStart = (): void => { isComposingRef.current = true; };
    const onEnd   = (): void => { isComposingRef.current = false; };

    document.addEventListener('compositionstart', onStart, true);
    document.addEventListener('compositionend',   onEnd,   true);

    console.log('[IME-INPUT] IME latch registered (capture phase)');

    return () => {
      document.removeEventListener('compositionstart', onStart, true);
      document.removeEventListener('compositionend',   onEnd,   true);
      isComposingRef.current = false;
      console.log('[IME-INPUT] IME latch unregistered');
    };
  }, []);

  return isComposingRef;
}
