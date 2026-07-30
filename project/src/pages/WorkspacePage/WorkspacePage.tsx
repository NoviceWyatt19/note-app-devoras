import React, { useState, useEffect } from 'react';
import { FileExplorer } from '@/widgets/FileExplorer';
import { BlockEditor } from '@/widgets/BlockEditor';
import { MindView } from '@/widgets/MindView';
import { useDocumentStore } from '@/entities/document/model/store';
// 1. PanelLeftIcon (또는 SidebarIcon) 등의 Lucide 아이콘 추가 import
import { LayoutPanelTop, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export const WorkspacePage: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [mindViewWidth, setMindViewWidth] = useState(550);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingMindView, setIsResizingMindView] = useState(false);

  // [추가 1] 사이드바 토글 상태 관리
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  /** Whether the right MindView panel is visible */
  const [isMindViewOpen, setIsMindViewOpen] = useState(true);

  const { isDirty, saveFile, currentFile } = useDocumentStore();

  // [추가 2] Cmd+\ (Ctrl+\) 키보드 단축키로 사이드바 토글 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd + S 저장 단축키
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
      // Cmd + \ (또는 Ctrl + \) 사이드바 토글 단축키
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  // Sidebar drag-resize
  useEffect(() => {
    if (!isResizingSidebar) return;
    const onMove = (e: MouseEvent) => setSidebarWidth(Math.max(180, Math.min(400, e.clientX)));
    const onUp = () => setIsResizingSidebar(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizingSidebar]);

  // MindView drag-resize (only active while panel is open)
  useEffect(() => {
    if (!isResizingMindView) return;
    const onMove = (e: MouseEvent) => {
      setMindViewWidth(Math.max(300, Math.min(window.innerWidth - 450, window.innerWidth - e.clientX)));
    };
    const onUp = () => setIsResizingMindView(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizingMindView]);

  return (
    <div className="absolute inset-0 flex min-h-0 bg-darkBg text-slate-200">

      {/* [추가 3] isSidebarOpen이 true일 때만 사이드바 렌더링 (애니메이션이 필요하면 CSS 너비 조절 사용 가능) */}
      {isSidebarOpen && (
        <>
          {/* 1. Left Sidebar: File Explorer */}
          <div
            style={{ width: `${sidebarWidth}px` }}
            className="flex-shrink-0 min-w-0 h-full flex flex-col bg-darkPanel border-r border-darkBorder transition-all"
          >
            <FileExplorer />
          </div>

          {/* Sidebar resizer */}
          <div
            className={`w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary transition-colors flex-shrink-0 h-full ${
              isResizingSidebar ? 'bg-primary' : ''
            }`}
            onMouseDown={() => setIsResizingSidebar(true)}
          />
        </>
      )}

      {/* 2. Center: Block Editor */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-darkBg relative">

        {/* Editor title bar (also Tauri drag region) */}
        <div
          data-tauri-drag-region
          className="h-10 border-b border-darkBorder flex items-center justify-between px-4 flex-shrink-0"
        >
          {/* Left side: Sidebar Toggle Button + File name */}
          <div className="flex items-center gap-2 truncate max-w-sm">
            {/* [추가 4] 사이드바 열기/닫기 토글 버튼 */}
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              title={isSidebarOpen ? "사이드바 닫기 (Cmd+\\)" : "사이드바 열기 (Cmd+\\)"}
              className="p-1 rounded text-mutedText hover:text-slate-200 hover:bg-white/10 transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>

            <span className="text-xs font-semibold text-slate-300 truncate">
              {currentFile ? currentFile.name : '문서가 열리지 않음'}
            </span>
            {isDirty && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"
                title="저장되지 않음"
              />
            )}
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-2">
            {!isMindViewOpen && (
              <button
                onClick={() => setIsMindViewOpen(true)}
                title="마인드 뷰 열기"
                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded
                  text-mutedText hover:text-slate-200 hover:bg-white/10
                  transition-colors border border-transparent hover:border-darkBorder/60"
              >
                <LayoutPanelTop size={11} />
                <span>마인드 뷰</span>
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

        {/* Editor content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <BlockEditor />
        </div>
      </div>

      {/* MindView resizer + panel — only rendered when open */}
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
            <MindView onClose={() => setIsMindViewOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
};