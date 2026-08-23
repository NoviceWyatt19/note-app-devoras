/**
 * 디스크 저장 전용 debounce 팩토리.
 * 동일 키에 대해 지정된 시간(delayMs) 내 중복 호출을 병합하여 마지막 1회만 실행합니다.
 */
export function createDebouncedWriter(delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (writeFn: () => Promise<void>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      try {
        await writeFn();
      } catch (err) {
        console.error('[DebouncedWriter] 저장 실패:', err);
      }
    }, delayMs);
  };
}
