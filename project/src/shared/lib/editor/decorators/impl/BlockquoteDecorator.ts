import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';
import { Marked } from 'marked';

// Create a local marked parser for blockquotes (simple GFM)
const markedParser = new Marked({ gfm: true, breaks: true });

// We want to match any line that starts with >
const BLOCKQUOTE_RE = /^>\s?(.*)$/;

class BlockquoteWidget extends WidgetType {
  constructor(public content: string) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-blockquote-widget-block rv-content';
    span.style.display = 'inline-block';
    span.style.width = '100%';
    span.contentEditable = 'false';

    // Parse the inner text using marked.
    // The content is the raw markdown (e.g. `> hello\n> world`).
    // marked handles the blockquote tags natively!
    try {
      span.innerHTML = markedParser.parse(this.content) as string;
    } catch {
      span.textContent = this.content;
    }

    return span;
  }

  eq(other: BlockquoteWidget): boolean {
    return this.content === other.content;
  }

  ignoreEvent() {
    return false;
  }
}

export class BlockquoteDecorator implements SyntaxDecorator {
  readonly name = 'blockquote';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const cursorHead = view.state.selection.main.head;
    
    interface DR { from: number; to: number; deco: Decoration; }
    const ranges: DR[] = [];

    let bqStartLine = -1;
    let bqLines: string[] = [];
    let bqEndLine = -1;

    // Helper to commit a blockquote group
    const commitBlockquote = () => {
      if (bqStartLine === -1) return;
      
      const startPos = doc.line(bqStartLine).from;
      const endPos = doc.line(bqEndLine).to;
      const content = bqLines.join('\n');
      
      const cursorInside = cursorHead >= startPos && cursorHead <= endPos;
      
      if (!cursorInside) {
        // Live preview: hide the raw markdown and replace with widget
        ranges.push({
          from: startPos,
          to: endPos,
          deco: Decoration.replace({ widget: new BlockquoteWidget(content), bidiIsolate: false })
        });
      } else {
        // Edit mode: reveal raw markdown, but keep basic line styles so it looks distinct
        for (let i = bqStartLine; i <= bqEndLine; i++) {
          const line = doc.line(i);
          let blockClass = 'cm-blockquote-single';
          if (bqStartLine !== bqEndLine) {
            if (i === bqStartLine) blockClass = 'cm-blockquote-top';
            else if (i === bqEndLine) blockClass = 'cm-blockquote-bottom';
            else blockClass = 'cm-blockquote-middle';
          }
          ranges.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: `cm-blockquote-line ${blockClass}` })
          });
        }
      }
      
      bqStartLine = -1;
      bqEndLine = -1;
      bqLines = [];
    };

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineText = doc.sliceString(line.from, line.to);
      const match = BLOCKQUOTE_RE.exec(lineText);

      if (match) {
        if (bqStartLine === -1) {
          bqStartLine = line.number;
        }
        bqEndLine = line.number;
        bqLines.push(lineText);
      } else {
        commitBlockquote();
      }
      pos = line.to + 1;
    }
    commitBlockquote(); // flush any remaining

    // Sort by from
    ranges.sort((a, b) => a.from - b.from);

    const builder = new RangeSetBuilder<Decoration>();
    for (const r of ranges) {
      builder.add(r.from, r.to, r.deco);
    }

    return builder.finish();
  }
}
