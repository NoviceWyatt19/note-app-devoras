import React, { useEffect, useRef } from 'react';
import { useBlockStore, EditorBlock } from '@/entities/block/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { EditorState, Transaction } from '@codemirror/state';
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
  onMerge: () => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onSelect: () => void;
}

// Wrap with React.memo so a block only re-renders when its own props change.
// Without memo, every keystroke in any block causes ALL CodeMirrorBlock
// instances to re-render because BlockEditor's state update triggers a full
// component tree reconciliation.
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
          // Only relay user-initiated changes, NOT external syncs dispatched
          // with Transaction.userEvent 'external' (e.g. content sync from store re-slice).
          // This prevents the feedback loop: external dispatch → docChanged → onUpdate → re-dispatch.
          const isExternal = update.transactions.some(
            tr => tr.annotation(Transaction.userEvent) === 'external'
          );
          if (update.docChanged && !isExternal) {
            callbacksRef.current.onUpdate(update.state.doc.toString());
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
  const { currentFile, updateContent } = useDocumentStore();

  // Narrow Zustand selectors — each subscription only triggers a re-render
  // when its specific slice of the store changes, not on every store write.
  const blocks = useBlockStore(s => s.blocks);
  const activeBlockId = useBlockStore(s => s.activeBlockId);
  const focusOffset = useBlockStore(s => s.focusOffset);
  const mergeBlockWithPrevious = useBlockStore(s => s.mergeBlockWithPrevious);
  const focusBlock = useBlockStore(s => s.focusBlock);

  const handleBlockUpdate = (id: string, text: string) => {
    // Always read from the store directly to avoid stale React closure values.
    // Zustand set() is synchronous so getState() always reflects the latest state.
    useBlockStore.getState().updateBlockContent(id, text);

    // Re-read after the above synchronous update
    const state = useBlockStore.getState();
    const merged = state.getMergedContent();

    // Count structural H1/H2 boundaries, skipping lines inside code fences —
    // must be consistent with setBlocksFromContent's slicing logic.
    const lines = merged.replace(/\r\n/g, '\n').split('\n');
    let headingCount = 0;
    let fenceActive = false;
    lines.forEach((line) => {
      if (/^(`{3,}|~{3,})/.test(line)) { fenceActive = !fenceActive; return; }
      if (!fenceActive && (line.startsWith('# ') || line.startsWith('## '))) headingCount++;
    });
    if (headingCount === 0) headingCount = 1;

    // Only re-slice when a heading was actually added or removed
    if (headingCount !== state.blocks.length) {
      const prevIds = new Set(state.blocks.map(b => b.id));

      state.setBlocksFromContent(merged);

      // Find the block that didn't exist before — that is the newly created block
      const nextBlocks = useBlockStore.getState().blocks;
      const newBlock = nextBlocks.find(b => !prevIds.has(b.id));
      if (newBlock) {
        // Place cursor at the end of the heading line (after '# ' or '## ' text),
        // not at offset 0 which would sit before the heading prefix.
        const firstNewline = newBlock.content.indexOf('\n');
        const headingLineEnd = firstNewline === -1 ? newBlock.content.length : firstNewline;
        // Defer one tick so the new CodeMirror instance is mounted before focusing
        setTimeout(() => useBlockStore.getState().focusBlock(newBlock.id, headingLineEnd), 0);
      }
    }

    updateContent(merged);
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
    <div className="py-6 max-w-3xl mx-auto min-h-full flex flex-col">
      <div className="space-y-3 flex-1">
        {blocks.map((block, index) => (
          <CodeMirrorBlock
            key={block.id}
            block={block}
            index={index}
            isFocused={activeBlockId === block.id}
            focusOffset={activeBlockId === block.id ? focusOffset : 0}
            onUpdate={(text) => handleBlockUpdate(block.id, text)}
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
