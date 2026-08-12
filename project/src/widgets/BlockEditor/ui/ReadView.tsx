import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Marked } from 'marked';
import { invoke } from '@tauri-apps/api/core';
import { Bold, Italic, Strikethrough, Highlighter, GripVertical } from 'lucide-react';
import { useBlockStore, flattenTree } from '@/entities/block/model/store';
import { useDocumentStore } from '@/entities/document/model/store';
import { useWorkspaceStore } from '@/entities/workspace/model/store';

// ---------------------------------------------------------------------------
// Marked instance (module-level singleton)
// ---------------------------------------------------------------------------

const markedParser = new Marked({ gfm: true, breaks: true });

// ---------------------------------------------------------------------------
// Markdown rendering helpers
// ---------------------------------------------------------------------------

/** Pre-process extended markdown before passing to `marked`.
 *  1. ==highlight== → <mark>highlight</mark> (not in GFM spec).
 *  2. 3+ consecutive newlines → injects a spacer paragraph so that extra blank
 *     lines typed in Write Mode produce proportionally more visual space in Read
 *     Mode. Without this, `marked` collapses every run of blank lines to a
 *     single paragraph break, making all spacing look identical regardless of
 *     how many times the user pressed Enter. */
function preprocessMd(md: string): string {
  return md
    .replace(/==([\s\S]+?)==/g, '<mark>$1</mark>')
    // \n{3,} = the user pressed Enter 2+ extra times beyond the first blank line.
    // Replace with a paragraph-break + a spacer <p class="rv-blank-spacer"> + another
    // paragraph-break so marked emits an extra (near-invisible) paragraph element
    // that preserves the visual gap. The spacer is styled to near-zero height in CSS.
    .replace(/\n{3,}/g, '\n\n<p class="rv-blank-spacer">&nbsp;</p>\n\n');
}

/** Resolve relative asset image paths to Tauri's asset:// protocol for webview rendering.
 *  Handles all three ImageSavePolicy path patterns:
 *  - `assets/images/{file}` (workspace-root-hidden 기본 폴백 경로)
 *  - `.devoras/images/{file}` (workspace-root-hidden 정책)
 *  - `_assets/{file}` (current-file-relative 정책)
 *  - `/absolute/path/{file}` (custom-folder 정책 — 절대 경로)
 *  See: https://tauri.app/v2/references/webview-formats/#asset-protocol */
// 2. resolveAssetPaths 함수를 데이터 속성 치환용으로 변경
function resolveAssetPaths(html: string, workspacePath: string | null): string {
  if (!workspacePath) return html;
  return html.replace(
    /src="(?!https?:\/\/|data:)([^"]+)"/g,
    (_match: string, imgPath: string) => {
      const absPath = imgPath.startsWith('/')
        ? imgPath
        : `${workspacePath}/${imgPath}`;
      // 브라우저 에러를 막기 위해 초기 src는 투명 픽셀로 둡니다.
      return `src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-src="${absPath}"`;
    },
  );
}

function renderBlockToHtml(content: string, workspacePath: string | null): string {
  const html = markedParser.parse(preprocessMd(content)) as string;
  return resolveAssetPaths(html, workspacePath);
}

// ---------------------------------------------------------------------------
// Floating toolbar configuration
// ---------------------------------------------------------------------------

interface FormatBtn {
  label: string;
  prefix: string;
  suffix: string;
  icon: React.ReactNode;
  yellow?: boolean;
}

const FORMAT_BUTTONS: FormatBtn[] = [
  { label: '굵게',     prefix: '**', suffix: '**', icon: <Bold size={12} /> },
  { label: '기울임',  prefix: '*',  suffix: '*',  icon: <Italic size={12} /> },
  { label: '취소선',  prefix: '~~', suffix: '~~', icon: <Strikethrough size={12} /> },
  { label: '형광펜',  prefix: '==', suffix: '==', icon: <Highlighter size={12} />, yellow: true },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FloatingBarState {
  /** Viewport X center of the selection range */
  x: number;
  /** Viewport Y top of the selection range */
  y: number;
  blockId: string;
  /** Raw plain-text of the selection as returned by window.getSelection().toString() */
  selectedText: string;
}

// ---------------------------------------------------------------------------
// ReadView Component
// ---------------------------------------------------------------------------

export const ReadView: React.FC = () => {
  const { blocks, reorderBlocks, focusBlock, updateBlockContent } =
    useBlockStore();
  const { setViewMode, updateContent, saveFile } = useDocumentStore();
  const { workspacePath } = useWorkspaceStore();

  // ── Drag state ─────────────────────────────────────────────────────────────
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  // ── Floating toolbar state ─────────────────────────────────────────────────
  const [floatingBar, setFloatingBar] = useState<FloatingBarState | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Dismiss floating bar when the user clicks outside of it
  useEffect(() => {
    const handleOutsideDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setFloatingBar(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideDown);
    return () => document.removeEventListener('mousedown', handleOutsideDown);
  }, []);

  useEffect(() => {
  const fetchImages = async () => {
    // data-src를 가지고 있으면서 아직 로드되지 않은 이미지들 찾기
    const imgs = document.querySelectorAll('.rv-content img[data-src]:not([data-loaded="true"])');
    
    for (const imgEl of imgs) {
      const img = imgEl as HTMLImageElement;
      const absPath = img.getAttribute('data-src');
      if (!absPath) continue;

      try {
        const dataUrl = await invoke<string>('read_image_base64', { path: absPath });
        img.src = dataUrl;
        img.dataset.loaded = "true";
      } catch (err) {
        console.error('[ReadView] 이미지 로드 실패:', err);
      }
    }
  };

  fetchImages();
}, [blocks, workspacePath]); // 블록이 렌더링된 이후마다 실행

  // ── Selection → floating toolbar ───────────────────────────────────────────

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const selectedText = sel.toString();

    // Walk up the DOM from anchorNode to find the block card (has data-block-id)
    let anchorCard: HTMLElement | null =
      sel.anchorNode instanceof HTMLElement
        ? sel.anchorNode
        : (sel.anchorNode?.parentElement ?? null);
    while (anchorCard && !anchorCard.dataset.blockId) {
      anchorCard = anchorCard.parentElement;
    }
    if (!anchorCard?.dataset.blockId) return;

    // Verify the selection end is in the same block (reject cross-block selections)
    let focusCard: HTMLElement | null =
      sel.focusNode instanceof HTMLElement
        ? sel.focusNode
        : (sel.focusNode?.parentElement ?? null);
    while (focusCard && !focusCard.dataset.blockId) {
      focusCard = focusCard.parentElement;
    }
    if (!focusCard || focusCard !== anchorCard) return;

    // Position the toolbar above the selection using viewport coordinates
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setFloatingBar({
      x: rect.left + rect.width / 2,
      y: rect.top - 6,
      blockId: anchorCard.dataset.blockId,
      selectedText,
    });
  }, []);

  // ── Apply markdown format to the selected text in the raw block content ────

  const applyFormat = useCallback(
    (prefix: string, suffix: string) => {
      if (!floatingBar) return;

      const currentBlocks = useBlockStore.getState().blocks;
      const block = currentBlocks.find((b) => b.id === floatingBar.blockId);
      if (!block) { setFloatingBar(null); return; }

      // Find the first occurrence of the selected text in the raw markdown.
      // Note: if the text is already inside markdown syntax chars (e.g. **bold**),
      // the plain-text "bold" may not match the raw source directly — in that case
      // we silently skip and clear the toolbar.
      const matchIdx = block.content.indexOf(floatingBar.selectedText);
      if (matchIdx === -1) { setFloatingBar(null); return; }

      const newContent =
        block.content.slice(0, matchIdx) +
        prefix + floatingBar.selectedText + suffix +
        block.content.slice(matchIdx + floatingBar.selectedText.length);

      updateBlockContent(block.id, newContent);

      // Sync updated content to the document store and persist to disk
      const merged = useBlockStore.getState().getMergedContent();
      updateContent(merged);
      void saveFile();

      setFloatingBar(null);
      window.getSelection()?.removeAllRanges();
    },
    [floatingBar, updateBlockContent, updateContent, saveFile],
  );

  // ── Double-click: jump back to write mode at the clicked block ─────────────

  const handleDoubleClick = useCallback(
    (blockId: string) => {
      focusBlock(blockId, 0);
      setViewMode('write');
    },
    [focusBlock, setViewMode],
  );

  // ── Drag-and-drop reordering ───────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    const flatBlocks = flattenTree(useBlockStore.getState().blocks);
    setDraggedIdx(flatBlocks.findIndex(b => b.id === id));
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const flatBlocks = flattenTree(useBlockStore.getState().blocks);
    const targetIdx = flatBlocks.findIndex(b => b.id === id);
    if (dropTargetIdx !== targetIdx) setDropTargetIdx(targetIdx);
  };

  const handleDrop = async (id: string) => {
    const flatBlocks = flattenTree(useBlockStore.getState().blocks);
    const toIdx = flatBlocks.findIndex(b => b.id === id);
    if (draggedIdx === null || draggedIdx === toIdx || toIdx === -1) {
      setDraggedIdx(null);
      setDropTargetIdx(null);
      return;
    }

    reorderBlocks(draggedIdx, toIdx);
    const merged = useBlockStore.getState().getMergedContent();
    updateContent(merged);
    await saveFile();

    setDraggedIdx(null);
    setDropTargetIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDropTargetIdx(null);
  };

  return (
    <div className="flex-1 overflow-y-auto" onMouseUp={handleMouseUp}>
      <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24">
        {floatingBar && (
          <div
            ref={toolbarRef}
            className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1.5
              rounded-lg shadow-2xl bg-darkPanel border border-darkBorder/80
              backdrop-blur-sm"
            style={{
              left: floatingBar.x,
              top: floatingBar.y,
              transform: 'translate(-50%, -100%)',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {FORMAT_BUTTONS.map((btn) => (
              <button
                key={btn.label}
                title={btn.label}
                onClick={() => applyFormat(btn.prefix, btn.suffix)}
                className={[
                  'flex items-center justify-center w-6 h-6 rounded transition-colors duration-100',
                  btn.yellow
                    ? 'text-yellow-300 hover:bg-yellow-500/20'
                    : 'text-slate-300 hover:bg-white/10',
                ].join(' ')}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {blocks.map((rootBlock) => (
            <ReadBlockNode
              key={rootBlock.id}
              block={rootBlock}
              workspacePath={workspacePath}
              draggedIdx={draggedIdx}
              dropTargetIdx={dropTargetIdx}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onDoubleClick={handleDoubleClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

import { EditorBlock } from '@/entities/block/model/store';

const ReadBlockNode = React.memo<{
  block: EditorBlock;
  workspacePath: string | null;
  draggedIdx: number | null;
  dropTargetIdx: number | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
  onDoubleClick: (id: string) => void;
}>(({ block, workspacePath, draggedIdx, dropTargetIdx, onDragStart, onDragOver, onDrop, onDragEnd, onDoubleClick }) => {
  
  const getLevelStyles = (level: number) => {
    switch(level) {
      case 1: 
        return 'mb-8 bg-transparent'; 
      case 2: 
        return 'mt-6 p-5 rounded-2xl bg-[#141520] border border-darkBorder/40 shadow-md';
      case 3: 
        return 'mt-4 p-4 rounded-xl bg-[#1d1f30] border border-darkBorder/40';
      default: 
        return 'mt-2 pl-2 border-l-2 border-transparent hover:border-darkBorder/40';
    }
  };

  const isBox = block.level > 0;
  
  return (
    <div
      data-block-id={block.id}
      draggable={isBox}
      onDragStart={(e) => isBox && onDragStart(e, block.id)}
      onDragOver={(e) => isBox && onDragOver(e, block.id)}
      onDrop={() => isBox && onDrop(block.id)}
      onDragEnd={onDragEnd}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(block.id);
      }}
      className={[
        'group relative transition-all duration-150',
        isBox ? 'cursor-grab active:cursor-grabbing' : '',
        getLevelStyles(block.level)
      ].join(' ')}
    >
      {isBox && (
         <div className="absolute right-3 top-3.5 opacity-0 group-hover:opacity-25 transition-opacity pointer-events-none">
            <GripVertical size={13} className="text-slate-400" />
         </div>
      )}

      <div
        className={`rv-content ${block.level === 1 ? 'pb-3 mb-5 border-b-2 border-darkBorder/40' : ''}`}
        dangerouslySetInnerHTML={{
          __html: renderBlockToHtml(block.content, workspacePath),
        }}
      />
      
      {block.children.length > 0 && (
        <div className={`block-children ${block.level > 0 ? 'mt-4' : 'mt-1'}`}>
          {block.children.map(child => (
            <ReadBlockNode
              key={child.id}
              block={child}
              workspacePath={workspacePath}
              draggedIdx={draggedIdx}
              dropTargetIdx={dropTargetIdx}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onDoubleClick={onDoubleClick}
            />
          ))}
        </div>
      )}
    </div>
  );
});
