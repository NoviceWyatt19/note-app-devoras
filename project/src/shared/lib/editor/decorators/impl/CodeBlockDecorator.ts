import { Decoration, DecorationSet } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
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

  createDecorations(state: EditorState, _from: number, _to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();

    // Pass 1: Identify fence blocks
    interface Fence {
      openLineFrom: number;
      openLineTo: number;
      closeLineFrom: number | null;
      closeLineTo: number | null;
      fenceChar: string;
      lang: string;
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
        if (!currentFence) {
          currentFence = {
            openLineFrom: line.from,
            openLineTo: line.to,
            closeLineFrom: null,
            closeLineTo: null,
            fenceChar: char,
            lang: text.slice(match[0].length).trim(),
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
        const fenceEnd = fence.closeLineTo !== null ? fence.closeLineTo : doc.length;
        const isCursorInside = cursorHead >= fence.openLineFrom && cursorHead <= fenceEnd;

        // Line styling (background)
        let applyBackground = true;
        
        // If cursor is OUTSIDE, we apply Live Preview (hide fence markers)
        if (!isCursorInside) {
          if (lineFrom === fence.openLineFrom) {
            applyBackground = false; // Widget will provide styling
            const widget = new CodeBlockHeaderWidget(fence.lang, fence.codeContent);
            builder.add(lineFrom, lineTo, Decoration.replace({ widget, block: true }));
          } else if (fence.closeLineFrom !== null && lineFrom === fence.closeLineFrom) {
            applyBackground = false; // Line is completely hidden
            builder.add(lineFrom, lineTo, Decoration.replace({}));
          }
        }
        
        if (applyBackground) {
          let lineClass = 'cm-code-block-line';
          if (lineFrom === fence.openLineFrom) lineClass += ' cm-code-block-top';
          
          if (fence.closeLineFrom !== null) {
            const bottomLineFrom = isCursorInside 
              ? fence.closeLineFrom 
              : (fence.closeLineFrom > 0 ? doc.lineAt(fence.closeLineFrom - 1).from : 0);
            if (lineFrom === bottomLineFrom) {
              lineClass += ' cm-code-block-bottom';
            }
          } else if (lineTo === doc.length) {
            lineClass += ' cm-code-block-bottom';
          }
          
          builder.add(lineFrom, lineFrom, Decoration.line({ class: lineClass }));
        }
      } else {
        // Regular line — cursor-aware inline code decoration.
        INLINE_CODE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = INLINE_CODE_RE.exec(text)) !== null) {
          const s = lineFrom + m.index;
          const e = s + m[0].length;

          if (e > lineTo) continue;
          if (cursorHead >= s && cursorHead <= e) continue;

          builder.add(s,     s + 1, Decoration.replace({})); 
          builder.add(s + 1, e - 1, INLINE_CODE_MARK);       
          builder.add(e - 1, e,     Decoration.replace({})); 
        }
      }
    }

    return builder.finish();
  }
}

import { WidgetType } from '@codemirror/view';

class CodeBlockHeaderWidget extends WidgetType {
  constructor(readonly lang: string, readonly code: string) {
    super();
  }
  
  eq(other: CodeBlockHeaderWidget) {
    return other.lang === this.lang && other.code === this.code;
  }

  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-code-block-header flex items-center justify-between px-4 py-1.5 bg-[#141520] border-b border-white/5 select-none w-full box-border rounded-t-xl border-t border-l border-r border-white/5';
    
    const langSpan = document.createElement('span');
    langSpan.className = 'text-[11px] font-mono text-slate-400 uppercase tracking-wider';
    langSpan.textContent = this.lang || 'plaintext';
    
    const btn = document.createElement('button');
    btn.className = 'opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary text-slate-400 rv-copy-btn p-1 flex items-center gap-1 cursor-pointer';
    btn.title = 'Copy';
    btn.dataset.code = this.code;
    btn.innerHTML = `
      <span class="text-[10px] copy-feedback hidden">Copied!</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
    `;
    
    // Add click event for copy right here on the DOM node since it's a widget
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // prevent editor from stealing focus/selection if possible
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
    return wrap;
  }
}
