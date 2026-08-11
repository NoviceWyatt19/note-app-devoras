import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { useBlockStore } from '@/entities/block/model/store';
import { FolderOpen, FileText, Plus, RefreshCw, Loader, ChevronRight, ChevronDown, File, Trash, Edit2, FolderPlus } from 'lucide-react';
import { FileEntry } from '@/shared/api/fs';

interface ContextMenuData {
  x: number;
  y: number;
  entry: FileEntry | null; // null if clicked on empty space (root)
}

export const FileExplorer: React.FC = () => {
  const { workspacePath, files, isLoading, openWorkspace, scanWorkspace, createFile, createFolder, renameEntry, deleteEntry } = useWorkspaceStore();
  const { getCurrentFile, loadFile, isDirty } = useDocumentStore();
  const currentFile = getCurrentFile();
  const { setBlocksFromContent } = useBlockStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // --- Global Click to close Context Menu ---
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // --- Handlers ---
  const handleFileSelect = async (file: FileEntry) => {
    if (file.isDir) {
      toggleExpand(file.path);
      return;
    }
    
    if (isDirty && currentFile?.path !== file.path) {
      const confirmLeave = window.confirm('저장되지 않은 변경 사항이 있습니다. 무시하고 다른 파일을 여시겠습니까?');
      if (!confirmLeave) return;
    }

    await loadFile(file);

    const freshContent = useDocumentStore.getState().rawContent;
    setBlocksFromContent(freshContent);
    const firstBlockOnLoad = useBlockStore.getState().blocks[0];
    if (firstBlockOnLoad) useBlockStore.getState().focusBlock(firstBlockOnLoad.id, 0);
  };

  const toggleExpand = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.pageX, y: e.pageY, entry });
  };

  // --- CRUD Actions ---
  const handleCreateNew = async (isFolder: boolean) => {
    if (!workspacePath) return;
    const parentPath = contextMenu?.entry?.isDir 
      ? contextMenu.entry.path 
      : (contextMenu?.entry ? contextMenu.entry.path.substring(0, contextMenu.entry.path.lastIndexOf('/')) : workspacePath);
    
    const name = prompt(isFolder ? '새 폴더 이름:' : '새 파일 이름 (예: 노트):');
    if (!name) return;

    if (isFolder) {
      await createFolder(parentPath, name);
    } else {
      await createFile(parentPath, name);
    }
    
    // Ensure parent is expanded
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.add(parentPath);
      return next;
    });
  };

  const handleRenameSubmit = async (oldPath: string, newName: string) => {
    if (!newName.trim() || newName === renamingPath?.split('/').pop()) {
      setRenamingPath(null);
      return;
    }
    const newPath = oldPath.substring(0, oldPath.lastIndexOf('/')) + '/' + newName;
    try {
      await renameEntry(oldPath, newPath, newName);
    } catch (e) {
      alert('이름 변경 실패');
    }
    setRenamingPath(null);
  };

  const handleDelete = async (entry: FileEntry) => {
    if (window.confirm(`'${entry.name}' 항목을 정말 삭제하시겠습니까?`)) {
      try {
        await deleteEntry(entry.path, entry.isDir);
      } catch (e) {
        alert('삭제 실패');
      }
    }
  };

  // --- Recursive Tree Node Component ---
  const TreeNode: React.FC<{ entry: FileEntry; depth: number }> = ({ entry, depth }) => {
    const isExpanded = expandedFolders.has(entry.path);
    const isRenaming = renamingPath === entry.path;
    const isSelected = currentFile?.path === entry.path;

    return (
      <div className="w-full">
        <div
          onClick={() => handleFileSelect(entry)}
          onContextMenu={(e) => handleContextMenu(e, entry)}
          className={`group flex items-center space-x-1.5 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
            isSelected
              ? 'bg-primary/15 text-primary font-medium border-l-2 border-primary'
              : 'hover:bg-darkBorder/40 text-slate-300 hover:text-slate-100 border-l-2 border-transparent'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {/* Icon / Chevron */}
          <div className="flex-shrink-0 flex items-center justify-center w-4 h-4">
            {entry.isDir ? (
              isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <FileText className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-slate-400'}`} />
            )}
          </div>

          {/* Name / Input */}
          {isRenaming ? (
            <input
              autoFocus
              className="flex-1 bg-darkBg border border-primary px-1 rounded text-slate-100 outline-none text-xs min-w-0"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(entry.path, renameValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit(entry.path, renameValue);
                if (e.key === 'Escape') setRenamingPath(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1 select-none">{entry.name}</span>
          )}
        </div>

        {/* Children */}
        {entry.isDir && isExpanded && entry.children && (
          <div className="flex flex-col">
            {entry.children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none relative" onContextMenu={(e) => handleContextMenu(e, null)}>
      {/* Sidebar Header */}
      <div
        data-tauri-drag-region
        className="h-10 border-b border-darkBorder flex items-center justify-between pl-20 pr-4 flex-shrink-0 bg-darkPanel"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-mutedText">워크스페이스</span>
        <div className="flex items-center space-x-1">
          {workspacePath && (
            <>
              <button
                onClick={() => handleCreateNew(false)}
                className="p-1 hover:bg-darkBorder rounded text-mutedText hover:text-slate-100 transition-colors"
                title="새 파일"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={scanWorkspace}
                disabled={isLoading}
                className="p-1 hover:bg-darkBorder rounded text-mutedText hover:text-slate-100 transition-colors"
                title="새로고침"
              >
                {isLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Explorer Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {!workspacePath ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <FolderOpen className="w-8 h-8 text-indigo-500/60 mb-3" />
            <p className="text-xs text-mutedText mb-4 leading-relaxed">
              작성할 마크다운 문서가 모여있는 로컬 폴더를 열어주세요.
            </p>
            <button
              onClick={openWorkspace}
              className="w-full flex items-center justify-center space-x-2 text-xs bg-primary hover:bg-primary/95 text-white font-semibold py-2 px-3 rounded transition-all shadow-md shadow-indigo-600/10"
            >
              <FolderOpen className="w-4 h-4" />
              <span>폴더 선택하기</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col space-y-0.5">
            {files.length === 0 ? (
              <div className="text-center py-6 text-xs text-mutedText/50">항목이 없습니다.</div>
            ) : (
              files.map((file) => <TreeNode key={file.path} entry={file} depth={0} />)
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && workspacePath && (
        <div
          className="fixed bg-darkPanel border border-darkBorder rounded-md shadow-xl py-1 z-50 flex flex-col min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()} // prevent immediate close
        >
          <button 
            className="flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-primary/20 hover:text-primary transition-colors text-left"
            onClick={() => { setContextMenu(null); handleCreateNew(false); }}
          >
            <File className="w-3.5 h-3.5" /> <span>새 문서</span>
          </button>
          <button 
            className="flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-primary/20 hover:text-primary transition-colors text-left"
            onClick={() => { setContextMenu(null); handleCreateNew(true); }}
          >
            <FolderPlus className="w-3.5 h-3.5" /> <span>새 폴더</span>
          </button>
          
          {contextMenu.entry && (
            <>
              <div className="h-px bg-darkBorder my-1 mx-2" />
              <button 
                className="flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-primary/20 hover:text-primary transition-colors text-left"
                onClick={() => {
                  setRenamingPath(contextMenu.entry!.path);
                  setRenameValue(contextMenu.entry!.name);
                  setContextMenu(null);
                }}
              >
                <Edit2 className="w-3.5 h-3.5" /> <span>이름 변경</span>
              </button>
              <button 
                className="flex items-center space-x-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors text-left"
                onClick={() => {
                  handleDelete(contextMenu.entry!);
                  setContextMenu(null);
                }}
              >
                <Trash className="w-3.5 h-3.5" /> <span>삭제</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
