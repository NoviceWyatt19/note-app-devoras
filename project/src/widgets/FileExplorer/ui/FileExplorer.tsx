import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { useBlockStore } from '@/entities/block/model/store';
import { FolderOpen, FileText, Plus, RefreshCw, Loader, ChevronRight, ChevronDown, File, Trash, Edit2, FolderPlus, Database } from 'lucide-react';
import { FileEntry } from '@/shared/api/fs';

interface ContextMenuData {
  x: number;
  y: number;
  entry: FileEntry | null; // null if clicked on empty space (root)
}

type CreatingNode = {
  parentPath: string;
  isDir: boolean;
  isErd?: boolean;
} | null;

interface TreeNodeProps {
  entry: FileEntry;
  depth: number;
  expandedFolders: Set<string>;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (val: string) => void;
  currentFilePath?: string;
  handleFileSelect: (entry: FileEntry) => void;
  handleContextMenu: (e: React.MouseEvent, entry: FileEntry | null) => void;
  handleRenameSubmit: (oldPath: string, newName: string) => void;
  setRenamingPath: (path: string | null) => void;
  
  creatingNode: CreatingNode;
  createValue: string;
  setCreateValue: (val: string) => void;
  handleCreateSubmit: () => void;
  setCreatingNode: (val: CreatingNode) => void;

  handlePointerDown: (e: React.PointerEvent, entry: FileEntry) => void;
  handlePointerEnter: (e: React.PointerEvent, entry: FileEntry | null) => void;
  handlePointerUp: (e: React.PointerEvent, entry: FileEntry | null) => void;
  dragOverPath: string | null;
}

const TreeNode: React.FC<TreeNodeProps> = (props) => {
  const { 
    entry, depth, expandedFolders, renamingPath, renameValue, setRenameValue, 
    currentFilePath, handleFileSelect, handleContextMenu, handleRenameSubmit, 
    setRenamingPath, creatingNode, createValue, setCreateValue, handleCreateSubmit, 
    setCreatingNode, handlePointerDown, handlePointerEnter, handlePointerUp, dragOverPath 
  } = props;

  const isExpanded = expandedFolders.has(entry.path);
  const isRenaming = renamingPath === entry.path;
  const isSupported = entry.isDir || entry.name.endsWith('.md') || entry.name.endsWith('.erd');
  const isSelected = currentFilePath === entry.path;
  const isCreatingHere = creatingNode?.parentPath === entry.path;
  const isDragOver = dragOverPath === entry.path;

  return (
    <div className="w-full">
      <div
        onPointerDown={(e) => handlePointerDown(e, entry)}
        onPointerEnter={(e) => handlePointerEnter(e, entry)}
        onPointerUp={(e) => handlePointerUp(e, entry)}
        onClick={() => { if (isSupported) handleFileSelect(entry); }}
        onContextMenu={(e) => { if (isSupported) handleContextMenu(e, entry); }}
        className={`group flex items-center space-x-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
          !isSupported 
            ? 'text-slate-500 opacity-60 cursor-default'
            : isDragOver 
              ? 'bg-primary/20 text-primary border-l-2 border-primary cursor-pointer'
              : isSelected
                ? 'bg-primary/15 text-primary font-medium border-l-2 border-primary cursor-pointer'
                : 'hover:bg-darkBorder/40 text-slate-300 hover:text-slate-100 border-l-2 border-transparent cursor-pointer'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <div className="flex-shrink-0 flex items-center justify-center w-4 h-4 pointer-events-none">
          {entry.isDir ? (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          ) : (
            !isSupported
              ? <File className="w-3.5 h-3.5 text-slate-500" />
              : entry.name.endsWith('.erd') 
                ? <Database className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-slate-400'}`} />
                : <FileText className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-slate-400'}`} />
          )}
        </div>

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
            onDragStart={(e) => e.preventDefault()} // prevent dragging input
          />
        ) : (
          <span className="truncate flex-1 select-none pointer-events-none">{entry.name}</span>
        )}
      </div>

      {entry.isDir && isExpanded && (
        <div className="flex flex-col">
          {isCreatingHere && (
            <div className="flex items-center space-x-1.5 px-2 py-1.5" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
              <div className="flex-shrink-0 flex items-center justify-center w-4 h-4">
                {creatingNode.isDir ? <FolderOpen className="w-3.5 h-3.5 text-slate-500" /> : (creatingNode.isErd ? <Database className="w-3.5 h-3.5 text-slate-400" /> : <FileText className="w-3.5 h-3.5 text-slate-400" />)}
              </div>
              <input
                autoFocus
                className="flex-1 bg-darkBg border border-primary px-1 rounded text-slate-100 outline-none text-xs min-w-0"
                value={createValue}
                placeholder={creatingNode.isDir ? "새 폴더명..." : (creatingNode.isErd ? "새 ERD 문서명..." : "새 파일명...")}
                onChange={(e) => setCreateValue(e.target.value)}
                onBlur={handleCreateSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                  if (e.key === 'Escape') setCreatingNode(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {entry.children?.map((child) => (
            <TreeNode key={child.path} {...props} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileExplorer: React.FC = () => {
  const { workspacePath, files, isLoading, openWorkspace, scanWorkspace, createFile, createFolder, renameEntry, deleteEntry, moveEntry, copyEntry } = useWorkspaceStore();
  const { getCurrentFile, loadFile, isDirty } = useDocumentStore();
  const currentFile = getCurrentFile();
  const { setBlocksFromContent } = useBlockStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingNode, setCreatingNode] = useState<CreatingNode>(null);
  const [createValue, setCreateValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // Drag and Drop state
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const draggedPathRef = React.useRef<string | null>(null);

  // Clipboard state for Cmd+C / Cmd+V
  const [clipboardPath, setClipboardPath] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      draggedPathRef.current = null;
      setDragOverPath(null);
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, []);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Cmd+C / Cmd+V clipboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'c' && currentFile && !currentFile.isDir) {
        setClipboardPath(currentFile.path);
      }
      if (e.key === 'v' && clipboardPath && workspacePath) {
        e.preventDefault();
        // Paste into the directory of the currently open file, or workspace root
        const destDir = currentFile
          ? (currentFile.isDir ? currentFile.path : currentFile.path.substring(0, currentFile.path.lastIndexOf('/')))
          : workspacePath;
        copyEntry(clipboardPath, destDir);
      }
    };
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [clipboardPath, currentFile, workspacePath, copyEntry]);

  const handleFileSelect = async (file: FileEntry) => {
    containerRef.current?.focus();
    if (file.isDir) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        if (next.has(file.path)) next.delete(file.path);
        else next.add(file.path);
        return next;
      });
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

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.pageX, y: e.pageY, entry });
  };

  const handleCreateNew = async (type: 'file' | 'folder' | 'erd') => {
    if (!workspacePath) return;
    const parentPath = contextMenu?.entry?.isDir 
      ? contextMenu.entry.path 
      : (contextMenu?.entry ? contextMenu.entry.path.substring(0, contextMenu.entry.path.lastIndexOf('/')) : workspacePath);
    
    setCreatingNode({ parentPath, isDir: type === 'folder', isErd: type === 'erd' });
    setCreateValue('');
    setContextMenu(null);
    
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.add(parentPath);
      return next;
    });
  };

  const handleCreateSubmit = async () => {
    if (!creatingNode || !createValue.trim()) {
      setCreatingNode(null);
      return;
    }
    const { parentPath, isDir, isErd } = creatingNode;
    try {
      if (isDir) {
        await createFolder(parentPath, createValue);
      } else {
        let finalName = createValue.trim();
        if (isErd && !finalName.endsWith('.erd')) {
          finalName += '.erd';
        }
        await createFile(parentPath, finalName);
      }
    } catch (e) {
      alert('생성 실패');
    }
    setCreatingNode(null);
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

  // --- Pointer-based Drag and Drop Handlers ---
  const handlePointerDown = (e: React.PointerEvent, entry: FileEntry) => {
    if (e.button !== 0) return; // Only left click
    e.stopPropagation();
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch(err) {}
    draggedPathRef.current = entry.path;
  };

  const handlePointerEnter = (e: React.PointerEvent, entry: FileEntry | null) => {
    if (!draggedPathRef.current) return;
    e.stopPropagation();
    
    // Only highlight if dropping on a directory or root
    const targetPath = entry?.isDir ? entry.path : (entry ? entry.path.substring(0, entry.path.lastIndexOf('/')) : workspacePath);
    const draggedPath = draggedPathRef.current;

    // Prevent dropping a folder into itself or its own subdirectories
    if (targetPath && (targetPath === draggedPath || targetPath.startsWith(draggedPath + '/'))) {
      if (dragOverPath !== null) setDragOverPath(null);
      return;
    }

    if (targetPath && targetPath !== dragOverPath) {
      setDragOverPath(targetPath);
    }
  };

  const handlePointerUp = async (e: React.PointerEvent, targetEntry: FileEntry | null) => {
    e.stopPropagation();
    const oldPath = draggedPathRef.current;
    draggedPathRef.current = null;
    setDragOverPath(null);

    if (!oldPath || !workspacePath) return;

    // Determine the actual destination directory directly from the drop target
    const targetDirPath = targetEntry?.isDir
      ? targetEntry.path
      : (targetEntry
          ? targetEntry.path.substring(0, targetEntry.path.lastIndexOf('/'))
          : workspacePath);
    
    // Prevent dropping into the same directory or itself
    if (oldPath === targetDirPath || targetDirPath.startsWith(oldPath + '/')) {
        return;
    }

    const currentName = oldPath.split('/').pop();
    if (oldPath === `${targetDirPath}/${currentName}`) {
        return;
    }

    await moveEntry(oldPath, targetDirPath);
  };

  const isCreatingInRoot = creatingNode?.parentPath === workspacePath;

  return (
    <div 
      ref={containerRef}
      tabIndex={-1}
      className="flex-1 flex flex-col min-h-0 select-none relative outline-none" 
      onContextMenu={(e) => handleContextMenu(e, null)}
      onPointerEnter={(e) => handlePointerEnter(e, null)}
      onPointerUp={(e) => handlePointerUp(e, null)}
    >
      <div
        data-tauri-drag-region
        className="h-10 border-b border-darkBorder flex items-center justify-between pl-20 pr-4 flex-shrink-0 bg-darkPanel"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-mutedText">워크스페이스</span>
        <div className="flex items-center space-x-1">
          {workspacePath && (
            <>
              <button
                onClick={() => { setContextMenu(null); openWorkspace(); }}
                className="p-1 hover:bg-darkBorder rounded text-mutedText hover:text-slate-100 transition-colors"
                title="워크스페이스 열기"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setContextMenu(null); handleCreateNew('file'); }}
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

      <div className={`flex-1 overflow-y-auto p-2 transition-colors ${dragOverPath === workspacePath ? 'bg-primary/5' : ''}`}>
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
          <div className="flex flex-col space-y-0.5 min-h-full">
            {isCreatingInRoot && (
              <div className="flex items-center space-x-1.5 px-2 py-1.5 pl-2">
                <div className="flex-shrink-0 flex items-center justify-center w-4 h-4">
                  {creatingNode.isDir ? <FolderOpen className="w-3.5 h-3.5 text-slate-500" /> : (creatingNode.isErd ? <Database className="w-3.5 h-3.5 text-slate-400" /> : <FileText className="w-3.5 h-3.5 text-slate-400" />)}
                </div>
                <input
                  autoFocus
                  className="flex-1 bg-darkBg border border-primary px-1 rounded text-slate-100 outline-none text-xs min-w-0"
                  value={createValue}
                  placeholder={creatingNode.isDir ? "새 폴더명..." : (creatingNode.isErd ? "새 ERD 문서명..." : "새 파일명...")}
                  onChange={(e) => setCreateValue(e.target.value)}
                  onBlur={handleCreateSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSubmit();
                    if (e.key === 'Escape') setCreatingNode(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            {files.length === 0 && !isCreatingInRoot ? (
              <div className="text-center py-6 text-xs text-mutedText/50 pointer-events-none">항목이 없습니다. 파일이나 폴더를 여기에 놓으세요.</div>
            ) : (
              files.map((file) => (
                <TreeNode 
                  key={file.path} 
                  entry={file} 
                  depth={0} 
                  expandedFolders={expandedFolders}
                  renamingPath={renamingPath}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  currentFilePath={currentFile?.path}
                  handleFileSelect={handleFileSelect}
                  handleContextMenu={handleContextMenu}
                  handleRenameSubmit={handleRenameSubmit}
                  setRenamingPath={setRenamingPath}
                  creatingNode={creatingNode}
                  createValue={createValue}
                  setCreateValue={setCreateValue}
                  handleCreateSubmit={handleCreateSubmit}
                  setCreatingNode={setCreatingNode}
                  handlePointerDown={handlePointerDown}
                  handlePointerEnter={handlePointerEnter}
                  handlePointerUp={handlePointerUp}
                  dragOverPath={dragOverPath}
                />
              ))
            )}
          </div>
        )}
      </div>

      {contextMenu && workspacePath && (
        <div
          className="fixed bg-darkPanel border border-darkBorder rounded-md shadow-xl py-1 z-50 flex flex-col min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()} 
        >
          {(!contextMenu.entry || contextMenu.entry.isDir) && (
            <>
              <button 
                className="flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-primary/20 hover:text-primary transition-colors text-left"
                onClick={() => handleCreateNew('file')}
              >
                <File className="w-3.5 h-3.5" /> <span>새 문서</span>
              </button>
              <button 
                className="flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-primary/20 hover:text-primary transition-colors text-left"
                onClick={() => handleCreateNew('erd')}
              >
                <Database className="w-3.5 h-3.5" /> <span>새 ERD 문서</span>
              </button>
              <button 
                className="flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-primary/20 hover:text-primary transition-colors text-left"
                onClick={() => handleCreateNew('folder')}
              >
                <FolderPlus className="w-3.5 h-3.5" /> <span>새 폴더</span>
              </button>
            </>
          )}
          
          {contextMenu.entry && (
            <>
              {contextMenu.entry.isDir && <div className="h-px bg-darkBorder my-1 mx-2" />}
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
