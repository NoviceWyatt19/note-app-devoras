import { useEffect } from 'react';
import { WorkspacePage } from '@/pages/WorkspacePage/WorkspacePage';

// Removed startWindowDrag to prevent blocking window reveal

/// Start Hidden & Reveal: 첫 렌더링 후 Rust 커맨드(또는 Tauri 내장 API)로 윈도우 노출.
async function revealWindow(): Promise<void> {
  const isTauriEnv =
    typeof window !== 'undefined' &&
    ((window as any).__TAURI__ !== undefined ||
      (window as any).__TAURI_INTERNALS__ !== undefined ||
      (window as any).__TAURI_IPC__ !== undefined);

  if (!isTauriEnv) {
    console.log('[Devoras] Not running in Tauri environment. revealWindow skipped.');
    return;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('close_splashscreen');
    console.log('[Devoras] window revealed and splash closed via invoke');
  } catch (err) {
    console.warn('[Devoras] invoke(close_splashscreen) failed, trying fallback:', err);
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().show();
      console.log('[Devoras] window revealed via getCurrentWindow()');
    } catch (e) {
      console.error('[Devoras] All attempts to reveal window failed:', e);
    }
  }
}

function App() {
  // 초기 렌더링(DOM + 테마 적용)이 완전히 끝난 직후 윈도우를 노출.
  useEffect(() => {
    // 주의: tauri.conf.json에서 visible: false 인 경우 requestAnimationFrame이나 
    // document.fonts.ready가 영원히 실행되지 않는 데드락이 발생할 수 있습니다.
    // 따라서 순수 setTimeout만 사용하여 윈도우를 띄워줍니다.
    setTimeout(() => {
      revealWindow();
    }, 100);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-darkBg text-slate-100 flex flex-col">
      {/* App Header Bar — drag-region + programmatic startDragging for Tauri 2 */}
      <header
        data-tauri-drag-region
        className="h-12 bg-darkPanel border-b border-darkBorder flex items-center justify-between pl-20 pr-5 select-none cursor-default"
      >
        <div data-tauri-drag-region className="flex items-center space-x-3">
          <span data-tauri-drag-region className="font-bold text-sm tracking-widest text-primary">DEVORAS</span>
          <span data-tauri-drag-region className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-900/60 px-2 py-0.5 rounded font-semibold tracking-wide">
            MVP
          </span>
        </div>
        <div data-tauri-drag-region className="text-xs text-mutedText font-medium">
          텍스트와 마인드맵의 실시간 단방향 투영 캔버스
        </div>
        <div data-tauri-drag-region className="w-16"></div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 min-h-0 relative">
        <WorkspacePage />
      </main>
    </div>
  );
}

export default App;
