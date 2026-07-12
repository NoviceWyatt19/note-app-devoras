import { WorkspacePage } from '@/pages/WorkspacePage/WorkspacePage';

function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-darkBg text-slate-100 flex flex-col">
      {/* App Header Bar (Tauri Desktop Titlebar styling helper) */}
      <header className="h-12 bg-darkPanel border-b border-darkBorder flex items-center justify-between px-5 select-none">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-sm tracking-widest text-primary">DEVORAS</span>
          <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-900/60 px-2 py-0.5 rounded font-semibold tracking-wide">
            MVP
          </span>
        </div>
        <div className="text-xs text-mutedText font-medium">
          텍스트와 마인드맵의 실시간 단방향 투영 캔버스
        </div>
        <div className="w-16"></div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 min-h-0 relative">
        <WorkspacePage />
      </main>
    </div>
  );
}

export default App;
