import { useEffect } from 'react';
import { WorkspacePage } from '@/pages/WorkspacePage/WorkspacePage';
import { LauncherPage } from '@/pages/LauncherPage/LauncherPage';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useRecentWorkspaceStore } from '@/entities/workspace/model/recentStore';
import { useSettingsStore } from '@/entities/settings/model/store';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useDocumentStore } from '@/entities/document/model/store';
import { hasDirtyTabs } from '@/pages/WorkspacePage/lib/confirmClose';
import { ask } from '@tauri-apps/plugin-dialog';

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
    await invoke('close_splashscreen');
    console.log('[Devoras] window revealed and splash closed via invoke');
  } catch (err) {
    console.warn('[Devoras] invoke(close_splashscreen) failed, trying fallback:', err);
    try {
      await getCurrentWindow().show();
      console.log('[Devoras] window revealed via getCurrentWindow()');
    } catch (e) {
      console.error('[Devoras] All attempts to reveal window failed:', e);
    }
  }
}

function App() {
  const { workspacePath } = useWorkspaceStore();
  const { loadFromDisk } = useRecentWorkspaceStore();

  useEffect(() => {
    const initApp = async () => {
      // 최근 목록 디스크에서 불러오기
      await loadFromDisk();
      
      // 설정 디스크에서 불러오기
      await useSettingsStore.getState().loadSettings();
      
      // 자동 열기 로직
      const currentStore = useRecentWorkspaceStore.getState();
      if (currentStore.autoOpenLast && currentStore.recentList.length > 0) {
        const lastWorkspace = currentStore.recentList[0];
        try {
          await useWorkspaceStore.getState().openWorkspaceByPath(lastWorkspace.path);
        } catch {
          console.warn('Failed to auto-open last workspace:', lastWorkspace.path);
          // 실패 시 런처에 머무름
        }
      }

      // 앱 닫기 방어
      getCurrentWindow().onCloseRequested(async (e) => {
        const { panes } = useDocumentStore.getState();
        if (!hasDirtyTabs(panes)) return;
        
        e.preventDefault();
        const canClose = await ask('저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까?', { title: 'Devoras', kind: 'warning' });
        if (canClose) {
          await getCurrentWindow().destroy();
        }
      });

      // 윈도우 표시 (초기화 완료 후)
      setTimeout(() => {
        revealWindow();
      }, 100);
    };

    initApp();
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
            Prototype
          </span>
        </div>
        <div data-tauri-drag-region className="text-xs text-mutedText font-medium">
          텍스트와 마인드맵의 실시간 단방향 투영 캔버스
        </div>
        <div data-tauri-drag-region className="w-16"></div>
      </header>

      {/* Main Area */}
      <main className="flex-1 min-h-0 relative flex">
        {workspacePath ? <WorkspacePage /> : <LauncherPage />}
      </main>
    </div>
  );
}

export default App;

