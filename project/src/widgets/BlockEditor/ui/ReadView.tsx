import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Marked } from 'marked';
import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Bold, Italic, Strikethrough, Highlighter, GripVertical } from 'lucide-react';
import { EditorBlock, flattenTree } from '@/entities/block/model/store';
import { useDocumentStore, TabItem } from '@/entities/document/model/store';
import { useEffectiveTabStore } from '@/entities/document/model/useEffectiveTabStore';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { useSettingsStore } from '@/entities/settings/model/store';
import { parseCodeFenceInfo } from '@/shared/lib/markdown/codeFenceInfo';
import { parseLabelAttrs, readTitleSpec } from '@/shared/lib/markdown/inlineAttrs';
import { customSymbolMarkedExtension } from '@/shared/lib/markdown/customSymbolMarked';

// ---------------------------------------------------------------------------
// Marked instance (module-level singleton)
// ---------------------------------------------------------------------------
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

/** 코드펜스 타이틀처럼 사용자 입력이 HTML 문자열에 보간될 때 쓰는 최소 이스케이프. */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const markedParser = new Marked({ gfm: true, breaks: true });

// 커스텀 심볼(`->`, `=>`) 인라인 렌더링 — Write Mode 의 CustomSymbolDecorator 와 같은 레지스트리를 공유한다.
markedParser.use(customSymbolMarkedExtension());

markedParser.use({
  renderer: {
    /** Devoras 확장 이미지 문법:
     *  ![alt | ["title":"제목", "title-position":"top"]](경로)
     *  속성 블록이 없으면 기존 마크다운과 동일하게 <img> 만 출력한다. */
    image(token) {
      const { label: alt, attrs } = parseLabelAttrs(token.text);
      const titleSpec = readTitleSpec(attrs);

      const imgTag = `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(alt)}">`;
      if (!titleSpec) return imgTag;

      const caption =
        `<figcaption class="rv-figure-caption rv-figure-caption-${titleSpec.position}">` +
        `${escapeHtml(titleSpec.title)}</figcaption>`;

      return titleSpec.position === 'top'
        ? `<figure class="rv-figure">${caption}${imgTag}</figure>`
        : `<figure class="rv-figure">${imgTag}${caption}</figure>`;
    },

    code(token) {
      const { text, lang } = token;

      const { lang: rawLang, title } = parseCodeFenceInfo(lang);

      const language = (rawLang && hljs.getLanguage(rawLang)) ? rawLang : 'plaintext';
      const codeText = text || '';
      const highlighted = hljs.highlight(codeText, { language }).value;
      const safeText = escapeHtml(codeText);

      return `
        <div class="code-block-wrapper relative group my-4 mx-4 rounded-xl overflow-hidden border border-darkBorder/40">
          <div class="flex items-center justify-between px-4 py-1.5 bg-darkPanel border-b border-darkBorder/40 relative">
            <span class="text-[11px] font-mono text-mutedText uppercase tracking-wider">${language}</span>
            ${title ? `<span class="text-[12px] font-medium text-body absolute left-1/2 -translate-x-1/2">${escapeHtml(title)}</span>` : ''}
            <button class="opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary text-mutedText rv-copy-btn p-1 flex items-center gap-1 cursor-pointer" data-code="${safeText}" title="Copy">
              <span class="text-[10px] copy-feedback hidden">Copied!</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
          <pre class="!m-0 !bg-code !p-4"><code class="hljs language-${language} text-xs font-mono">${highlighted}</code></pre>
        </div>
      `;
    }
  }
});

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
export function resolveAssetPaths(html: string, workspacePath: string | null): string {
  if (!workspacePath) return html;
  return html.replace(
    /src="(?!https?:\/\/|data:|asset:)([^"]+)"/g,
    (_match: string, imgPath: string) => {
      const absPath = imgPath.startsWith('/')
        ? imgPath
        : `${workspacePath}/${imgPath}`;
      
      return `src="${convertFileSrc(absPath)}"`;
    },
  );
}

/** BUG-20260826-01 L1: DOMPurify 프로필 — KaTeX 는 MathML/SVG 를 사용하므로 함께 허용해야
 *  수식이 과잉 제거되지 않는다. `data-src`/`data-code` 는 이 파일의 커스텀 렌더러가 심는
 *  비표준 속성이라 별도 허용이 필요하다. */
const SANITIZE_CONFIG: DOMPurifyConfig = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_ATTR: ['data-src', 'data-code'],
};

/** renderBlockToHtml 은 블록마다 매 렌더에서 재파싱+새니타이즈되므로 비용이 크다.
 *  content+workspacePath 조합이 같으면 결과도 같으므로 캐시한다(BUG-20260826-01 L1). */
const RENDER_CACHE_LIMIT = 500;
const renderCache = new Map<string, string>();

export function renderBlockToHtml(content: string, workspacePath: string | null): string {
  const cacheKey = `${workspacePath ?? ''} ${content}`;
  const cached = renderCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const html = markedParser.parse(preprocessMd(content)) as string;
  // DOMPurify 는 sanitize 를 먼저 거친다: 기본 URI 허용 목록에 `asset:` 스킴이 없어서
  // resolveAssetPaths 를 먼저 적용하면 그 src 값이 통째로 제거된다.
  const sanitized = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  const resolved = resolveAssetPaths(sanitized, workspacePath);

  if (renderCache.size >= RENDER_CACHE_LIMIT) {
    const oldestKey = renderCache.keys().next().value;
    if (oldestKey !== undefined) renderCache.delete(oldestKey);
  }
  renderCache.set(cacheKey, resolved);

  return resolved;
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

export const ReadView: React.FC<{ tab?: TabItem }> = ({ tab }) => {
  const {
    blocks,
    reorderBlocks,
    focusBlock,
    updateBlockContent,
    setViewMode,
    getMergedContent,
    getFreshBlocks,
  } = useEffectiveTabStore();
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



  // ── Copy Button Delegation ──────────────────────────────────────────────────
  useEffect(() => {
    const handleCopyClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.rv-copy-btn') as HTMLButtonElement;
      if (!btn) return;
      
      const code = btn.dataset.code;
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);
        const feedback = btn.querySelector('.copy-feedback');
        if (feedback) {
          feedback.classList.remove('hidden');
          setTimeout(() => feedback.classList.add('hidden'), 2000);
        }
      } catch (err) {
        console.error('Failed to copy text', err);
      }
    };

    document.addEventListener('click', handleCopyClick);
    return () => document.removeEventListener('click', handleCopyClick);
  }, []);

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

      const currentBlocks = getFreshBlocks();
      const block = flattenTree(currentBlocks).find((b) => b.id === floatingBar.blockId);
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

      // Sync updated content to the document store (no auto disk save)
      const merged = getMergedContent();
      if (tab?.id) {
        useDocumentStore.getState().updateContentForTab(tab.id, merged);
      }

      setFloatingBar(null);
      window.getSelection()?.removeAllRanges();
    },
    [floatingBar, updateBlockContent, getMergedContent, tab?.id],
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
    const flatBlocks = flattenTree(getFreshBlocks());
    setDraggedIdx(flatBlocks.findIndex(b => b.id === id));
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const flatBlocks = flattenTree(getFreshBlocks());
    const targetIdx = flatBlocks.findIndex(b => b.id === id);
    if (dropTargetIdx !== targetIdx) setDropTargetIdx(targetIdx);
  };

  const handleDrop = async (id: string) => {
    const flatBlocks = flattenTree(getFreshBlocks());
    const toIdx = flatBlocks.findIndex(b => b.id === id);
    if (draggedIdx === null || draggedIdx === toIdx || toIdx === -1) {
      setDraggedIdx(null);
      setDropTargetIdx(null);
      return;
    }

    reorderBlocks(draggedIdx, toIdx);
    const merged = getMergedContent();
    if (tab?.id) {
      useDocumentStore.getState().updateContentForTab(tab.id, merged);
    }

    setDraggedIdx(null);
    setDropTargetIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDropTargetIdx(null);
  };

  const { settings } = useSettingsStore();
  const maxWidthStyle = settings.editor.contentMaxWidth > 0 
    ? { maxWidth: `${settings.editor.contentMaxWidth}px`, margin: '0 auto' } 
    : {};

  return (
    <div className="flex-1 overflow-y-auto w-full" onMouseUp={handleMouseUp}>
      <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 mx-auto" style={maxWidthStyle}>
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
                    ? 'text-highlight hover:bg-highlight/20'
                    : 'text-body hover:bg-overlay/10',
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

export const ReadBlockNode = React.memo<{
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
        return 'mt-6 p-5 rounded-2xl bg-darkPanel border border-darkBorder/40 shadow-md';
      case 3: 
        return 'mt-4 p-4 rounded-xl bg-raised border border-darkBorder/40';
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
            <GripVertical size={13} className="text-mutedText" />
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
