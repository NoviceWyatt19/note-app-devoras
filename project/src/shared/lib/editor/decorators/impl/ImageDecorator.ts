import { Decoration, DecorationSet, WidgetType, EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';
import { useWorkspaceStore } from '@/entities/workspace/model/store';
import { convertFileSrc } from '@tauri-apps/api/core';

const IMG_RE = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(view: EditorView): HTMLElement {
    const workspacePath = useWorkspaceStore.getState().workspacePath;
    const wrap = document.createElement('span');
    wrap.className = 'cm-image-widget';

    const img = document.createElement('img');
    // 로딩 중일 때는 투명 픽셀을 렌더링하여 UI 찌그러짐 방지
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    img.alt = this.alt;
    img.className = 'cm-image-preview transition-opacity duration-200 opacity-0';
    img.style.cssText = 'max-width:100%;max-height:300px;border-radius:4px;margin:4px 0;display:block;cursor:default;';
    img.draggable = false;
    wrap.appendChild(img);

    img.onload = () => {
      view.requestMeasure();
    };

    // 외부 URL이면 그대로 사용, 로컬이면 Tauri asset:// 프로토콜 사용
    if (this.src.startsWith('http://') || this.src.startsWith('https://') || this.src.startsWith('data:') || this.src.startsWith('asset:')) {
      img.src = this.src;
      img.classList.remove('opacity-0');
    } else {
      const absPath = this.src.startsWith('/') ? this.src : `${workspacePath}/${this.src}`;
      img.src = convertFileSrc(absPath);
      img.classList.remove('opacity-0');
    }

    return wrap;
  }

  ignoreEvent(): boolean { return false; }
}

export class ImageDecorator implements SyntaxDecorator {
  readonly name = 'image';
  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();
    const ranges: Array<{ from: number; to: number; deco: Decoration }> = [];

    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const lineFrom = Math.max(line.from, from);
      const lineTo = Math.min(line.to, to);
      const text = doc.sliceString(lineFrom, lineTo);

      IMG_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMG_RE.exec(text)) !== null) {
        const matchStart = lineFrom + m.index;
        const matchEnd = matchStart + m[0].length;
        const alt = m[1];
        const src = m[2];

        if (cursorHead >= matchStart && cursorHead <= matchEnd) {
          pos = line.to + 1;
          continue;
        }
        ranges.push({
          from: matchStart,
          to: matchEnd,
          deco: Decoration.replace({
            widget: new ImageWidget(src, alt),
            block: false,
          }),
        });
      }
      pos = line.to + 1;
    }
    ranges.sort((a, b) => a.from !== b.from ? a.from - b.from : a.to - b.to);
    let lastTo = -1;
    for (const r of ranges) {
      if (r.from >= lastTo) {
        builder.add(r.from, r.to, r.deco);
        lastTo = r.to;
      }
    }
    return builder.finish();
  }
}