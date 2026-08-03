import React, { useEffect, useRef } from 'react';
import { useBlockStore, EditorBlock } from '@/entities/block/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, drawSelection} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';

import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileEdit } from 'lucide-react';
import { FormatToolbar } from './FormatToolbar';
import { ReadView } from './ReadView';
import { setActiveEditorView } from '@/shared/lib/activeEditorView';

import { saveImageAssetWithPolicy } from '@/shared/lib/fs/imageAsset';
import { createDecorationPlugin } from '@/shared/lib/editor/decorators/orchestrator';
import { BoldItalicDecorator } from '@/shared/lib/editor/decorators/impl/BoldItalicDecorator';
import { StrikethroughDecorator } from '@/shared/lib/editor/decorators/impl/StrikethroughDecorator';
import { CheckboxDecorator } from '@/shared/lib/editor/decorators/impl/CheckboxDecorator';
import { CodeBlockDecorator } from '@/shared/lib/editor/decorators/impl/CodeBlockDecorator';
import { LatexDecorator } from '@/shared/lib/editor/decorators/impl/LatexDecorator';
import { HyperlinkDecorator } from '@/shared/lib/editor/decorators/impl/HyperlinkDecorator';

// ---------------------------------------------------------------------------
// Module-level decoration plugin
// Instantiated once and shared across all CodeMirrorBlock instances.
// To add new syntax: append a new SyntaxDecorator to this array.
// ---------------------------------------------------------------------------
const markdownDecorationPlugin = createDecorationPlugin([
  new BoldItalicDecorator(),
  new StrikethroughDecorator(),
  new CheckboxDecorator(),
  new CodeBlockDecorator(),
  new LatexDecorator(),
  new HyperlinkDecorator(),
]);

// Single CodeMirror block component
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

// Wrap with React.memo so a block only re-renders when its own props change.
// Without memo, every keystroke in any block causes ALL CodeMirrorBlock
// instances to re-render because BlockEditor's state update triggers a full
// component tree reconciliation.
// FIXME:
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

  // Mutable ref that always holds the latest callback props.
  // The keymap's run() functions read from this ref instead of capturing
  // props directly, which prevents stale-closure bugs caused by the
  // one-time useEffect([], []) initialization pattern.
  const callbacksRef = useRef({ onFocusPrev, onFocusNext, onMerge, onUpdate });
  useEffect(() => {
    callbacksRef.current = { onFocusPrev, onFocusNext, onMerge, onUpdate };
  });

  // Initialize CodeMirror instance
  useEffect(() => {
    if (!containerRef.current) return;


    // Define custom keybindings for block boundaries.
    // NOTE: Enter is intentionally NOT intercepted here.
    // Under the H1/H2 slicing policy, Enter is a plain newline inside the
    // current block. Block splitting is triggered automatically when the
    // user types a '# ' or '## ' heading prefix, detected by handleBlockUpdate.
    const blockKeymap = keymap.of([
      {
        key: 'Backspace',
        run: (view) => {
          // IME guard: never intercept during Korean/CJK composition —
          // the browser handles preedit deletions natively.
          if (view.composing) return false;
          const { from, empty } = view.state.selection.main;
          // Only intercept at the very start of the block to merge with previous
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
          // IME guard: arrow keys during composition commit/select candidates.
          if (view.composing) return false;
          const { from } = view.state.selection.main;
          const line = view.state.doc.lineAt(from);
          if (line.number === 1) {
            callbacksRef.current.onFocusPrev();
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowDown',
        run: (view) => {
          // IME guard: same as ArrowUp.
          if (view.composing) return false;
          const { from } = view.state.selection.main;
          const line = view.state.doc.lineAt(from);
          const totalLines = view.state.doc.lines;
          if (line.number === totalLines) {
            callbacksRef.current.onFocusNext();
            return true;
          }
          return false;
        },
      },
      {
        // Tab: indent selected lines (or insert indentation at cursor).
        // Capturing Tab in the keymap prevents the browser from moving
        // focus to the next focusable element outside the editor.
        key: 'Tab',
        run: indentMore,
      },
      {
        // Shift-Tab: dedent selected lines.
        key: 'Shift-Tab',
        run: indentLess,
      },
    ]);

    const state = EditorState.create({
      doc: block.content,
      extensions: [
        markdown(),
        // Long prose should wrap inside the editor instead of requiring a
        // horizontal scroll. CodeMirror keeps the document offsets intact.
        EditorView.lineWrapping,
        oneDark,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        blockKeymap,
        // Markdown WYSIWYG-like inline decorations (bold, italic, strikethrough,
        // checkbox, code block, LaTeX math). New syntaxes: add a SyntaxDecorator
        // to the markdownDecorationPlugin array at the top of this file.
        markdownDecorationPlugin,
        // Image paste: intercept clipboard items that are images, save them
        // to assets/images/ and insert a markdown image link at the cursor.
        // Non-image paste falls through to CodeMirror's default handler.
        EditorView.domEventHandlers({
                      paste(event, view) {
            const e = event as ClipboardEvent;
            const items = e.clipboardData?.items;
            if (!items) return false;
            let imageItem: DataTransferItem | null = null;
            for (const item of Array.from(items)) {
              if (item.type.startsWith('image/')) { imageItem = item; break; }
            }
            if (!imageItem) return false; // let CodeMirror handle normal text paste

            e.preventDefault();
            const blob = imageItem.getAsFile();
            if (!blob) return true;

            // Async save + insert (fire-and-forget; view.dispatch triggers onUpdate)
            void (async () => {
              try {
                const { workspacePath, config } = useWorkspaceStore.getState();
                if (!workspacePath) return;
                const { getCurrentFile } = useDocumentStore.getState();
                const currentFilePath = getCurrentFile()?.path ?? null;
                const relativePath = await saveImageAssetWithPolicy(
                  workspacePath,
                  currentFilePath,
                  new Uint8Array(await blob.arrayBuffer()),
                  blob.type,
                  config,
                );
                const md = `![이미지](${relativePath})`;
                const { from, to } = view.state.selection.main;
                view.dispatch({
                  changes: { from, to, insert: md },
                  selection: { anchor: from + md.length },
                });
              } catch (err) {
                console.error('Image paste failed:', err);
              }
            })();
            return true;
          },

                    // Image drag-and-drop: copy external image files into the configured
          // assets directory and insert a markdown link at the drop position.
          drop(event, view) {
            const e = event as DragEvent;
            const files = e.dataTransfer?.files;
            if (!files || files.length === 0) return false;
            let imageFile: File | null = null;
            for (const file of Array.from(files)) {
              if (file.type.startsWith('image/')) { imageFile = file; break; }
            }
            if (!imageFile) return false;

            e.preventDefault();
            const dropPos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.doc.length;
            const captured = imageFile; // capture before async closure

            void (async () => {
              try {
                const { workspacePath, config } = useWorkspaceStore.getState();
                if (!workspacePath) return;
                const { getCurrentFile } = useDocumentStore.getState();
                const currentFilePath = getCurrentFile()?.path ?? null;
                const relativePath = await saveImageAssetWithPolicy(
                  workspacePath,
                  currentFilePath,
                  new Uint8Array(await captured.arrayBuffer()),
                  captured.type,
                  config,
                );
                const md = `![이미지](${relativePath})`;
                view.dispatch({
                  changes: { from: dropPos, to: dropPos, insert: md },
                  selection: { anchor: dropPos + md.length },
                });
              } catch (err) {
                console.error('Image drop failed:', err);
              }
            })();
            return true;
          },

          // ── IME-safe store sync via InputEvent.isComposing ────────────────
          // InputEvent.isComposing is maintained by the WebKit engine's own
          // composing state tracker, entirely within the WKWebView process.
          // It bypasses the Mach Port / IMKCFRunLoopWakeUpReliable channel that
          // fails intermittently in Tauri, making it a more reliable signal for
          // detecting "composition is truly finished" than view.composing.
          //
          // Only sync to the block store when isComposing is false (text is
          // fully committed). Preedit-phase events (isComposing=true) are skipped.
          // Non-typed changes (undo/redo/format/image insert) are handled by
          // updateListener, which filters out user-input userEvent transactions.
          input(event, view) {
            const inputEvent = event as InputEvent;
            if (inputEvent.isComposing) return; // preedit in progress — skip
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

          const isExternal = update.transactions.some(
            tr => tr.annotation(Transaction.userEvent) === 'external'
          );
          if (isExternal) return;

          // [삭제됨]: isUserTyped로 input과 delete 이벤트를 필터링하던 로직 제거
          
          if (update.view.composing) return;

          // 모든 텍스트 변경(삭제 포함)이 즉각적으로 스토어에 전달됨
          callbacksRef.current.onUpdate(
            update.state.doc.toString(),
            update.state.selection.main.anchor,
          );
        }),
        EditorView.theme({
          '&': {
            background: 'transparent !important',
            height: 'auto',
          },
          '.cm-scroller': {
            fontFamily: 'JetBrains Mono, Fira Code, monospace',
            fontSize: 'var(--editor-font-size, 13px)',
            overflow: 'hidden',
            minWidth: '0',
          },
          '.cm-content': {
            caretColor: '#6366f1',
            padding: '4px 0',
            minWidth: '0',
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
      // Release the global active-view reference to prevent the FormatToolbar
      // from dispatching into a destroyed view after this block unmounts.
      setActiveEditorView(null);
    };
  }, []);


  // Sync CodeMirror content when the block's content changes externally (e.g. re-slice)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (block.content !== currentDoc) {
      // Mark this dispatch as NOT a user event so updateListener.docChanged
      // does NOT fire onUpdate — this prevents the feedback loop where an
      // external content update triggers another handleBlockUpdate.
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: block.content },
        annotations: [Transaction.userEvent.of('external')],
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
});

// Main BlockEditor Widget Component
export const BlockEditor: React.FC = () => {
  const { getCurrentFile, rawContent, updateContent, viewMode, fontSize } = useDocumentStore();

  const currentFile = getCurrentFile();

  // Narrow Zustand selectors — each subscription only triggers a re-render
  // when its specific slice of the store changes, not on every store write.
  const blocks = useBlockStore(s => s.blocks);
  const activeBlockId = useBlockStore(s => s.activeBlockId);
  const focusOffset = useBlockStore(s => s.focusOffset);
  const mergeBlockWithPrevious = useBlockStore(s => s.mergeBlockWithPrevious);
  const focusBlock = useBlockStore(s => s.focusBlock);

  // Debounce timer for non-structural document-store syncs.
  // Kept at component level (ref) so it persists across handleBlockUpdate
  // invocations without being reset by React re-renders.
  const contentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentFile && rawContent !== undefined) {
      useBlockStore.getState().setBlocksFromContent(rawContent);
    }
  }, [currentFile?.path, rawContent]);

  const handleBlockUpdate = (id: string, text: string, cursorOffset: number) => {
      // 1. 텍스트 변경 즉시 150ms 디바운스 대기 없이 무조건 Dirty 상태로 마킹
      useDocumentStore.getState().setDirty(true);

      const prevBlocksSnapshot = useBlockStore.getState().blocks;
      const activeIndex = prevBlocksSnapshot.findIndex(b => b.id === id);
      if (activeIndex === -1) return;

      // 절대 커서 위치 계산
      let absoluteCursorPos = cursorOffset;
      for (let i = 0; i < activeIndex; i++) {
        absoluteCursorPos += prevBlocksSnapshot[i].content.length + 1;
      }

      // 상태 동기화
      useBlockStore.getState().updateBlockContent(id, text);
      const state = useBlockStore.getState();
      const merged = state.getMergedContent();

      // H1/H2 블록 분할 기준 개수 계산 (setBlocksFromContent와 100% 동일한 로직)
      const lines = merged.replace(/\r\n/g, '\n').split('\n');
      let headingCount = 0;
      let fenceActive = false;
      lines.forEach((line) => {
        if (/^(`{3,}|~{3,})/.test(line)) { fenceActive = !fenceActive; return; }
        if (!fenceActive && (line.startsWith('# ') || line.startsWith('## '))) headingCount++;
      });
      if (headingCount === 0) headingCount = 1;

      // 분할 트리거: H1/H2 개수가 기존 블록 수와 다르면 무조건 구조 변화 발생!
      // (anyViewComposing 상태에 의존하지 않고 즉시 분할하여 딜레이 제거)
      if (headingCount !== state.blocks.length) {
        state.setBlocksFromContent(merged);
        const nextBlocks = useBlockStore.getState().blocks;

        // 분할 후 커서 위치 정밀 매핑
        let accumulated = 0;
        let targetId = nextBlocks[nextBlocks.length - 1].id;
        let targetOffset = 0;

        for (let i = 0; i < nextBlocks.length; i++) {
          const len = nextBlocks[i].content.length;
          const isLastBlock = i === nextBlocks.length - 1;

          // 커서가 해당 블록 내부에 있거나, 마지막 블록인 경우
          if (absoluteCursorPos < accumulated + len || isLastBlock) {
            targetId = nextBlocks[i].id;
            // [핵심 Fix] Math.min을 다시 적용하여 CodeMirror RangeError(에디터 굳음 현상) 완벽 차단
            targetOffset = Math.min(Math.max(0, absoluteCursorPos - accumulated), len);
            break;
          }
          // 커서가 정확히 분할 경계선(개행 문자)에 위치한 경우 -> 분할된 다음 블록의 맨 앞(0)으로 안착
          else if (absoluteCursorPos === accumulated + len) {
            targetId = nextBlocks[i + 1].id;
            targetOffset = 0;
            break;
          }
          accumulated += len + 1;
        }

        setTimeout(() => useBlockStore.getState().focusBlock(targetId, targetOffset), 0);
        updateContent(merged);
      } else {
        // 일반 텍스트 입력의 경우에만 150ms 디바운스 적용
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
      {/* Sticky formatting toolbar — visible in both modes */}
      <div className="sticky top-0 z-10 bg-darkBg/95 backdrop-blur-sm">
        <div className=" mx-auto">
          <FormatToolbar />
        </div>
      </div>

      {/* Mode-dependent content area */}
      {viewMode === 'read' ? (
        <ReadView />
      ) : (
        /* Write mode: CodeMirror block editors */
        <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 flex-1 flex flex-col">
          <div className="space-y-3 flex-1">
            {blocks.map((block, index) => (
              <CodeMirrorBlock
                key={block.id}
                block={block}
                index={index}
                isFocused={activeBlockId === block.id}
                focusOffset={activeBlockId === block.id ? focusOffset : 0}
                onUpdate={(text, cursorOffset) => handleBlockUpdate(block.id, text, cursorOffset)}
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
      )}
    </div>
  );
}
