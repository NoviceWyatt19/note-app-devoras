import React, { useState, useEffect } from 'react';
import { FileExplorer } from '@/widgets/FileExplorer';
import { BlockEditor } from '@/widgets/BlockEditor';
import { MindView } from '@/widgets/MindView';
import { useDocumentStore } from '@/entities/document/model/store';

export const WorkspacePage: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [mindViewWidth, setMindViewWidth] = useState(550);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingMindView, setIsResizingMindView] = useState(false);

  const { isDirty, saveFile, currentFile } = useDocumentStore();

  // Handle document saving shortcut (Cmd+S / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  // Sidebar drag resizing handlers
  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(400, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  // MindView drag resizing handlers
  useEffect(() => {
    if (!isResizingMindView) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(300, Math.min(window.innerWidth - 450, window.innerWidth - e.clientX));
      setMindViewWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingMindView(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingMindView]);

  return (
    <div className="absolute inset-0 flex min-h-0 bg-darkBg text-slate-200">
      {/* 1. Left Sidebar: File Explorer */}
      <div style={{ width: `${sidebarWidth}px` }} className="flex-shrink-0 min-w-0 h-full flex flex-col bg-darkPanel border-r border-darkBorder">
        <FileExplorer />
      </div>

      {/* Sidebar Resizer */}
      <div
        className={`w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary transition-colors flex-shrink-0 h-full ${
          isResizingSidebar ? 'bg-primary' : ''
        }`}
        onMouseDown={() => setIsResizingSidebar(true)}
      />

      {/* 2. Center: Block Editor */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-darkBg relative">
        {/* Editor Title Bar */}
        <div className="h-10 border-b border-darkBorder flex items-center justify-between px-6 flex-shrink-0">
          <div className="text-xs font-semibold text-slate-300 truncate max-w-sm">
            {currentFile ? currentFile.name : '문서가 열리지 않음'}
            {isDirty && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="저장되지 않음"></span>}
          </div>
          {currentFile && (
            <button
              onClick={saveFile}
              disabled={!isDirty}
              className={`text-[10px] px-2.5 py-1 rounded font-bold uppercase tracking-wider transition-all border ${
                isDirty
                  ? 'bg-primary/10 border-primary text-primary hover:bg-primary hover:text-white'
                  : 'border-darkBorder text-mutedText/40 cursor-default'
              }`}
            >
              저장 (Cmd+S)
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <BlockEditor />
        </div>
      </div>

      {/* MindView Resizer */}
      <div
        className={`w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary transition-colors flex-shrink-0 h-full ${
          isResizingMindView ? 'bg-primary' : ''
        }`}
        onMouseDown={() => setIsResizingMindView(true)}
      />

      {/* 3. Right: Mind Map Canvas */}
      <div style={{ width: `${mindViewWidth}px` }} className="flex-shrink-0 min-w-0 h-full bg-[#111216]/60 border-l border-darkBorder relative">
        <MindView />
      </div>
    </div>
  );
};
