import { useEffect } from 'react';
import { WorkspacePage } from '@/pages/WorkspacePage/WorkspacePage';
import { useWorkspaceStore } from '@/entities/workspace/model/store';

// Detect Tauri 2 runtime — same dual-check as fs.ts
const isTauri =
  typeof window !== 'undefined' &&
  ((window as any).__TAURI__ !== undefined ||
    (window as any).__TAURI_INTERNALS__ !== undefined);

// Removed startWindowDrag to prevent blocking window reveal

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
  const { workspacePath } = useWorkspaceStore();
  // 초기 렌더링(DOM + 테마 적용)이 완전히 끝난 직후 윈도우를 노출.
  useEffect(() => {
    // 폰트 로드 및 브라우저의 실제 페인트 타이밍을 기다린 뒤 창을 표시합니다.
    document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          revealWindow();
        }, 50); // React DOM 파싱 및 렌더링 후 Tauri 웹뷰가 화면을 칠할 수 있는 약간의 여유 시간 부여
      });
    });
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
        <WorkspacePage key={workspacePath || 'empty'} />
      </main>
    </div>
  );
}

export default App;
