import { useState } from 'react';
import { useSettingsStore } from '@/entities/settings/model/store';
import { X, Monitor, FileText, Settings, Database } from 'lucide-react';

type Tab = 'editor' | 'mindmap' | 'general';

export function SettingsModal() {
  const { isOpen, setIsOpen, settings, updateEditor, updateMindmap, updateGeneral, resetToDefaults } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<Tab>('editor');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 backdrop-blur-sm">
      <div className="bg-darkBg border border-darkBorder rounded-xl shadow-2xl w-[600px] h-[500px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-darkBorder bg-darkPanel select-none">
          <div className="flex items-center space-x-2">
            <Settings size={18} className="text-primary" />
            <h2 className="font-semibold text-strong">설정</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded text-mutedText hover:text-strong hover:bg-darkBg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-40 border-r border-darkBorder bg-darkPanel p-2 flex flex-col space-y-1 select-none">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                activeTab === 'editor' ? 'bg-primary/20 text-primary' : 'text-mutedText hover:bg-darkBg hover:text-strong'
              }`}
            >
              <FileText size={16} />
              <span>에디터</span>
            </button>
            <button
              onClick={() => setActiveTab('mindmap')}
              className={`flex items-center space-x-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                activeTab === 'mindmap' ? 'bg-primary/20 text-primary' : 'text-mutedText hover:bg-darkBg hover:text-strong'
              }`}
            >
              <Database size={16} />
              <span>마인드맵</span>
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center space-x-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                activeTab === 'general' ? 'bg-primary/20 text-primary' : 'text-mutedText hover:bg-darkBg hover:text-strong'
              }`}
            >
              <Monitor size={16} />
              <span>일반</span>
            </button>
          </div>

          {/* Settings Area */}
          <div className="flex-1 p-6 overflow-y-auto bg-darkBg">
            {activeTab === 'editor' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-body">폰트 크기 ({settings.editor.fontSize}px)</label>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    value={settings.editor.fontSize}
                    onChange={(e) => updateEditor({ fontSize: parseInt(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-body flex items-center justify-between">
                    <span>줄 바꿈 (Line Wrapping)</span>
                    <button
                      onClick={() => updateEditor({ lineWrapping: !settings.editor.lineWrapping })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        settings.editor.lineWrapping ? 'bg-primary' : 'bg-darkBorder'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-overlay transition-transform ${
                          settings.editor.lineWrapping ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                  <p className="text-xs text-mutedText">긴 텍스트를 에디터 가로 너비에 맞춰 줄 바꿈 처리합니다.</p>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-body">
                    에디터 좌우 마진 (본문 너비: {settings.editor.contentMaxWidth === 0 ? '전체 너비' : `${settings.editor.contentMaxWidth}px`})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1500"
                    step="50"
                    value={settings.editor.contentMaxWidth}
                    onChange={(e) => updateEditor({ contentMaxWidth: parseInt(e.target.value) })}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-mutedText">0으로 설정하면 화면 전체 너비를 사용합니다.</p>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-body">자동 저장</label>
                  <select
                    value={settings.editor.autosaveLevel}
                    onChange={(e) => updateEditor({ autosaveLevel: e.target.value as 'off' | 'low' | 'high' })}
                    className="w-full bg-darkPanel border border-darkBorder rounded-md px-3 py-2 text-sm text-strong outline-none focus:border-primary"
                  >
                    <option value="off">끄기</option>
                    <option value="low">낮음 (편집을 멈춘 뒤 5초)</option>
                    <option value="high">높음 (편집을 멈춘 뒤 1.5초)</option>
                  </select>
                  <p className="text-xs text-mutedText">편집을 멈추면 지정한 시간 뒤 자동으로 저장됩니다.</p>
                </div>
              </div>
            )}

            {activeTab === 'mindmap' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-body">연결선 스타일</label>
                  <select
                    value={settings.mindmap.edgeStyle}
                    onChange={(e) => updateMindmap({ edgeStyle: e.target.value as any })}
                    className="w-full bg-darkPanel border border-darkBorder rounded-md px-3 py-2 text-sm text-strong outline-none focus:border-primary"
                  >
                    <option value="bezier">곡선 (Bezier)</option>
                    <option value="smoothstep">직각 곡선 (Smoothstep)</option>
                    <option value="straight">직선 (Straight)</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'general' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-body">테마</label>
                  <select
                    value={settings.general.themeMode}
                    onChange={(e) => updateGeneral({ themeMode: e.target.value as 'system' | 'dark' | 'light' })}
                    className="w-full bg-darkPanel border border-darkBorder rounded-md px-3 py-2 text-sm text-strong outline-none focus:border-primary"
                  >
                    <option value="system">시스템 설정을 따름</option>
                    <option value="dark">다크</option>
                    <option value="light">라이트</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-body flex items-center justify-between">
                    <span>마지막 워크스페이스 자동 열기</span>
                    <button
                      onClick={() => updateGeneral({ autoOpenLastWorkspace: !settings.general.autoOpenLastWorkspace })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        settings.general.autoOpenLastWorkspace ? 'bg-primary' : 'bg-darkBorder'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-overlay transition-transform ${
                          settings.general.autoOpenLastWorkspace ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>

                <div className="mt-12 pt-6 border-t border-darkBorder border-dashed">
                  <button
                    onClick={() => {
                      if (confirm('모든 설정을 기본값으로 초기화하시겠습니까?')) {
                        resetToDefaults();
                      }
                    }}
                    className="px-4 py-2 bg-darkPanel hover:bg-dangerBg/10 text-danger border border-darkBorder hover:border-dangerBg/50 rounded-md text-sm transition-colors"
                  >
                    기본값으로 초기화
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
