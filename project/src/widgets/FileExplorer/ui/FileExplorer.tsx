import React, { useState } from 'react';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { useBlockStore } from '@/entities/block/model/store';
import { FolderOpen, FileText, Plus, RefreshCw, Loader } from 'lucide-react';
import { fileSystemRepository } from '@/shared/api/fs';

export const FileExplorer: React.FC = () => {
  const { workspacePath, files, isLoading, openWorkspace, scanWorkspace } = useWorkspaceStore();
  const { currentFile, loadFile, isDirty } = useDocumentStore();
  const { setBlocksFromContent } = useBlockStore();

  const [newFileName, setNewFileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleFileSelect = async (file: any) => {
    if (file.isDir) return; // Directory recursion is out of scope for MVP simple list
    
    // Check for unsaved changes before loading a new document
    if (isDirty) {
      const confirmLeave = window.confirm('저장되지 않은 변경 사항이 있습니다. 무시하고 다른 파일을 여시겠습니까?');
      if (!confirmLeave) return;
    }

    await loadFile(file);
    
    // Load blocks in the editor store using document rawContent
    const freshContent = useDocumentStore.getState().rawContent;
    setBlocksFromContent(freshContent);
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim() || !workspacePath) return;

    let sanitizedName = newFileName.trim();
    if (!sanitizedName.endsWith('.md')) {
      sanitizedName += '.md';
    }

    const fullPath = `${workspacePath}/${sanitizedName}`;
    const initialContent = `# ${sanitizedName.replace('.md', '')}\n\n첫 번째 문장을 입력하세요.`;

    try {
      await fileSystemRepository.writeFile(fullPath, initialContent);
      setNewFileName('');
      setIsCreating(false);
      await scanWorkspace();

      // Automatically load the newly created file
      const freshFile = {
        name: sanitizedName,
        path: fullPath,
        isDir: false,
      };
      await loadFile(freshFile);
      setBlocksFromContent(initialContent);
    } catch (e) {
      console.error('Failed to create file:', e);
      alert('파일 생성 중 에러가 발생했습니다.');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {/* Sidebar Header — left padding clears the macOS traffic light buttons (~78px).
           data-tauri-drag-region makes this bar act as the window drag handle. */}
      <div
        data-tauri-drag-region
        className="h-10 border-b border-darkBorder flex items-center justify-between pl-20 pr-4 flex-shrink-0 bg-darkPanel"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-mutedText">워크스페이스</span>
        {workspacePath && (
          <button
            onClick={scanWorkspace}
            disabled={isLoading}
            className="p-1 hover:bg-darkBorder rounded text-mutedText hover:text-slate-100 transition-colors"
            title="새로고침"
          >
            {isLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Explorer Content */}
      <div className="flex-1 overflow-y-auto p-3">
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
          <div className="space-y-4">
            {/* Folder Path Banner */}
            <div className="bg-darkBg/60 border border-darkBorder/40 rounded p-2 text-[10px] text-mutedText truncate font-mono" title={workspacePath}>
              {workspacePath}
            </div>

            {/* Create File Form */}
            {isCreating ? (
              <form onSubmit={handleCreateFile} className="space-y-2">
                <input
                  type="text"
                  placeholder="새 파일명 (예: 노트)"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full bg-darkBg border border-darkBorder focus:border-primary rounded px-2.5 py-1.5 text-xs text-slate-100 outline-none transition-colors"
                  autoFocus
                />
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-white text-xs py-1 rounded font-semibold hover:bg-primary/90 transition-colors"
                  >
                    생성
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 bg-darkBorder text-mutedText text-xs py-1 rounded font-semibold hover:bg-darkBorder/80 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center space-x-1 border border-dashed border-darkBorder hover:border-primary/40 hover:bg-primary/5 rounded py-1.5 text-xs text-mutedText hover:text-primary transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>새 문서 만들기</span>
              </button>
            )}

            {/* File List */}
            <div className="space-y-1">
              {files.length === 0 ? (
                <div className="text-center py-6 text-xs text-mutedText/50">마크다운 파일이 없습니다.</div>
              ) : (
                files.map((file) => {
                  const isSelected = currentFile?.path === file.path;
                  return (
                    <button
                      key={file.path}
                      onClick={() => handleFileSelect(file)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded text-left text-xs transition-all ${
                        isSelected
                          ? 'bg-primary/10 text-primary border-l-2 border-primary font-medium'
                          : 'hover:bg-darkBorder/40 text-slate-300 hover:text-slate-100'
                      }`}
                    >
                      {file.isDir ? (
                        <FolderOpen className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      ) : (
                        <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-slate-400'}`} />
                      )}
                      <span className="truncate flex-1">{file.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
