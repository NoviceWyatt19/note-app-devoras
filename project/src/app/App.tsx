import { useEffect } from 'react';
import { WorkspacePage } from '@/pages/WorkspacePage/WorkspacePage';

// Detect Tauri 2 runtime — same dual-check as fs.ts
const isTauri =
  typeof window !== 'undefined' &&
  ((window as any).__TAURI__ !== undefined ||
    (window as any).__TAURI_INTERNALS__ !== undefined);

async function startWindowDrag() {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch (e) {
    console.warn('[Devoras] window.startDragging failed:', e);
  }
}

/// Start Hidden & Reveal: 첫 렌더링 후 Rust 커맨드로 윈도우 노출.
async function revealWindow(): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('show_main_window');
    console.log('[Devoras] window revealed');
  } catch (e) {
    console.warn('[Devoras] show_main_window failed:', e);
  }
}

function App() {
  // 초기 렌더링(DOM + 테마 적용)이 완전히 끝난 직후 윈도우를 노출.
  // requestAnimationFrame으로 첫 실제 페인트(paint) 이후로 지연하여
  // 어두운 배경이 완전히 그려진 상태의 윈도우만 사용자에게 보인다.
  useEffect(() => {
    requestAnimationFrame(() => {
      revealWindow();
    });
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-darkBg text-slate-100 flex flex-col">
      {/* App Header Bar — drag-region + programmatic startDragging for Tauri 2 */}
      <header
        data-tauri-drag-region
        onMouseDown={(e) => {
          // Left button only; allow right-click menus to work normally
          if (e.button === 0) startWindowDrag();
        }}
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
