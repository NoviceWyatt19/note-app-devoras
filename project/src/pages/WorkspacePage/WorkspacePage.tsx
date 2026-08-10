import React, { useState, useEffect } from 'react';
import { FileExplorer } from '@/widgets/FileExplorer';
import { BlockEditor } from '@/widgets/BlockEditor';
import { MindView } from '@/widgets/MindView';
import { useDocumentStore, SplitPane } from '@/entities/document/model/store';
import {
  LayoutPanelTop,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  FileText,
  Network,
  Columns,
} from 'lucide-react';

export const WorkspacePage: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [mindViewWidth, setMindViewWidth] = useState(550);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingMindView, setIsResizingMindView] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMindViewOpen, setIsMindViewOpen] = useState(false);

  const {
    panes,
    openTab,
    saveFile,
    closePane,
    isDirty,
    getCurrentFile,
  } = useDocumentStore();

  const currentFile = getCurrentFile();

  // Cmd+\ 사이드바 토글 및 저장 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  // Sidebar resizer
  useEffect(() => {
    if (!isResizingSidebar) return;
    const onMove = (e: MouseEvent) => setSidebarWidth(Math.max(180, Math.min(400, e.clientX)));
    const onUp = () => setIsResizingSidebar(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingSidebar]);

  // MindView resizer
  useEffect(() => {
    if (!isResizingMindView) return;
    const onMove = (e: MouseEvent) => {
      setMindViewWidth(Math.max(300, Math.min(window.innerWidth - 450, window.innerWidth - e.clientX)));
    };
    const onUp = () => setIsResizingMindView(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingMindView]);

  return (
    <div className="absolute inset-0 flex min-h-0 bg-darkBg text-slate-200">
      {/* 1. File Explorer Sidebar */}
      {isSidebarOpen && (
        <>
          <div
            style={{ width: `${sidebarWidth}px` }}
            className="flex-shrink-0 min-w-0 h-full flex flex-col bg-darkPanel border-r border-darkBorder"
          >
            <FileExplorer />
          </div>
          <div
            className={`w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary transition-colors flex-shrink-0 h-full ${
              isResizingSidebar ? 'bg-primary' : ''
            }`}
            onMouseDown={() => setIsResizingSidebar(true)}
          />
        </>
      )}

      {/* 2. Main Center Area (Split Panes) */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-darkBg relative overflow-hidden">
        {/* Workspace Title Bar */}
        <div
          data-tauri-drag-region
          className="h-10 border-b border-darkBorder flex items-center justify-between px-4 flex-shrink-0 bg-darkPanel/50"
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              title={isSidebarOpen ? '사이드바 닫기 (Cmd+\\)' : '사이드바 열기 (Cmd+\\)'}
              className="p-1 rounded text-mutedText hover:text-slate-200 hover:bg-white/10 transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
            <span className="text-xs font-semibold text-slate-300">Workspace</span>
          </div>

          <div className="flex items-center gap-2">
            {/* 독립 탭 마인드뷰 열기 버튼 */}
            <button
              onClick={() => openTab({ type: 'mindmap-global' })}
              title="독립 탭으로 마인드뷰 열기"
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded
                text-mutedText hover:text-slate-200 hover:bg-white/10 transition-colors border border-darkBorder/40"
            >
              <Network size={12} className="text-indigo-400" />
              <span>독립 마인드맵</span>
            </button>

            {/* 우측 사이드 팝업 마인드뷰 열기 버튼 */}
            {!isMindViewOpen && (
              <button
                onClick={() => setIsMindViewOpen(true)}
                title="사이드 마인드뷰 패널 열기"
                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded
                  text-mutedText hover:text-slate-200 hover:bg-white/10 transition-colors border border-darkBorder/40"
              >
                <LayoutPanelTop size={11} />
                <span>사이드 뷰</span>
              </button>
            )}

            {currentFile && (
              <button
                onClick={saveFile}
                className={`text-[10px] px-2.5 py-1 rounded font-bold uppercase tracking-wider transition-all border ${
                  isDirty
                    ? 'bg-primary/10 border-primary text-primary hover:bg-primary hover:text-white'
                    : 'border-darkBorder text-mutedText hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                저장 (Cmd+S)
              </button>
            )}
          </div>
        </div>

        {/* Panes Area */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {panes.map((pane) => (
            <PaneContainer
              key={pane.id}
              pane={pane}
              canClose={panes.length >= 2}
              onClose={() => closePane(pane.id)}
            />
          ))}
        </div>
      </div>

      {/* 3. Right Side MindView Panel */}
      {isMindViewOpen && (
        <>
          <div
            className={`w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary transition-colors flex-shrink-0 h-full ${
              isResizingMindView ? 'bg-primary' : ''
            }`}
            onMouseDown={() => setIsResizingMindView(true)}
          />
          <div
            style={{ width: `${mindViewWidth}px` }}
            className="flex-shrink-0 min-w-0 h-full bg-[#111216]/60 border-l border-darkBorder relative"
          >
            <MindView onClose={() => setIsMindViewOpen(false)} isStandalone={false} />
          </div>
        </>
      )}
    </div>
  );
};

// ── 패널 전용 렌더러 컴포넌트 ──────────────────────────────────────────
const PaneContainer: React.FC<{
  pane: SplitPane;
  canClose: boolean;
  onClose: () => void;
}> = ({ pane, canClose, onClose }) => {
  const { activePaneId, setActivePane, setActiveTab, closeTab, splitPane } = useDocumentStore();
  const isActivePane = pane.id === activePaneId;
  const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);

  return (
    <div
      onClick={() => setActivePane(pane.id)}
      className={`flex-1 min-w-0 h-full flex flex-col border-r border-darkBorder last:border-r-0 ${
        isActivePane ? 'ring-1 ring-primary/20 z-10' : 'opacity-85'
      }`}
    >
      {/* Tab Bar */}
      <div className="h-9 bg-darkPanel border-b border-darkBorder flex items-center justify-between px-2 overflow-x-auto scrollbar-none flex-shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          {pane.tabs.map((tab) => {
            const isTabActive = tab.id === pane.activeTabId;
            return (
              <div
                key={tab.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab(pane.id, tab.id);
                }}
                className={`group flex items-center gap-1.5 px-3 py-1 rounded-t border-t-2 text-xs font-medium cursor-pointer transition-colors max-w-[160px] truncate ${
                  isTabActive
                    ? 'bg-darkBg border-primary text-slate-100'
                    : 'border-transparent text-mutedText hover:bg-white/5 hover:text-slate-300'
                }`}
              >
                {tab.type === 'mindmap-global' ? (
                  <Network size={12} className="text-indigo-400 flex-shrink-0" />
                ) : (
                  <FileText size={12} className="text-slate-400 flex-shrink-0" />
                )}
                <span className="truncate">{tab.title}</span>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(pane.id, tab.id);
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/20 text-mutedText hover:text-slate-100 ml-auto transition-all"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Tab Bar actions: Split + Close Pane */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              splitPane(pane.id, 'horizontal');
            }}
            title="화면 좌우 분할"
            className="p-1.5 rounded text-mutedText hover:text-slate-200 hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <Columns size={13} />
          </button>

          {/* REF-20260810-01: 패널 닫기 버튼 — 패널이 2개 이상일 때만 노출 */}
          {canClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="이 패널 닫기 (탭은 옆 패널로 병합)"
              className="p-1.5 rounded text-mutedText hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Pane Content Viewer */}
      <div className="flex-1 min-h-0 relative overflow-y-auto">
        {!activeTab ? (
          <div className="h-full flex items-center justify-center text-xs text-mutedText/40 select-none">
            열린 문서가 없습니다.
          </div>
        ) : activeTab.type === 'mindmap-global' ? (
          <MindView isStandalone={true} />
        ) : (
          <BlockEditor />
        )}
      </div>
    </div>
  );
};