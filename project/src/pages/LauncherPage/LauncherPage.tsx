import { useMemo } from 'react';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useRecentWorkspaceStore } from '@/entities/workspace/model/recentStore';
import { FolderOpen, Pin, PinOff, X } from 'lucide-react';

export function LauncherPage() {
  const { openWorkspace, openWorkspaceByPath } = useWorkspaceStore();
  const { recentList, togglePin, removeRecent, addRecent } = useRecentWorkspaceStore();

  const handleOpenFolder = async () => {
    await openWorkspace();
    const currentPath = useWorkspaceStore.getState().workspacePath;
    if (currentPath) {
      addRecent(currentPath);
    }
  };

  const handleOpenRecent = async (path: string) => {
    try {
      await openWorkspaceByPath(path);
      addRecent(path);
    } catch {
      if (confirm('이 폴더를 찾을 수 없습니다. 목록에서 제거하시겠습니까?')) {
        removeRecent(path);
      }
    }
  };

  // 핀 고정된 항목 우선 정렬, 그다음 최신 순
  const sortedList = useMemo(() => {
    return [...recentList].sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        return b.lastOpened - a.lastOpened;
      }
      return a.isPinned ? -1 : 1;
    });
  }, [recentList]);

  return (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-darkBg text-slate-200">
      <div className="flex flex-col items-center max-w-xl w-full">
        {/* Header Logo */}
        <div className="mb-12 text-center select-none cursor-default" data-tauri-drag-region>
          <h1 className="text-4xl font-bold tracking-widest text-primary mb-3">DEVORAS</h1>
          <p className="text-mutedText">텍스트와 마인드맵의 실시간 단방향 투영 캔버스</p>
        </div>

        {/* Big Open Button */}
        <button
          onClick={handleOpenFolder}
          className="group flex items-center space-x-4 bg-darkPanel border border-darkBorder hover:border-primary px-8 py-5 rounded-xl transition-all mb-10 w-full justify-center text-lg font-medium shadow-lg hover:shadow-primary/20"
        >
          <FolderOpen size={24} className="text-primary group-hover:scale-110 transition-transform" />
          <span>워크스페이스 열기</span>
        </button>

        {/* Recent Workspaces */}
        <div className="w-full text-left">
          <h2 className="text-sm font-semibold text-mutedText uppercase tracking-wider mb-4 px-2">
            최근 사용한 워크스페이스
          </h2>

          <div className="flex flex-col space-y-1">
            {sortedList.length === 0 ? (
              <div className="text-center py-8 text-mutedText/70 text-sm border border-dashed border-darkBorder rounded-lg">
                최근 열어본 워크스페이스가 없습니다.
              </div>
            ) : (
              sortedList.map((item) => (
                <div
                  key={item.path}
                  className="group flex items-center justify-between p-3 rounded-lg hover:bg-darkPanel/50 border border-transparent hover:border-darkBorder transition-colors cursor-pointer"
                  onClick={() => handleOpenRecent(item.path)}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="flex-shrink-0 text-mutedText group-hover:text-primary transition-colors">
                      <FolderOpen size={18} />
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="font-medium text-slate-300 truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-mutedText truncate" title={item.path}>
                        {item.path}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(item.path);
                      }}
                      className={`p-1.5 rounded hover:bg-darkBg transition-colors ${
                        item.isPinned ? 'text-primary' : 'text-mutedText hover:text-slate-300'
                      }`}
                      title={item.isPinned ? "고정 해제" : "목록에 고정"}
                    >
                      {item.isPinned ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecent(item.path);
                      }}
                      className="p-1.5 rounded text-mutedText hover:text-red-400 hover:bg-darkBg transition-colors"
                      title="목록에서 제거"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
