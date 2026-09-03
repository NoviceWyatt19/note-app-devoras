/**
 * Step 1 배타 플래그 (`single_cm_transition.md` §6 Step 1, `DEBUG_PLAN.md` §5.0.3).
 *
 * `true` 면 `SingleDocEditor`(단일 CM), `false` 면 기존 블록별 CodeMirror 트리
 * (`BlockNode`/`CodeMirrorBlock`) — **반드시 배타 선택이어야 한다.** 둘 다
 * 마운트하면 `EditorView` 가 두 벌 살아나 이 전환이 없애려는 바로 그 비용
 * (동시 생존 인스턴스 수)이 되살아난다. `BlockEditor.tsx` 는 이 함수의 결과로
 * 정확히 한쪽 분기만 렌더한다 — 절대 두 분기를 함께 렌더하지 말 것.
 *
 * **제거 기한**: `DEBUG_PLAN.md` §5.0.4 의 Step 2 진입 게이트 7건을 통과하고
 * Step 2(데이터 흐름 단순화 — tabStore 에서 blocks 제거)가 끝나는 시점.
 * 그 전까지는 이 파일 하나만 고치면(또는 `localStorage` 오버라이드로 재빌드
 * 없이) 즉시 원복된다 — 이것이 "플래그로 원복 가능한 상태"의 실체다.
 */
const DEFAULT_ENABLED = false;

const STORAGE_KEY = 'devoras:singleDocEditor';

export function isSingleDocEditorEnabled(): boolean {
  if (typeof localStorage !== 'undefined') {
    try {
      const override = localStorage.getItem(STORAGE_KEY);
      if (override === '1') return true;
      if (override === '0') return false;
    } catch {
      // localStorage 접근 실패(예: 프라이빗 모드) — 기본값으로 폴백.
    }
  }
  return DEFAULT_ENABLED;
}
