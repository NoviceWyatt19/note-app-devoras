import React from 'react';
import { Bold, Italic, Strikethrough, Link2, Code2, Table, Eye, Edit3, Minus, Plus } from 'lucide-react';
import { getActiveEditorView } from '@/shared/lib/editorViewRegistry';
import { TabItem } from '@/entities/document/model/store';
import { useEffectiveTabStore } from '@/entities/document/model/useEffectiveTabStore';
import { useSettingsStore } from '@/entities/settings/model/store';
// ---------------------------------------------------------------------------

interface InlineFormatSpec {
  prefix: string;
  suffix: string;
  /** Placeholder inserted when no text is selected */
  placeholder: string;
}

/** Toggle inline markdown syntax (bold, italic, etc.) on the current selection. */
function applyInlineFormat({ prefix, suffix, placeholder }: InlineFormatSpec) {
  const view = getActiveEditorView();
  if (!view) return;

  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  // Toggle: if the selection is already wrapped, unwrap it
  if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length > prefix.length + suffix.length) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length);
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    });
  } else {
    const text = selected || placeholder;
    const newText = `${prefix}${text}${suffix}`;
    view.dispatch({
      changes: { from, to, insert: newText },
      // If there was a selection, select the whole wrapped result.
      // If there was none, select the placeholder so the user can type over it.
      selection: selected
        ? { anchor: from, head: from + newText.length }
        : { anchor: from + prefix.length, head: from + prefix.length + placeholder.length },
    });
  }
}

/** Insert a block-level template (code fences, table) at the current position. */
function insertBlock(template: string, cursorDelta: number) {
  const view = getActiveEditorView();
  if (!view) return;

  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: template },
    selection: { anchor: from + cursorDelta },
  });
}

// ---------------------------------------------------------------------------
// Toolbar button definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  icon: React.ReactNode;
  label: string;
  action: () => void;
}

const CODE_FENCE_TEMPLATE = '```\n코드\n```';
const TABLE_TEMPLATE =
  '| 헤더 1 | 헤더 2 | 헤더 3 |\n| --- | --- | --- |\n| 셀 1 | 셀 2 | 셀 3 |\n| 셀 4 | 셀 5 | 셀 6 |';

const tools: ToolDef[] = [
  {
    icon: <Bold size={13} />,
    label: '굵게 (Bold)',
    action: () => applyInlineFormat({ prefix: '**', suffix: '**', placeholder: '굵은 텍스트' }),
  },
  {
    icon: <Italic size={13} />,
    label: '기울임 (Italic)',
    action: () => applyInlineFormat({ prefix: '*', suffix: '*', placeholder: '기울임 텍스트' }),
  },
  {
    icon: <Strikethrough size={13} />,
    label: '취소선 (Strikethrough)',
    action: () => applyInlineFormat({ prefix: '~~', suffix: '~~', placeholder: '취소선 텍스트' }),
  },
  {
    icon: <Link2 size={13} />,
    label: '링크 (Link)',
    action: () => applyInlineFormat({ prefix: '[', suffix: '](url)', placeholder: '링크 텍스트' }),
  },
  {
    icon: <Code2 size={13} />,
    label: '코드 블록 (Code Block)',
    action: () => insertBlock(CODE_FENCE_TEMPLATE, 4 /* cursor after "```\n" */),
  },
  {
    icon: <Table size={13} />,
    label: '표 (Table)',
    action: () => insertBlock(TABLE_TEMPLATE, TABLE_TEMPLATE.length),
  },
];

// ---------------------------------------------------------------------------
// FormatToolbar Component
// ---------------------------------------------------------------------------

export const FormatToolbar: React.FC<{ tab?: TabItem }> = ({ tab }) => {
  const { viewMode, toggleViewMode } = useEffectiveTabStore(tab?.id);
  const { settings, updateEditor } = useSettingsStore();

  return (
    <div
      className="flex items-center gap-0.5 px-3 py-1.5 border-b border-darkBorder/40 bg-darkPanel/60"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Format buttons — only relevant in write mode */}
      {viewMode === 'write' && (
        <>
          {tools.map((tool) => (
            <button
              key={tool.label}
              title={tool.label}
              onClick={tool.action}
              className="
                flex items-center justify-center
                w-7 h-7 rounded
                text-mutedText hover:text-slate-200
                hover:bg-white/10 active:bg-white/20
                transition-colors duration-100
                select-none
              "
            >
              {tool.icon}
            </button>
          ))}

          {/* Divider */}
          <div className="w-px h-4 bg-darkBorder/60 mx-1" />

          <span className="text-[10px] text-mutedText/40 font-mono select-none">
            선택 후 클릭으로 서식 적용
          </span>
        </>
      )}

      {/* Font size is shared by write and read modes. */}
      <div className="flex items-center gap-0.5 ml-3 text-mutedText">
        <button
          title="글꼴 크기 줄이기"
          onClick={() => updateEditor({ fontSize: Math.max(12, settings.editor.fontSize - 1) })}
          className="flex items-center justify-center w-6 h-6 rounded hover:text-slate-200 hover:bg-white/10"
        >
          <Minus size={12} />
        </button>
        <span className="w-8 text-center text-[10px] font-mono select-none">{settings.editor.fontSize}px</span>
        <button
          title="글꼴 크기 키우기"
          onClick={() => updateEditor({ fontSize: Math.min(24, settings.editor.fontSize + 1) })}
          className="flex items-center justify-center w-6 h-6 rounded hover:text-slate-200 hover:bg-white/10"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Mode toggle — always visible, pinned to the right */}
      <div className="ml-auto">
        <button
          title={viewMode === 'write' ? '읽기 모드로 전환 (Read)' : '편집 모드로 전환 (Edit)'}
          onClick={toggleViewMode}
          className={[
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all duration-150 select-none',
            viewMode === 'read'
              ? 'text-indigo-300 bg-indigo-950/70 border border-indigo-800/50 hover:bg-indigo-900/50'
              : 'text-mutedText hover:text-slate-200 hover:bg-white/10',
          ].join(' ')}
        >
          {viewMode === 'write' ? <Eye size={12} /> : <Edit3 size={12} />}
          <span>{viewMode === 'write' ? 'Read' : 'Edit'}</span>
        </button>
      </div>
    </div>
  );
};
