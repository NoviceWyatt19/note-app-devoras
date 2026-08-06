import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '../types';
import { useWorkspaceStore } from '@/entities/workspace/model/store';

// ![alt](src) — 이미지 마크다운 패턴 (단일 라인)
const IMG_RE = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;

// ── convertFileSrc 캐시 ─────────────────────────────────────────────────────
let _convertFileSrc: ((path: string) => string) | null = null;

function getFileSrc(absPath: string): string {
  if (_convertFileSrc) return _convertFileSrc(absPath);
  // 비동기 초기화 전 폴백
  return `asset://localhost${encodeURI(absPath)}`;
}

// 앱 시작 시 비동기 초기화
(async () => {
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    _convertFileSrc = convertFileSrc;
  } catch {
    _convertFileSrc = (p) => p;
  }
})();

// ── 이미지 위젯 ────────────────────────────────────────────────────────────
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

  toDOM(): HTMLElement {
    const workspacePath = useWorkspaceStore.getState().workspacePath;

    // 절대 경로 결정
    let absPath: string;
    if (this.src.startsWith('http://') || this.src.startsWith('https://') || this.src.startsWith('data:')) {
      // 외부 URL 또는 data URL — 그대로 사용
      const wrap = document.createElement('span');
      wrap.className = 'cm-image-widget';
      const img = document.createElement('img');
      img.src = this.src;
      img.alt = this.alt;
      img.className = 'cm-image-preview';
      img.style.cssText = 'max-width:100%;max-height:300px;border-radius:4px;margin:4px 0;display:block;';
      img.onerror = () => { wrap.style.display = 'none'; };
      wrap.appendChild(img);
      return wrap;
    } else if (this.src.startsWith('/')) {
      absPath = this.src;
    } else if (workspacePath) {
      absPath = `${workspacePath}/${this.src}`;
    } else {
      absPath = this.src;
    }

    const url = getFileSrc(absPath);

    const wrap = document.createElement('span');
    wrap.className = 'cm-image-widget';

    const img = document.createElement('img');
    img.src = url;
    img.alt = this.alt;
    img.className = 'cm-image-preview';
    img.style.cssText = 'max-width:100%;max-height:300px;border-radius:4px;margin:4px 0;display:block;cursor:default;';
    img.draggable = false;

    // 로드 실패 시 alt 텍스트 표시
    img.onerror = () => {
      const fallback = document.createElement('span');
      fallback.className = 'cm-image-fallback';
      fallback.textContent = `🖼 ${this.alt || '이미지'}`;
      fallback.style.cssText = 'color:#888;font-size:0.85em;display:inline-block;padding:2px 6px;background:#333;border-radius:3px;';
      if (wrap.contains(img)) wrap.replaceChild(fallback, img);
    };

    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ── 데코레이터 구현 ────────────────────────────────────────────────────────
/**
 * CodeMirror 쓰기 모드에서 `![alt](src)` 마크다운을 실제 이미지 위젯으로 렌더링.
 *
 * - 커서가 이미지 마크다운 범위 밖에 있을 때: 인라인 이미지 위젯으로 대체
 * - 커서가 범위 안에 있을 때: 원본 마크다운 텍스트 그대로 표시 (편집 가능)
 */
export class ImageDecorator implements SyntaxDecorator {
  readonly name = 'image';

  createDecorations(view: EditorView, from: number, to: number): DecorationSet {
    const { doc } = view.state;
    const cursorHead = view.state.selection.main.head;
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

        // 커서가 이미지 마크다운 내부에 있으면 위젯을 보여주지 않음 (편집 모드)
        if (cursorHead >= matchStart && cursorHead <= matchEnd) {
          pos = line.to + 1;
          continue;
        }

        // 마크다운 텍스트 전체를 이미지 위젯으로 대체
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

    // from 기준 정렬 (RangeSetBuilder 요구사항)
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
