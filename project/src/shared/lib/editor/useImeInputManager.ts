/**
 * useImeInputManager.ts
 *
 * Layer 1 — IME 수신/정규화 계층 (Platform Adapter)
 *
 * Humble Object Pattern:
 *   이 훅은 macOS WKWebView의 한글 IME 합성 이벤트
 *   (compositionstart / compositionupdate / compositionend)를
 *   최전방 capture phase에서 수신하고, 정규화된 ImeCommand로
 *   변환하여 onCommand 콜백으로 전달하는 것만 담당한다.
 *
 *   CodeMirror와의 충돌 원인:
 *     WKWebView는 compositionupdate 사이에 view.composing === false를
 *     간헐적으로 보고하여 CodeMirror 내부 트랜잭션과 스토어 콜백이
 *     preedit 중간값을 이중으로 커밋하는 문제가 발생한다.
 *
 *   이 훅의 역할:
 *     1. document level (capture phase) 에서 IME 이벤트를 수신
 *        → CodeMirror의 bubble-phase 핸들러보다 먼저 실행
 *     2. ImeCommand 로 정규화하여 Layer 2(ImeIsolationExtension) 연동
 *     3. enabled() 체크로 포커스 중인 에디터에서만 활성화 (다중 탭 격리)
 *
 * @example
 *   useImeInputManager({
 *     onCommand: (cmd) => {
 *       if (cmd.type === 'COMPOSITION_COMMIT') {
 *         dispatchImeCommit(view, cmd.data);
 *       }
 *     },
 *     enabled: () => isCurrentBlockFocused,
 *   });
 */

import { useEffect, useRef } from 'react';

// ── 정규화된 IME 커맨드 타입 ──────────────────────────────────────────────

export type ImeCommand =
  /** 한글/CJK 조합 시작. data = 초기 preedit 문자열 (보통 '') */
  | { type: 'COMPOSITION_START'; data: string }
  /** 조합 중 업데이트. data = 현재 preedit 문자열 (예: '가', '각') */
  | { type: 'COMPOSITION_UPDATE'; data: string }
  /** 조합 확정. data = 최종 확정된 문자열 (예: '각') */
  | { type: 'COMPOSITION_COMMIT'; data: string }
  /** 비IME 직접 텍스트 삽입 (영문, 숫자, 기호 등). data = 삽입 텍스트 */
  | { type: 'TEXT_INSERT'; data: string };

// ── 훅 옵션 ──────────────────────────────────────────────────────────────

export interface UseImeInputManagerOptions {
  /** 정규화된 커맨드를 수신하는 핸들러 */
  onCommand: (cmd: ImeCommand) => void;
  /**
   * 이 훅이 활성화된 상태인지 외부에서 제어.
   * false이면 이벤트를 무시. (다른 탭/블록에 포커스가 있을 때 등)
   * 기본값: true
   */
  enabled?: () => boolean;
}

// ── 훅 구현 ───────────────────────────────────────────────────────────────

export function useImeInputManager({
  onCommand,
  enabled,
}: UseImeInputManagerOptions): void {
  // stale closure 방지: onCommand/enabled를 ref로 감싸 마운트 이후 렌더에서도
  // 항상 최신 콜백을 리스너 클로저가 참조하도록 한다.
  const onCommandRef = useRef(onCommand);
  const enabledRef = useRef(enabled);
  useEffect(() => { onCommandRef.current = onCommand; });
  useEffect(() => { enabledRef.current = enabled; });

  useEffect(() => {
    const isEnabled = (): boolean =>
      enabledRef.current ? enabledRef.current() : true;

    // ── compositionstart ───────────────────────────────────────────────
    const handleCompositionStart = (e: CompositionEvent): void => {
      if (!isEnabled()) return;
      onCommandRef.current({
        type: 'COMPOSITION_START',
        data: e.data ?? '',
      });
    };

    // ── compositionupdate ─────────────────────────────────────────────
    // WKWebView는 preedit 갱신마다 이 이벤트를 발생시킨다.
    // 이 훅은 단순히 정규화하여 전달만 한다.
    const handleCompositionUpdate = (e: CompositionEvent): void => {
      if (!isEnabled()) return;
      onCommandRef.current({
        type: 'COMPOSITION_UPDATE',
        data: e.data ?? '',
      });
    };

    // ── compositionend ────────────────────────────────────────────────
    // 최종 확정 문자를 COMPOSITION_COMMIT으로 전달.
    // Layer 3(BlockEditor)는 이 커맨드 수신 후 onUpdate를 1회 호출한다.
    const handleCompositionEnd = (e: CompositionEvent): void => {
      if (!isEnabled()) return;
      onCommandRef.current({
        type: 'COMPOSITION_COMMIT',
        data: e.data ?? '',
      });
    };

    // ── beforeinput (비IME 전용) ──────────────────────────────────────
    // isComposing === false 인 경우만 처리 → 영문/숫자 등 직접 입력.
    // IME 조합 중 발생하는 beforeinput은 Layer 2가 이미 처리하므로 무시.
    const handleBeforeInput = (e: InputEvent): void => {
      if (!isEnabled()) return;
      if (e.isComposing) return;                           // IME 중 무시
      if (e.inputType === 'insertCompositionText') return; // 명시적 제외
      if (e.inputType !== 'insertText') return;            // 텍스트 삽입만 처리
      if (!e.data) return;

      onCommandRef.current({
        type: 'TEXT_INSERT',
        data: e.data,
      });
    };

    // ── 이벤트 등록 (capture phase) ──────────────────────────────────
    // useCapture: true — CodeMirror의 bubble-phase 핸들러보다 먼저 실행.
    document.addEventListener('compositionstart',  handleCompositionStart,  true);
    document.addEventListener('compositionupdate', handleCompositionUpdate, true);
    document.addEventListener('compositionend',    handleCompositionEnd,    true);
    document.addEventListener('beforeinput',       handleBeforeInput as EventListener, true);

    console.log('[IME-INPUT] IME listeners registered (capture phase)');

    return () => {
      document.removeEventListener('compositionstart',  handleCompositionStart,  true);
      document.removeEventListener('compositionupdate', handleCompositionUpdate, true);
      document.removeEventListener('compositionend',    handleCompositionEnd,    true);
      document.removeEventListener('beforeinput',       handleBeforeInput as EventListener, true);
      console.log('[IME-INPUT] IME listeners unregistered');
    };
  }, []); // 마운트/언마운트 시 1회만 실행. 콜백은 ref로 관리.
}
