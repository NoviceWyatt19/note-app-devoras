import React, { useEffect, useRef } from 'react';
import { useBlockStore, EditorBlock } from '@/entities/block/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileEdit } from 'lucide-react';

// Single CodeMirror block component
interface CodeMirrorBlockProps {
  block: EditorBlock;
  index: number;
  isFocused: boolean;
  focusOffset: number;
  onUpdate: (content: string) => void;
  onSplit: (offset: number) => void;
  onMerge: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onSelect: () => void;
}

const CodeMirrorBlock: React.FC<CodeMirrorBlockProps> = ({
  block,
  index,
  isFocused,
  focusOffset,
  onUpdate,
  onSplit,
  onMerge,
  onFocusPrev,
  onFocusNext,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Initialize CodeMirror instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Define custom keybindings for block boundaries
    const blockKeymap = keymap.of([
      {
        key: 'Enter',
        run: (view) => {
          const { from, empty } = view.state.selection.main;
          if (empty) {
            onSplit(from);
            return true; // prevent default enter action
          }
          return false;
        },
      },
      {
        key: 'Backspace',
        run: (view) => {
          const { from, empty } = view.state.selection.main;
          if (empty && from === 0) {
            onMerge();
            return true; // prevent default backspace action
          }
          return false;
        },
      },
      {
        key: 'ArrowUp',
        run: (view) => {
          const { from } = view.state.selection.main;
          const line = view.state.doc.lineAt(from);
          if (line.number === 1) {
            onFocusPrev();
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowDown',
        run: (view) => {
          const { from } = view.state.selection.main;
          const line = view.state.doc.lineAt(from);
          const totalLines = view.state.doc.lines;
          if (line.number === totalLines) {
            onFocusNext();
            return true;
          }
          return false;
        },
      },
    ]);

    const state = EditorState.create({
      doc: block.content,
      extensions: [
        markdown(),
        oneDark,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        blockKeymap,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onUpdate(update.state.doc.toString());
          }
          if (update.focusChanged && update.view.hasFocus) {
            onSelect();
          }
        }),
        EditorView.theme({
          '&': {
            background: 'transparent !important',
            height: 'auto',
          },
          '.cm-scroller': {
            fontFamily: 'JetBrains Mono, Fira Code, monospace',
            fontSize: '13px',
            overflow: 'hidden',
          },
          '.cm-content': {
            caretColor: '#6366f1',
            padding: '4px 0',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: '#6366f1',
          },
          '&.cm-focused': {
            outline: 'none',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update content inside CodeMirror externally if store sync changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (block.content !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: block.content },
      });
    }
  }, [block.content]);

  // Sync editor focus states
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (isFocused && !view.hasFocus) {
      view.focus();
      // Safely apply offset
      const length = view.state.doc.length;
      const targetOffset = Math.min(focusOffset, length);
      view.dispatch({
        selection: { anchor: targetOffset, head: targetOffset },
      });
    }
  }, [isFocused, focusOffset]);

  return (
    <div
      className={`group relative py-1 px-4 border-l-2 transition-all duration-200 ${
        isFocused
          ? 'border-primary/70 bg-primary/5'
          : 'border-transparent hover:border-darkBorder/40 hover:bg-darkPanel/20'
      }`}
    >
      <div className="absolute -left-2 top-2 text-[10px] text-mutedText/30 opacity-0 group-hover:opacity-100 font-mono select-none">
        {index + 1}
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
};

// Main BlockEditor Widget Component
export const BlockEditor: React.FC = () => {
  const { currentFile, updateContent } = useDocumentStore();
  const {
    blocks,
    activeBlockId,
    focusOffset,
    updateBlockContent,
    splitBlock,
    mergeBlockWithPrevious,
    focusBlock,
    getMergedContent,
  } = useBlockStore();

  const handleBlockUpdate = (id: string, text: string) => {
    updateBlockContent(id, text);
    // Merge all blocks and project to document store (realtime AST mapping)
    const merged = getMergedContent();
    updateContent(merged);
  };

  const handleSplit = (id: string, offset: number) => {
    splitBlock(id, offset);
    setTimeout(() => {
      updateContent(getMergedContent());
    }, 0);
  };

  const handleMerge = (id: string) => {
    mergeBlockWithPrevious(id);
    setTimeout(() => {
      updateContent(getMergedContent());
    }, 0);
  };

  if (!currentFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none">
        <FileEdit className="w-12 h-12 text-primary/40 mb-3 animate-pulse" />
        <h3 className="text-sm font-semibold text-slate-300 mb-1">문서가 선택되지 않았습니다</h3>
        <p className="text-xs text-mutedText max-w-xs leading-relaxed">
          좌측 파일 탐색기에서 마크다운 문서를 선택하거나, 새 문서를 생성하여 편집을 시작해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="py-6 max-w-3xl mx-auto min-h-full flex flex-col">
      <div className="space-y-3 flex-1">
        {blocks.map((block, index) => (
          <CodeMirrorBlock
            key={block.id}
            block={block}
            index={index}
            isFocused={activeBlockId === block.id}
            focusOffset={focusOffset}
            onUpdate={(text) => handleBlockUpdate(block.id, text)}
            onSplit={(offset) => handleSplit(block.id, offset)}
            onMerge={() => handleMerge(block.id)}
            onFocusPrev={() => {
              if (index > 0) focusBlock(blocks[index - 1].id, blocks[index - 1].content.length);
            }}
            onFocusNext={() => {
              if (index < blocks.length - 1) focusBlock(blocks[index + 1].id, 0);
            }}
            onSelect={() => focusBlock(block.id)}
          />
        ))}
      </div>
    </div>
  );
};
