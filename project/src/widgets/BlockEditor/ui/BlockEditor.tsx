import React, { useEffect, useRef} from 'react';
import { useBlockStore, EditorBlock, flattenTree } from '@/entities/block/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { useDebouncedCallback } from '@/shared/lib/useDebouncedCallback';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { EditorState, Transaction, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { useSettingsStore } from '@/entities/settings/model/store';

const lineWrappingCompartment = new Compartment();
const editorThemeCompartment = new Compartment();

import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileEdit } from 'lucide-react';
import { FormatToolbar } from './FormatToolbar';
import { ReadView, renderBlockToHtml } from './ReadView';
import { getScrollParent } from '@/shared/lib/scrollUtils';

let pendingScrollAnchor: {
  scrollContainer: HTMLElement;
  oldRectTop: number;
  element: HTMLElement;
} | null = null;

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
import { parseCodeFenceInfo } from '@/shared/lib/markdown/codeFenceInfo';

/** CodeMirror 마크다운 파서는 코드펜스 info 문자열을 공백까지만 잘라 언어를 찾는다.
 *  따라서 Devoras 확장 문법(```lang|title|="제목")을 그대로 넘기면 언어 매칭이 실패하거나
 *  제목 안의 확장자에 퍼지 매칭되어 엉뚱한 언어로 하이라이팅된다.
 *  info 를 먼저 파싱해 순수 언어 이름만 넘긴다. */
const matchFenceLanguage = (info: string) => {
  const { lang } = parseCodeFenceInfo(info);
  return lang ? LanguageDescription.matchLanguageName(languages, lang, true) : null;
};

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
  isFocused: boolean;
  focusOffset: number;
  onUpdate: (content: string, cursorOffset: number) => void;
  onMerge: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onSelect: (offset: number) => void;
}

function createEditorTheme(settingsEditor: any) {
  return EditorView.theme({
    '&': { background: 'transparent !important', height: 'auto' },
    '.cm-scroller': {
      fontFamily: settingsEditor.fontFamily,
      fontSize: `${settingsEditor.fontSize}px`,
      overflow: 'hidden',
      minWidth: '0',
    },
    '.cm-content': { caretColor: '#6366f1', padding: '4px 0', minWidth: '0' },
    '.cm-line': { padding: '0 4px' },
    '.cm-line *': {
      fontSize: 'inherit',
      lineHeight: 'inherit',
      verticalAlign: 'baseline',
    },
    '.cm-widgetBuffer': { fontSize: 'inherit' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#6366f1' },
    '&.cm-focused': { outline: 'none' },
  });
}

const CodeMirrorBlock = React.memo<CodeMirrorBlockProps>(function CodeMirrorBlock({
  block,
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

  const { settings } = useSettingsStore();

  useEffect(() => {
    callbacksRef.current = { onFocusPrev, onFocusNext, onMerge, onUpdate };
  });

  const isImeComposingRef = useImeInputManager();

  // 설정 변경 시 컴파트먼트 재구성
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: [
        lineWrappingCompartment.reconfigure(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
        editorThemeCompartment.reconfigure(createEditorTheme(settings.editor))
      ]
    });
  }, [settings.editor.lineWrapping, settings.editor.fontFamily, settings.editor.fontSize]);

  React.useLayoutEffect(() => {
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
      selection: { anchor: Math.min(focusOffset, block.content.length) },
      extensions: [
        markdown({ codeLanguages: matchFenceLanguage }),
        lineWrappingCompartment.of(settings.editor.lineWrapping ? EditorView.lineWrapping : []),
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
            onSelect(update.state.selection.main.head);
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
        editorThemeCompartment.of(createEditorTheme(settings.editor)),
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

  React.useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || !isFocused) return;
    const length = view.state.doc.length;
    const targetOffset = Math.min(focusOffset, length);
    
    // D-3: dispatch before focus, no scrollIntoView
    const currentAnchor = view.state.selection.main.anchor;
    if (currentAnchor !== targetOffset) {
      view.dispatch({
        selection: { anchor: targetOffset, head: targetOffset },
        scrollIntoView: false
      });
    }

    if (!view.hasFocus) {
      view.focus();
    }
  }, [isFocused, focusOffset]);

  // Remove individual borders/backgrounds here so BlockNode can handle the layout tree.
  return (
    <div
      className={`group relative py-1 transition-all duration-200 ${
        isFocused ? 'bg-primary/10 rounded-lg' : 'hover:bg-darkPanel/30 rounded-lg'
      }`}
    >
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
  handleBlockUpdate: (id: string, text: string, cursorOffset: number) => void;
  handleMerge: (id: string) => void;
  focusBlock: (id: string, offset?: number) => void;
  handleFocusMove: (id: string, direction: 'prev' | 'next') => void;
}>(({ block, activeBlockId, focusOffset, handleBlockUpdate, handleMerge, focusBlock, handleFocusMove }) => {
  
  const containerRef = useRef<HTMLDivElement>(null);
  const getLevelStyles = (level: number) => {
    switch(level) {
      case 1: 
        return 'mb-8 bg-transparent'; 
      case 2: 
        return 'mt-6 p-5 rounded-2xl bg-[#141520] border border-darkBorder/40 shadow-md';
      case 3: 
        return 'mt-4 p-4 rounded-xl bg-[#1d1f30] border border-darkBorder/40';
      default: 
        return 'mt-2 pl-2';
    }
  };

  const { workspacePath } = useWorkspaceStore();
  const isFocused = activeBlockId === block.id;

  const handleBlockClick = () => {
    if (isFocused) return;
    window.getSelection()?.removeAllRanges(); // D-4
    
    if (containerRef.current) {
      const scrollParent = getScrollParent(containerRef.current);
      if (scrollParent) {
        pendingScrollAnchor = {
          scrollContainer: scrollParent,
          oldRectTop: containerRef.current.getBoundingClientRect().top,
          element: containerRef.current,
        };
      }
    }
    focusBlock(block.id, block.content.length);
  };

  React.useLayoutEffect(() => {
    if (pendingScrollAnchor && pendingScrollAnchor.element === containerRef.current) {
      const { scrollContainer, oldRectTop, element } = pendingScrollAnchor;
      
      const correctScroll = () => {
        const newRectTop = element.getBoundingClientRect().top;
        const diff = newRectTop - oldRectTop;
        if (Math.abs(diff) > 0) {
          scrollContainer.scrollTop += diff;
        }
      };

      correctScroll();

      const images = element.querySelectorAll('img');
      images.forEach(img => {
        if (!img.complete) {
          img.addEventListener('load', correctScroll, { once: true });
        }
      });
      pendingScrollAnchor = null;
    }
  });

  return (
    <div className={`block-node-wrapper transition-colors duration-200 ${getLevelStyles(block.level)}`}>
      <div 
        ref={containerRef}
        className={block.level === 1 ? 'pb-3 mb-5 border-b-2 border-darkBorder/40' : ''}
        onClick={handleBlockClick}
      >
        {isFocused ? (
          <CodeMirrorBlock
            block={block}
            isFocused={true}
            focusOffset={focusOffset}
            onUpdate={(text, offset) => handleBlockUpdate(block.id, text, offset)}
            onMerge={() => handleMerge(block.id)}
            onFocusPrev={() => handleFocusMove(block.id, 'prev')}
            onFocusNext={() => handleFocusMove(block.id, 'next')}
            onSelect={(offset: number) => focusBlock(block.id, offset)}
          />
        ) : (
          <div 
            className="rv-content cursor-text py-1"
            dangerouslySetInnerHTML={{
              __html: renderBlockToHtml(block.content, workspacePath),
            }}
          />
        )}
      </div>
      {block.children.length > 0 && (
        <div className={`block-children ${block.level > 0 ? 'mt-4' : 'mt-1'}`}>
          {block.children.map(child => (
            <BlockNode
              key={child.id}
              block={child}
              activeBlockId={activeBlockId}
              focusOffset={focusOffset}
              handleBlockUpdate={handleBlockUpdate}
              handleMerge={handleMerge}
              focusBlock={focusBlock}
              handleFocusMove={handleFocusMove}
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
  const currentFile = useDocumentStore(s => s.getCurrentFile());
  const viewMode = useDocumentStore(s => s.viewMode);
  const { settings } = useSettingsStore();

  React.useLayoutEffect(() => {
    if (viewMode === 'read') {
      const active = getActiveEditorView();
      if (active && active.hasFocus) {
        active.contentDOM.blur();
      }
    }
  }, [viewMode]);

  const blocks = useBlockStore(s => s.blocks);
  const activeBlockId = useBlockStore(s => s.activeBlockId);
  const focusOffset = useBlockStore(s => s.focusOffset);
  const mergeBlockWithPrevious = useBlockStore(s => s.mergeBlockWithPrevious);
  const focusBlock = useBlockStore(s => s.focusBlock);

  const handleFocusMove = React.useCallback((id: string, direction: 'prev' | 'next') => {
    const flatBlocks = flattenTree(useBlockStore.getState().blocks);
    const index = flatBlocks.findIndex(b => b.id === id);
    if (index === -1) return;
    
    if (direction === 'prev' && index > 0) {
      focusBlock(flatBlocks[index - 1].id, flatBlocks[index - 1].content.length);
    } else if (direction === 'next' && index < flatBlocks.length - 1) {
      focusBlock(flatBlocks[index + 1].id, 0);
    }
  }, [focusBlock]);

  const ownerTabIdRef = useRef<string>(currentFile?.path ?? '');
  React.useLayoutEffect(() => {
    ownerTabIdRef.current = currentFile?.path ?? '';
  }, [currentFile?.path]);

  const syncContent = useDebouncedCallback(() => {
    const bs = useBlockStore.getState();
    if (bs.ownerTabId !== ownerTabIdRef.current) return;
    useDocumentStore.getState().updateContentForTab(ownerTabIdRef.current, bs.getMergedContent());
  }, 150);

  useEffect(() => {
    return () => {
      syncContent.flush();
    };
  }, []);
  React.useLayoutEffect(() => {
    const docStore = useDocumentStore.getState();
    const file = docStore.getCurrentFile();
    const content = docStore.rawContent;
    const tab = docStore.getActiveTab();
    if (file && tab && content !== undefined) {
      useBlockStore.getState().setBlocksFromContent(content, tab.id);
      const firstBlock = useBlockStore.getState().blocks[0];
      if (firstBlock) useBlockStore.getState().focusBlock(firstBlock.id, 0);
    }
  }, [currentFile?.path]);

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
    
    // O(N) flattenTree를 피하기 위해, 업데이트 대상 블록의 기존 텍스트만 트리 탐색으로 빠르게 찾음
    let oldContent = '';
    const findOldContent = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.id === id) { oldContent = node.content; return true; }
        if (node.children.length > 0 && findOldContent(node.children)) return true;
      }
      return false;
    };
    findOldContent(state.blocks);

    const countHeadings = (content: string) => {
      let count = 0;
      let fenceActive = false;
      // 단일 블록에 대한 split이므로 비용이 적음
      content.split('\n').forEach(line => {
        if (/^(`{3,}|~{3,})/.test(line)) { fenceActive = !fenceActive; return; }
        if (!fenceActive && /^#{1,3} /.test(line)) count++;
      });
      return count;
    };

    const oldHeadingCount = countHeadings(oldContent);
    const newHeadingCount = countHeadings(text);

    state.updateBlockContent(id, text);

    // 헤딩 개수가 변했을 때만 트리 분할(O(N) 리파싱)을 수행
    if (oldHeadingCount !== newHeadingCount) {
      const currentFlatBlocks = flattenTree(state.blocks);
      
      let absoluteCursorPos = cursorOffset;
      for (let b of currentFlatBlocks) {
        if (b.id === id) break;
        absoluteCursorPos += b.content.length + 1;
      }
      const merged = state.getMergedContent();
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

      state.setBlocksFromContent(merged, ownerTabIdRef.current);
      state.focusBlock(targetId, targetOffset);
      useDocumentStore.getState().updateContentForTab(ownerTabIdRef.current, merged);
    } else {
      syncContent();
    }
  };

  const handleMerge = (id: string) => {
    mergeBlockWithPrevious(id);
    syncContent();
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

  const maxWidthStyle = settings.editor.contentMaxWidth > 0 
    ? { maxWidth: `${settings.editor.contentMaxWidth}px`, margin: '0 auto' } 
    : {};

  return (
    <div
      className="min-h-full flex flex-col items-center w-full"
      style={{ '--editor-font-size': `${settings.editor.fontSize}px` } as React.CSSProperties}
    >
      <div className="sticky top-0 z-10 bg-darkBg/95 backdrop-blur-sm w-full">
        <div className=" mx-auto" style={maxWidthStyle}>
          <FormatToolbar />
        </div>
      </div>

      {viewMode === 'read' ? (
        <div className="w-full flex-1">
          <ReadView />
        </div>
      ) : (
        <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 flex-1 flex flex-col">
          <div className="flex-1 w-full" style={maxWidthStyle}>
            {blocks.map((rootBlock) => (
              <BlockNode
                key={rootBlock.id}
                block={rootBlock}
                activeBlockId={activeBlockId}
                focusOffset={focusOffset}
                handleBlockUpdate={handleBlockUpdate}
                handleMerge={handleMerge}
                focusBlock={focusBlock}
                handleFocusMove={handleFocusMove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
