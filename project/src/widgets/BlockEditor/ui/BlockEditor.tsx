import React, { useEffect, useRef, useMemo } from 'react';
import { useBlockStore, EditorBlock, flattenTree } from '@/entities/block/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, drawSelection} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';

import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileEdit } from 'lucide-react';
import { FormatToolbar } from './FormatToolbar';
import { ReadView } from './ReadView';
import { setActiveEditorView, getActiveEditorView } from '@/shared/lib/activeEditorView';
import { useTauriInputManager } from '@/shared/lib/editor/useTauriInputManager';
import { useImeInputManager } from '@/shared/lib/editor/useImeInputManager';
import { createImeIsolationExtension } from '@/shared/lib/editor/extensions/ImeIsolation';

import { saveImageAssetWithPolicy } from '@/shared/lib/fs/imageAsset';
import { createDecorationPlugin } from '@/shared/lib/editor/decorators/orchestrator';
import { BoldItalicDecorator } from '@/shared/lib/editor/decorators/impl/BoldItalicDecorator';
import { StrikethroughDecorator } from '@/shared/lib/editor/decorators/impl/StrikethroughDecorator';
import { CheckboxDecorator } from '@/shared/lib/editor/decorators/impl/CheckboxDecorator';
import { CodeBlockDecorator, codeBlockInteractionPlugin } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { LatexDecorator } from '@/shared/lib/editor/decorators/impl/LatexDecorator';
import { HyperlinkDecorator } from '@/shared/lib/editor/decorators/impl/HyperlinkDecorator';
import { ImageDecorator } from '@/shared/lib/editor/decorators/impl/ImageDecorator';
import { HeadingDecorator } from '@/shared/lib/editor/decorators/impl/HeadingDecorator';
import { ListDecorator } from '@/shared/lib/editor/decorators/impl/ListDecorator';
import { BlockquoteDecorator } from '@/shared/lib/editor/decorators/impl/BlockquoteDecorator';
import { HorizontalRuleDecorator } from '@/shared/lib/editor/decorators/impl/HorizontalRuleDecorator';

const markdownDecorationPlugin = createDecorationPlugin([
  new BoldItalicDecorator(),
  new StrikethroughDecorator(),
  new CheckboxDecorator(),
  new CodeBlockDecorator(),
  new LatexDecorator(),
  new HyperlinkDecorator(),
  new ImageDecorator(),
  new HeadingDecorator(),
  new ListDecorator(),
  new BlockquoteDecorator(),
  new HorizontalRuleDecorator(),
]);

interface CodeMirrorBlockProps {
  block: EditorBlock;
  index: number;
  isFocused: boolean;
  focusOffset: number;
  onUpdate: (content: string, cursorOffset: number) => void;
  onMerge: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onSelect: () => void;
}

const CodeMirrorBlock = React.memo<CodeMirrorBlockProps>(function CodeMirrorBlock({
  block,
  index,
  isFocused,
  focusOffset,
  onUpdate,
  onMerge,
  onFocusPrev,
  onFocusNext,
  onSelect,
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef({ onFocusPrev, onFocusNext, onMerge, onUpdate });

  useEffect(() => {
    callbacksRef.current = { onFocusPrev, onFocusNext, onMerge, onUpdate };
  });

  const isImeComposingRef = useImeInputManager();

  useEffect(() => {
    if (!containerRef.current) return;

    const blockKeymap = keymap.of([
      {
        key: 'Backspace',
        run: (view) => {
          if (view.composing) return false;
          const { from, empty } = view.state.selection.main;
          if (empty && from === 0) {
            callbacksRef.current.onMerge();
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowUp',
        run: (view) => {
          if (view.composing) return false;
          const { from, empty } = view.state.selection.main;
          if (empty && from === 0) {
            callbacksRef.current.onFocusPrev();
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowDown',
        run: (view) => {
          if (view.composing) return false;
          const { from, empty } = view.state.selection.main;
          if (empty && from === view.state.doc.length) {
            callbacksRef.current.onFocusNext();
            return true;
          }
          return false;
        },
      },
      { key: 'Tab', run: indentMore },
      { key: 'Shift-Tab', run: indentLess },
    ]);

    const state = EditorState.create({
      doc: block.content,
      extensions: [
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        oneDark,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        blockKeymap,
        markdownDecorationPlugin,
        codeBlockInteractionPlugin,
        createImeIsolationExtension(),
        EditorView.domEventHandlers({
          input(event, view) {
            const inputEvent = event as InputEvent;
            if (inputEvent.isComposing) return;
            callbacksRef.current.onUpdate(
              view.state.doc.toString(),
              view.state.selection.main.anchor,
            );
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.focusChanged && update.view.hasFocus) {
            setActiveEditorView(update.view);
            onSelect();
          }

          if (!update.docChanged) return;

          if (isImeComposingRef.current || update.view.composing) return;

          const isExternal = update.transactions.some(
            tr => tr.annotation(Transaction.userEvent) === 'external'
          );
          if (isExternal) return;

          callbacksRef.current.onUpdate(
            update.state.doc.toString(),
            update.state.selection.main.anchor,
          );
        }),
        EditorView.theme({
          '&': { background: 'transparent !important', height: 'auto' },
          '.cm-scroller': {
            fontFamily: 'JetBrains Mono, Fira Code, monospace',
            fontSize: 'var(--editor-font-size, 13px)',
            overflow: 'hidden',
            minWidth: '0',
          },
          '.cm-content': { caretColor: '#6366f1', padding: '4px 0', minWidth: '0' },
          '.cm-line': { padding: '0 4px' },
          '&.cm-focused .cm-cursor': { borderLeftColor: '#6366f1' },
          '&.cm-focused': { outline: 'none' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      setActiveEditorView(null);
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (block.content !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: block.content },
        annotations: [Transaction.userEvent.of('external')],
      });
    }
  }, [block.content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (isFocused && !view.hasFocus) {
      view.focus();
      const length = view.state.doc.length;
      const targetOffset = Math.min(focusOffset, length);
      view.dispatch({
        selection: { anchor: targetOffset, head: targetOffset },
      });
    }
  }, [isFocused, focusOffset]);

  // Remove individual borders/backgrounds here so BlockNode can handle the layout tree.
  return (
    <div
      className={`group relative py-1 transition-all duration-200 ${
        isFocused ? 'bg-primary/10 rounded-lg' : 'hover:bg-darkPanel/30 rounded-lg'
      }`}
    >
      {/* 
        We optionally show line index (flat) for debugging, or you can disable it.
        We'll keep it absolute left if needed.
      */}
      <div className="absolute -left-6 top-2 text-[10px] text-mutedText/30 opacity-0 group-hover:opacity-100 font-mono select-none">
        {index + 1}
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Recursive Block Node
// ---------------------------------------------------------------------------
const BlockNode = React.memo<{
  block: EditorBlock;
  activeBlockId: string | null;
  focusOffset: number;
  flatBlocks: EditorBlock[];
  handleBlockUpdate: (id: string, text: string, cursorOffset: number) => void;
  handleMerge: (id: string) => void;
  focusBlock: (id: string, offset?: number) => void;
}>(({ block, activeBlockId, focusOffset, flatBlocks, handleBlockUpdate, handleMerge, focusBlock }) => {
  
  const getLevelStyles = (level: number) => {
    switch(level) {
      case 1: 
        return 'mb-8 bg-transparent'; // H1은 박스 제거, 투명한 기본 컨테이너
      case 2: 
        // H2부터 실질적인 중첩 박스 시작 (가장 바깥쪽 박스 역할)
        return 'mt-6 p-5 rounded-2xl bg-[#141520] border border-darkBorder/40 shadow-md';
      case 3: 
        return 'mt-4 p-4 rounded-xl bg-[#1d1f30] border border-darkBorder/40';
      default: 
        return 'mt-2 pl-2'; // 일반 텍스트
    }
  };

  const blockIndex = useMemo(() => flatBlocks.findIndex(b => b.id === block.id), [flatBlocks, block.id]);

  return (
    <div className={`block-node-wrapper transition-colors duration-200 ${getLevelStyles(block.level)}`}>
      <div className={block.level === 1 ? 'pb-3 mb-5 border-b-2 border-darkBorder/40' : ''}>
        <CodeMirrorBlock
          block={block}
          index={blockIndex}
          isFocused={activeBlockId === block.id}
          focusOffset={activeBlockId === block.id ? focusOffset : 0}
          onUpdate={(text, offset) => handleBlockUpdate(block.id, text, offset)}
          onMerge={() => handleMerge(block.id)}
          onFocusPrev={() => {
            if (blockIndex > 0) focusBlock(flatBlocks[blockIndex - 1].id, flatBlocks[blockIndex - 1].content.length);
          }}
          onFocusNext={() => {
            if (blockIndex < flatBlocks.length - 1) focusBlock(flatBlocks[blockIndex + 1].id, 0);
          }}
          onSelect={() => focusBlock(block.id)}
        />
      </div>
      {block.children.length > 0 && (
        <div className={`block-children ${block.level > 0 ? 'mt-4' : 'mt-1'}`}>
          {block.children.map(child => (
            <BlockNode
              key={child.id}
              block={child}
              activeBlockId={activeBlockId}
              focusOffset={focusOffset}
              flatBlocks={flatBlocks}
              handleBlockUpdate={handleBlockUpdate}
              handleMerge={handleMerge}
              focusBlock={focusBlock}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Editor
// ---------------------------------------------------------------------------
export const BlockEditor: React.FC = () => {
  const { getCurrentFile, rawContent, updateContent, viewMode, fontSize } = useDocumentStore();
  const currentFile = getCurrentFile();

  const blocks = useBlockStore(s => s.blocks);
  const activeBlockId = useBlockStore(s => s.activeBlockId);
  const focusOffset = useBlockStore(s => s.focusOffset);
  const mergeBlockWithPrevious = useBlockStore(s => s.mergeBlockWithPrevious);
  const focusBlock = useBlockStore(s => s.focusBlock);

  const flatBlocks = useMemo(() => flattenTree(blocks), [blocks]);

  const contentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentFile && rawContent !== undefined) {
      useBlockStore.getState().setBlocksFromContent(rawContent);
    }
  }, [currentFile?.path, rawContent]);

  useTauriInputManager({
    enabled: () => !!getActiveEditorView(),
    onCommand: async (cmd) => {
      if (cmd.type !== 'INSERT_IMAGE') return;
      const { data, mimeType } = cmd.payload;

      const view = getActiveEditorView();
      if (!view) return;
      
      const { workspacePath, config } = useWorkspaceStore.getState();
      if (!workspacePath) return;
      
      const { getCurrentFile: getCF } = useDocumentStore.getState();
      const currentFilePath = getCF()?.path ?? null;

      try {
        const relativePath = await saveImageAssetWithPolicy(
          workspacePath, currentFilePath, data, mimeType, config,
        );
        const md = `![이미지](${relativePath})`;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: md },
          selection: { anchor: from + md.length },
        });
      } catch (err) {
        console.error('[BlockEditor] INSERT_IMAGE failed', err);
      }
    },
  });

  const handleBlockUpdate = (id: string, text: string, cursorOffset: number) => {
    useDocumentStore.getState().setDirty(true);

    const state = useBlockStore.getState();
    const currentFlatBlocks = flattenTree(state.blocks);
    const activeIndex = currentFlatBlocks.findIndex(b => b.id === id);
    if (activeIndex === -1) return;

    let absoluteCursorPos = cursorOffset;
    for (let i = 0; i < activeIndex; i++) {
      absoluteCursorPos += currentFlatBlocks[i].content.length + 1;
    }

    state.updateBlockContent(id, text);
    const merged = useBlockStore.getState().getMergedContent();

    const lines = merged.replace(/\r\n/g, '\n').split('\n');
    let headingCount = 0;
    let fenceActive = false;
    lines.forEach((line) => {
      if (/^(`{3,}|~{3,})/.test(line)) { fenceActive = !fenceActive; return; }
      if (!fenceActive && (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### '))) headingCount++;
    });
    if (headingCount === 0) headingCount = 1;

    // 분할 트리거
    if (headingCount !== currentFlatBlocks.length) {
      state.setBlocksFromContent(merged);
      const nextFlatBlocks = flattenTree(useBlockStore.getState().blocks);

      let accumulated = 0;
      let targetId = nextFlatBlocks[nextFlatBlocks.length - 1].id;
      let targetOffset = 0;

      for (let i = 0; i < nextFlatBlocks.length; i++) {
        const len = nextFlatBlocks[i].content.length;
        const isLastBlock = i === nextFlatBlocks.length - 1;

        if (absoluteCursorPos < accumulated + len || isLastBlock) {
          targetId = nextFlatBlocks[i].id;
          targetOffset = Math.min(Math.max(0, absoluteCursorPos - accumulated), len);
          break;
        }
        else if (absoluteCursorPos === accumulated + len) {
          targetId = nextFlatBlocks[i + 1].id;
          targetOffset = 0;
          break;
        }
        accumulated += len + 1;
      }

      setTimeout(() => useBlockStore.getState().focusBlock(targetId, targetOffset), 0);
      updateContent(merged);
    } else {
      if (contentSyncTimerRef.current !== null) clearTimeout(contentSyncTimerRef.current);
      contentSyncTimerRef.current = setTimeout(() => {
        contentSyncTimerRef.current = null;
        updateContent(useBlockStore.getState().getMergedContent());
      }, 150);
    }
  };

  const handleMerge = (id: string) => {
    mergeBlockWithPrevious(id);
    setTimeout(() => {
      updateContent(useBlockStore.getState().getMergedContent());
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
    <div
      className="min-h-full flex flex-col"
      style={{ '--editor-font-size': `${fontSize}px` } as React.CSSProperties}
    >
      <div className="sticky top-0 z-10 bg-darkBg/95 backdrop-blur-sm">
        <div className=" mx-auto">
          <FormatToolbar />
        </div>
      </div>

      {viewMode === 'read' ? (
        <ReadView />
      ) : (
        <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 flex-1 flex flex-col">
          <div className="flex-1">
            {blocks.map((rootBlock) => (
              <BlockNode
                key={rootBlock.id}
                block={rootBlock}
                activeBlockId={activeBlockId}
                focusOffset={focusOffset}
                flatBlocks={flatBlocks}
                handleBlockUpdate={handleBlockUpdate}
                handleMerge={handleMerge}
                focusBlock={focusBlock}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
