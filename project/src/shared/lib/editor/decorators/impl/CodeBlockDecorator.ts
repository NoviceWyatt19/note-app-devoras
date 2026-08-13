import { Decoration, DecorationSet } from '@codemirror/view';
import { EditorState, Range } from '@codemirror/state';
import { SyntaxDecorator } from '../types';

// Matches opening/closing code fences: ``` or ~~~
const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;

// Inline code: `code`  (single-line, non-empty content)
// [^`\n] explicitly excludes newlines — Strict Regex per BUG-20260810-05
const INLINE_CODE_RE = /`([^`\n]+?)`/g;

// inclusive: false prevents edge-typing from expanding the mark span (BUG-20260810-04)
const INLINE_CODE_MARK = Decoration.mark({ class: 'cm-inline-code', inclusive: false });

/**
 * Decorates inline code (`code`) and code-fence blocks (``` ... ```).
 *
 * BUG-20260810-05 Safety contract:
 *   All Decoration.replace calls are guarded by a same-line check.
 *   `to <= doc.lineAt(from).to` ensures no replace ever spans a newline,
 *   which would trigger CodeMirror's "Decorations that replace line breaks"
 *   RangeError and destroy the tiling engine.
 */
export class CodeBlockDecorator implements SyntaxDecorator {
  readonly name = 'code-block';

  createDecorations(state: EditorState): DecorationSet {
    const doc = state.doc;
    const cursorHead = state.selection.main.head;
    const decs: Range<Decoration>[] = [];

    // Pass 1: Identify fence blocks
    interface Fence {
      openLineFrom: number;
      openLineTo: number;
      closeLineFrom: number | null;
      closeLineTo: number | null;
      fenceChar: string;
      lang: string;
      title: string;
      codeContent: string;
    }
    const fences: Fence[] = [];
    let currentFence: Fence | null = null;

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text;
      const match = FENCE_OPEN_RE.exec(text);

      if (match) {
        const char = match[1][0];
        let rawLang = text.slice(match[0].length).trim();
        let title = '';
        
        // Parse |title|="My Title" or |tile|="My Title" with optional spaces
        const titleMatch = rawLang.match(/\|(title|tile)\|\s*=\s*"([^"]+)"/);
        if (titleMatch) {
          title = titleMatch[2];
          rawLang = rawLang.replace(titleMatch[0], '').trim();
        }

        if (!currentFence) {
          currentFence = {
            openLineFrom: line.from,
            openLineTo: line.to,
            closeLineFrom: null,
            closeLineTo: null,
            fenceChar: char,
            lang: rawLang,
            title: title,
            codeContent: ''
          };
        } else if (char === currentFence.fenceChar) {
          currentFence.closeLineFrom = line.from;
          currentFence.closeLineTo = line.to;
          fences.push(currentFence);
          currentFence = null;
        } else {
          currentFence.codeContent += text + '\n';
        }
      } else if (currentFence) {
        currentFence.codeContent += text + '\n';
      }
    }
    if (currentFence) {
      // Unclosed fence
      fences.push(currentFence);
    }

    // Pass 2: Build decorations
    let currentFenceIdx = 0;
    
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const lineFrom = line.from;
      const lineTo = line.to;
      const text = line.text;

      const fence = fences[currentFenceIdx];
      let inCurrentFence = false;
      
      if (fence && lineFrom >= fence.openLineFrom) {
        const fenceEnd = fence.closeLineTo !== null ? fence.closeLineTo : doc.length;
        if (lineFrom <= fenceEnd) {
          inCurrentFence = true;
        }
        if (fenceEnd === lineTo || (fence.closeLineTo === null && lineTo === doc.length)) {
          currentFenceIdx++; // move to next fence for future lines
        }
      }

      if (inCurrentFence && fence) {
        const isCursorOnOpenFence = cursorHead >= fence.openLineFrom && cursorHead <= fence.openLineTo;
        const isCursorOnCloseFence = fence.closeLineFrom !== null && cursorHead >= fence.closeLineFrom && cursorHead <= fence.closeLineTo!;
        
        // Hide fences unless the cursor is directly on them
        const showOpenFence = isCursorOnOpenFence;
        const showCloseFence = isCursorOnCloseFence;

        // Line styling (background)
        let applyBackground = true;
        
        if (!showOpenFence) {
          if (lineFrom === fence.openLineFrom) {
            applyBackground = false; 
            const widget = new CodeBlockHeaderWidget(fence.lang, fence.codeContent, fence.title);
            
            // Replace the text with an INLINE widget (block: false) so cursor can enter the line
            decs.push(Decoration.replace({ widget, block: false }).range(lineFrom, lineTo));
            // Apply special class to remove padding/margins from the original line wrapper
            decs.push(Decoration.line({ class: 'cm-code-block-widget-line' }).range(lineFrom));
          }
        }
        
        if (!showCloseFence) {
          if (fence.closeLineFrom !== null && lineFrom === fence.closeLineFrom) {
            applyBackground = false; 
            // Hide the text of the closing fence
            decs.push(Decoration.replace({}).range(lineFrom, lineTo));
            // Use 4px hidden fence so it is reachable by arrow keys/clicks
            decs.push(Decoration.line({ class: 'cm-code-block-hidden-fence' }).range(lineFrom));
          }
        }
        
        if (applyBackground) {
          let lineClass = 'cm-code-block-line';
          if (lineFrom === fence.openLineFrom && showOpenFence) {
            lineClass += ' cm-code-block-top';
          } else if (lineFrom === fence.openLineTo + 1 && !showOpenFence) {
            lineClass += ' cm-code-block-flat-top';
            // If it's a 1-line block, apply bottom radius too
            if (fence.closeLineFrom !== null && lineFrom === doc.lineAt(fence.closeLineFrom - 1).from) {
              lineClass += ' cm-code-block-bottom';
            }
          }
          
          if (fence.closeLineFrom !== null) {
            const bottomLineFrom = showCloseFence 
              ? fence.closeLineFrom 
              : (fence.closeLineFrom > 0 ? doc.lineAt(fence.closeLineFrom - 1).from : 0);
            
            if (lineFrom === bottomLineFrom && !(lineFrom === fence.openLineTo + 1 && !showOpenFence)) {
              lineClass += ' cm-code-block-bottom';
            }
          } else if (lineTo === doc.length) {
            lineClass += ' cm-code-block-bottom';
          }
          
          decs.push(Decoration.line({ class: lineClass }).range(lineFrom));
        }
      } else {
        // Regular line — cursor-aware inline code decoration.
        INLINE_CODE_RE.lastIndex = 0;
        let match;
        while ((match = INLINE_CODE_RE.exec(text)) !== null) {
          const s = lineFrom + match.index;
          const e = s + match[0].length;

          // Skip styling if the cursor is touching or inside this span
          if (cursorHead >= s && cursorHead <= e) continue;

          decs.push(Decoration.replace({}).range(s, s + 1));
          decs.push(INLINE_CODE_MARK.range(s + 1, e - 1));
          decs.push(Decoration.replace({}).range(e - 1, e));
        }
      }
    }

    // Decoration.set automatically sorts them properly
    return Decoration.set(decs, true);
  }
}

import { WidgetType } from '@codemirror/view';

class CodeBlockHeaderWidget extends WidgetType {
  constructor(readonly lang: string, readonly code: string, readonly title: string) {
    super();
  }
  
  eq(other: CodeBlockHeaderWidget) {
    return other.lang === this.lang && other.code === this.code && other.title === this.title;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'w-full box-border block';
    container.style.paddingTop = '1rem';
    container.style.paddingLeft = '1rem';
    container.style.paddingRight = '1rem';
    
    const wrap = document.createElement('div');
    wrap.className = 'cm-code-block-header flex items-center justify-between px-4 py-1.5 bg-[#141520] border-b border-white/5 select-none w-full box-border rounded-t-xl border-t border-l border-r border-white/5 relative';
    
    const langSpan = document.createElement('span');
    langSpan.className = 'text-[11px] font-mono text-slate-400 uppercase tracking-wider';
    langSpan.textContent = this.lang || 'plaintext';
    
    wrap.appendChild(langSpan);

    if (this.title) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'text-[12px] font-medium text-slate-300 absolute left-1/2 -translate-x-1/2';
      titleSpan.textContent = this.title;
      wrap.appendChild(titleSpan);
    }

    const btn = document.createElement('button');
    btn.className = 'opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary text-slate-400 rv-copy-btn p-1 flex items-center gap-1 cursor-pointer';
    btn.title = 'Copy';
    btn.dataset.code = this.code;
    btn.innerHTML = `
      <span class="text-[10px] copy-feedback hidden">Copied!</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
    `;
    
    // Add mousedown event for copy right here on the DOM node since it's a widget
    // Using mousedown prevents CodeMirror from stealing focus and hiding the widget before the click registers
    btn.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try {
        await navigator.clipboard.writeText(this.code);
        const feedback = btn.querySelector('.copy-feedback');
        if (feedback) {
          feedback.classList.remove('hidden');
          setTimeout(() => feedback.classList.add('hidden'), 2000);
        }
      } catch (err) {
        console.error('Failed to copy', err);
      }
    });

    wrap.appendChild(langSpan);
    wrap.appendChild(btn);
    container.appendChild(wrap);
    return container;
  }
}
