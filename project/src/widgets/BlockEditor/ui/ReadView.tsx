import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Marked } from 'marked';
import { invoke } from '@tauri-apps/api/core';
import { Bold, Italic, Strikethrough, Highlighter, GripVertical } from 'lucide-react';
import { useBlockStore } from '@/entities/block/model/store';
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

/** Tauri convertFileSrc — 로컬 절대 경로를 webview에서 로드 가능한 URL로 변환.
 *  Tauri v2에서는 asset://localhost/<path> 를 직접 조합하면 403이 날 수 있음.
 *  convertFileSrc는 Tauri가 공식 지원하는 변환 API로 올바른 URL을 보장. */
let _convertFileSrc: ((path: string, protocol?: string) => string) | null = null;

/** 동기 버전 — 초기화 전에는 직접 조합 방식으로 폴백 (첫 렌더 시에만 발생). */
function fileSrcSync(path: string): string {
  if (_convertFileSrc) return _convertFileSrc(path);
  // 최초 렌더 전 폴백: 직접 조합 (이후 비동기 초기화 후 re-render로 수정됨)
  return `asset://localhost${encodeURI(path)}`;
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

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetIdx !== idx) setDropTargetIdx(idx);
  };

  const handleDrop = async (toIdx: number) => {
    if (draggedIdx === null || draggedIdx === toIdx) {
      setDraggedIdx(null);
      setDropTargetIdx(null);
      return;
    }

    reorderBlocks(draggedIdx, toIdx);
    // getMergedContent reads from the Zustand store synchronously after the reorder
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto" onMouseUp={handleMouseUp}>
      <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24">

        {/* ── Floating format toolbar (fixed to viewport, above selection) ── */}
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

        {/* ── Block cards ── */}
        <div className="space-y-3">
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              data-block-id={block.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              onDoubleClick={() => handleDoubleClick(block.id)}
              className={[
                'group relative rounded-xl border transition-all duration-150',
                'bg-darkPanel/70 select-text',
                'cursor-grab active:cursor-grabbing',
                draggedIdx === idx
                  ? 'opacity-40 scale-[0.98]'
                  : 'opacity-100',
                dropTargetIdx === idx && draggedIdx !== null && draggedIdx !== idx
                  ? 'border-indigo-500/60 shadow-[0_0_0_2px_rgba(99,102,241,0.18)]'
                  : 'border-darkBorder/40 hover:border-darkBorder/70',
              ].join(' ')}
            >
              {/* Drag handle (shows on hover) */}
              <div className="absolute right-3 top-3.5 opacity-0 group-hover:opacity-25
                transition-opacity pointer-events-none">
                <GripVertical size={13} className="text-slate-400" />
              </div>

              {/* Rendered markdown content */}
              <div
                className="rv-content px-7 py-5"
                // The content is local markdown authored by the user — XSS is not a concern
                dangerouslySetInnerHTML={{
                  __html: renderBlockToHtml(block.content, workspacePath),
                }}
              />

              {/* Hint: double-click to edit (shows on hover) */}
              <div className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-20
                transition-opacity select-none pointer-events-none text-[10px] text-slate-400">
                더블클릭으로 편집
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
