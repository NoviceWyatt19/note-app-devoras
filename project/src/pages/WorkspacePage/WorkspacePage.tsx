import React, { useState, useEffect } from 'react';
import { FileExplorer } from '@/widgets/FileExplorer';
import { BlockEditor } from '@/widgets/BlockEditor';
import { MindView } from '@/widgets/MindView';
import { ErdDesignerMainView } from '@/widgets/ErdDesigner/ui/ErdDesignerMainView';
import { useDocumentStore, SplitPane } from '@/entities/document/model/store';
import { TabDocumentProvider } from '@/entities/document/model/TabDocumentProvider';
import { useActiveTabStoreView } from '@/entities/document/model/useActiveTabStore';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import {
  LayoutPanelTop,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  FileText,
  Network,
  Columns,
  Settings,
} from 'lucide-react';
import { useSettingsStore } from '@/entities/settings/model/store';
import { SettingsModal } from '@/widgets/SettingsModal/ui/SettingsModal';
import { confirmDiscardIfDirty } from './lib/confirmClose';

export const WorkspacePage: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [mindViewWidth, setMindViewWidth] = useState(550);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingMindView, setIsResizingMindView] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMindViewOpen, setIsMindViewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    panes,
    openTab,
    saveFile,
    closePane,
    getCurrentFile,
    layoutDirection,
  } = useDocumentStore();
  // D-5(REF-20260831-01): 저장 버튼의 dirty 표시는 "활성 탭의" isDirty 여야
  // 한다 — 전역 useDocumentStore.isDirty 는 C-4 에서 사라진다. PaneContainer
  // 바깥(Context 밖)이므로 D-2 와 같은 레지스트리 기반 동적 해석을 쓴다.
  const { isDirty } = useActiveTabStoreView();

  const { openWorkspace } = useWorkspaceStore();
  const currentFile = getCurrentFile();

  const executeSave = async () => {
    setIsSaving(true);
    await saveFile();
    setTimeout(() => setIsSaving(false), 400); // 400ms 애니메이션 유지
  };

  // Cmd+S 저장 / Cmd+\ 사이드바 토글 / Cmd+O 워크스페이스 열기 / Cmd+W 탭 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      // 1. 저장 (Cmd+S)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        executeSave();
      }
      // 2. 탭 닫기 (Cmd+W)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const { panes, activePaneId, closeTab } = useDocumentStore.getState();
        const activePane = panes.find((p) => p.id === activePaneId);
        if (activePane && activePane.activeTabId) {
          const tab = activePane.tabs.find(t => t.id === activePane.activeTabId);
          confirmDiscardIfDirty(tab).then(canClose => {
            if (canClose) closeTab(activePane.id, activePane.activeTabId);
          });
        }
      }
      // 3. 사이드바 토글 (Cmd+\)
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
      // 4. 워크스페이스 열기 (Cmd+O)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openWorkspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile, openWorkspace]);

  // 최초 로드 시 한 번만 스캔 (이후 워크스페이스 변경은 openWorkspace가 직접 처리)
  useEffect(() => {
    const { workspacePath, files, scanWorkspace } = useWorkspaceStore.getState();
    if (workspacePath && files.length === 0) {
      scanWorkspace();
    }
  }, []);

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
    <div className="absolute inset-0 flex min-h-0 bg-darkBg text-strong">
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
              className="p-1 rounded text-mutedText hover:text-strong hover:bg-overlay/10 transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
            <span className="text-xs font-semibold text-body">Workspace</span>
          </div>

          <div className="flex items-center gap-2">
            {/* 독립 탭 마인드뷰 열기 버튼 */}
            <button
              onClick={() => openTab({ type: 'mindmap-global' })}
              title="독립 탭으로 마인드뷰 열기"
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded
                text-mutedText hover:text-strong hover:bg-overlay/10 transition-colors border border-darkBorder/40"
            >
              <Network size={12} className="text-accentSoft" />
              <span>독립 마인드맵</span>
            </button>

            {/* 우측 사이드 팝업 마인드뷰 열기 버튼 */}
            {!isMindViewOpen && (
              <button
                onClick={() => setIsMindViewOpen(true)}
                title="사이드 마인드뷰 패널 열기"
                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded
                  text-mutedText hover:text-strong hover:bg-overlay/10 transition-colors border border-darkBorder/40"
              >
                <LayoutPanelTop size={11} />
                <span>사이드 뷰</span>
              </button>
            )}

            <button
              onClick={() => useSettingsStore.getState().setIsOpen(true)}
              title="설정"
              className="p-1 rounded text-mutedText hover:text-strong hover:bg-overlay/10 transition-colors border border-transparent"
            >
              <Settings size={14} />
            </button>

            {currentFile && (
              <button
                onClick={executeSave}
                disabled={isSaving}
                className={`relative flex items-center justify-center text-[10px] px-3 py-1 rounded font-bold uppercase tracking-wider transition-all border overflow-hidden ${
                  isSaving 
                    ? 'bg-primary/20 border-primary/50 text-primary cursor-wait'
                    : isDirty
                    ? 'bg-primary/10 border-primary text-primary hover:bg-primary hover:text-title'
                    : 'border-darkBorder text-mutedText hover:bg-overlay/5 hover:text-strong'
                }`}
              >
                <span className={`transition-opacity duration-200 ${isSaving ? 'opacity-0' : 'opacity-100'}`}>
                  저장 (Cmd+S)
                </span>
                {isSaving && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Panes Area */}
        <div className={`flex-1 min-h-0 flex overflow-hidden ${layoutDirection === 'vertical' ? 'flex-col' : 'flex-row'}`}>
          {panes.map((pane) => (
            <PaneContainer
              key={pane.id}
              pane={pane}
              canClose={panes.length >= 2}
              onClose={() => closePane(pane.id)}
              layoutDirection={layoutDirection}
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
            className="flex-shrink-0 min-w-0 h-full bg-darkBg/60 border-l border-darkBorder relative"
          >
            <MindView onClose={() => setIsMindViewOpen(false)} isStandalone={false} />
          </div>
        </>
      )}
      {/* Global Settings Modal */}
      <SettingsModal />
    </div>
  );
};

// ── 패널 전용 렌더러 컴포넌트 ──────────────────────────────────────────
const PaneContainer: React.FC<{
  pane: SplitPane;
  canClose: boolean;
  onClose: () => void;
  layoutDirection: 'horizontal' | 'vertical';
}> = ({ pane, canClose, onClose, layoutDirection }) => {
  const { activePaneId, setActivePane, setActiveTab, closeTab, splitPane } = useDocumentStore();
  const isActivePane = pane.id === activePaneId;
  const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);

  const borderClass = layoutDirection === 'vertical' 
    ? 'border-b border-darkBorder last:border-b-0' 
    : 'border-r border-darkBorder last:border-r-0';

  return (
    <div
      onClick={() => setActivePane(pane.id)}
      className={`flex-1 min-w-0 h-full flex flex-col ${borderClass} ${
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
                    ? 'bg-darkBg border-primary text-title'
                    : 'border-transparent text-mutedText hover:bg-overlay/5 hover:text-body'
                }`}
              >
                {tab.type === 'mindmap-global' ? (
                  <Network size={12} className="text-accentSoft flex-shrink-0" />
                ) : (
                  <FileText size={12} className="text-mutedText flex-shrink-0" />
                )}
                <span className="truncate">{tab.title}</span>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                )}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const canClose = await confirmDiscardIfDirty(tab);
                    if (canClose) closeTab(pane.id, tab.id);
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-overlay/20 text-mutedText hover:text-title ml-auto transition-all"
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
            className="p-1.5 rounded text-mutedText hover:text-strong hover:bg-overlay/10 transition-colors flex-shrink-0"
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
              className="p-1.5 rounded text-mutedText hover:text-danger hover:bg-dangerBg/10 transition-colors flex-shrink-0"
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
        ) : (
          // C-3/C-4(REF-20260831-01): 이 탭이 활성인 동안의 rawContent/blocks/
          // nodes/isDirty/viewMode 를 담는 유일한 Provider — 세 분기(mindmap-global·
          // erd·markdown)가 전부 같은 탭 스토어 인스턴스를 공유한다. initialContent/
          // initialNodes 는 activeTab.cache 에서 읽는다 — openTab/_activateTabContent
          // 가 panes 전환을 커밋하는 바로 그 시점에 이미 cache 를 채워 뒀으므로
          // (캐시 적중이든 디스크 로드 완료 후든 동일하게), 여기선 전역 필드를
          // 거칠 필요 없이 activeTab 자체가 소스다.
          <TabDocumentProvider
            tabId={activeTab.id}
            // D13(PM-20260904-01 §r1_closeout, 도달 경로 미확인 — 방어적 배선) —
            // savedContent 는 store.ts:619 의 같은 패턴에서도 cache 다음 폴백으로
            // 쓰인다. 여기 없으면 cache 미스 시 곧장 '' 로 떨어져 저장된 내용이
            // 있어도 빈 문서로 열릴 여지가 생긴다 — 실제로 이 경로를 타는 경우를
            // 확인하지는 못했다.
            initialContent={activeTab.cache?.rawContent ?? activeTab.savedContent ?? ''}
            initialNodes={activeTab.cache?.nodes}
          >
            {activeTab.type === 'mindmap-global' ? (
              <MindView isStandalone={true} />
            ) : activeTab.type === 'erd' ? (
              <ErdDesignerMainView tab={activeTab} />
            ) : (
              <BlockEditor key={activeTab.id} paneId={pane.id} tab={activeTab} isActivePane={isActivePane} />
            )}
          </TabDocumentProvider>
        )}
      </div>
    </div>
  );
};