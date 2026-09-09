import { useDocumentStore } from './store';
import { useSettingsStore } from '@/entities/settings/model/store';

/**
 * FEAT-20260904-01 — 탭별 디바운스 자동 저장.
 *
 * `updateContentForTab`(탭 콘텐츠가 바뀌는 유일한 진입점)이 실제 변경마다
 * `scheduleAutosave` 를 부른다. 여기서 다시 `useDocumentStore.getState().saveFile`
 * 를 호출하는 순환 의존은 함수 몸체 안에서만(타이머 콜백 시점에) 참조하므로
 * 안전하다 — 모듈 최상위에서 즉시 평가하지 않는다.
 *
 * flush/discard 결정(둘 다 명시적으로 만들지 않는다):
 *   - **탭 전환** — `_snapshotActiveTab` 이 이미 떠나는 탭의 최신 내용을
 *     `cache` 에 담아 두고, `saveFile` 은 라이브 스토어가 없으면(탭 전환으로
 *     Provider 가 언마운트됐으면) 그 `cache` 로 폴백한다. 그래서 예약된
 *     타이머가 전환 이후에 발화해도 최신 내용을 정확히 저장한다 — 별도 flush 불필요.
 *   - **탭 닫기** — `confirmDiscardIfDirty` 가 이미 dirty 탭 닫기를 확인받는다.
 *     자동 저장이 그 전에 따라잡으면 확인창 자체가 안 뜬다(정상). 못 따라잡았으면
 *     기존과 동일하게 사용자가 명시적으로 "닫으시겠습니까"에 동의해야 한다 —
 *     자동 저장이 이 기존 안전장치를 약화시키지 않는다. 다만 닫히는 탭에 대한
 *     예약은 취소한다(아래 cancelAutosave) — 탭이 사라진 뒤 뒤늦게 발화해도
 *     `saveFile` 자체가 탭을 못 찾아 안전하게 no-op 이지만, 도는 타이머를
 *     남겨 둘 이유가 없다.
 *   - **앱 종료** — `App.tsx` 의 `onCloseRequested` 가 이미 dirty 탭이 있으면
 *     경고하고 사용자 확인을 받는다. 이 기존 방어선을 그대로 신뢰한다 —
 *     종료 시퀀스에 새로 flush 로직을 얹지 않는다.
 */

export const AUTOSAVE_DELAY_MS: Record<'low' | 'high', number> = {
  low: 5000,
  high: 1500,
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 직전 내용이 있는데 새 내용이 비었으면 건너뛴다 — 파싱 실패·일시적 빈 상태를
 * 디스크에 그대로 밀어 넣지 않는다(FEAT-20260904-01 안전장치. D12 가 ERD 의
 * "빈 스켈레톤을 여는 것만으로 씀" 경로 자체를 없앴으므로, 이 검사가 잡는 것은
 * 그것과 다른 축 — 라이브 편집 중 내용이 실제로 비워지는 경우다).
 */
export function shouldSkipAutosave(prevContent: string, newContent: string): boolean {
  return prevContent.trim() !== '' && newContent.trim() === '';
}

export function scheduleAutosave(paneId: string, tabId: string, prevContent: string, newContent: string): void {
  const level = useSettingsStore.getState().settings.editor.autosaveLevel;
  if (level === 'off') return;

  if (shouldSkipAutosave(prevContent, newContent)) {
    console.warn(`[Autosave] tab ${tabId} 자동 저장 건너뜀 — 직전 내용이 있었는데 새 내용이 비었습니다. dirty 유지, 수동 저장이 필요합니다.`);
    cancelAutosave(tabId);
    return;
  }

  cancelAutosave(tabId);
  const timer = setTimeout(() => {
    timers.delete(tabId);
    // saveFile 은 실패를 자체적으로 로깅하고 삼킨다(store.ts) — 여기서 또
    // 잡을 필요는 없지만, 그 계약이 깨지는 경우까지 대비해 방어적으로 남긴다.
    useDocumentStore.getState().saveFile(paneId, tabId).catch((e) => {
      console.error(`[Autosave] tab ${tabId} 저장 중 예기치 못한 오류:`, e);
    });
  }, AUTOSAVE_DELAY_MS[level]);
  // updateContentForTab 은 T1(node:test) 하네스에서도 직접 호출된다 — Node 의
  // setTimeout 은 unref() 가 없으면 프로세스 종료를 막아, 자동 저장과 무관한
  // 테스트까지 매번 1.5~5초씩 대기시킨다. 브라우저 setTimeout 에는 unref 가
  // 없으므로(실제 앱 동작엔 영향 없음) 존재할 때만 방어적으로 부른다.
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  timers.set(tabId, timer);
}

export function cancelAutosave(tabId: string): void {
  const timer = timers.get(tabId);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(tabId);
  }
}

/** 테스트 전용 — 모듈 전역 타이머 맵이 테스트 케이스 사이에 새는 것을 막는다. */
export function __clearAutosaveTimersForTests(): void {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
}

/** 테스트 전용 — 실제 지연을 기다리지 않고 "예약돼 있는가"만 확인한다. */
export function __isAutosaveScheduledForTests(tabId: string): boolean {
  return timers.has(tabId);
}
