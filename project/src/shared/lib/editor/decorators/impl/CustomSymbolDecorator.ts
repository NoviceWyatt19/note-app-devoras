import { Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { SyntaxDecorator } from '@/shared/lib/editor/decorators/types';
import {
  CustomSymbolDef,
  createCustomSymbolElement,
  findCustomSymbols,
} from '@/shared/lib/markdown/customSymbols';
import { collectProtectedSpans, isProtected } from '@/shared/lib/markdown/protectedRegions';

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class CustomSymbolWidget extends WidgetType {
  constructor(private readonly def: CustomSymbolDef) {
    super();
  }

  toDOM(): HTMLElement {
    const el = createCustomSymbolElement(this.def);
    el.contentEditable = 'false';
    return el;
  }

  eq(other: CustomSymbolWidget): boolean {
    return other.def.id === this.def.id;
  }

  /** 클릭하면 커서가 심볼 위치로 들어와 원문이 다시 드러나야 하므로 이벤트를 막지 않는다. */
  ignoreEvent(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Decorator
// ---------------------------------------------------------------------------

/**
 * Write Mode 커스텀 심볼 데코레이터 (`->`, `=>` → 인라인 화살표 위젯).
 *
 * 심볼 목록·글리프·매칭 규칙은 전부 `shared/lib/markdown/customSymbols` 레지스트리가,
 * 보호 구간 규칙은 `shared/lib/markdown/protectedRegions` 가 소유한다. 이 클래스는
 * "찾아 준 구간을 CodeMirror 위젯으로 치환"하는 어댑터일 뿐이므로, 심볼이 늘어나도
 * 이 파일은 수정할 필요가 없다.
 *
 * 동작 규칙 (다른 데코레이터와 동일한 관례):
 * - 커서가 토큰 밖 → 화살표 위젯으로 치환
 * - 커서가 토큰 위/경계 → 원문 `->` `=>` 노출 (편집 가능)
 * - 코드·수식·이미지·링크 목적지 내부 → 항상 원문 유지
 */
export class CustomSymbolDecorator implements SyntaxDecorator {
  readonly name = 'custom-symbol';

  createDecorations(state: EditorState, from: number, to: number): DecorationSet {
    const { doc } = state;
    const cursorHead = state.selection.main.head;

    // Devoras 는 블록마다 독립 CodeMirror 인스턴스를 쓰므로 [from, to) 가 짧다.
    const text = doc.sliceString(from, to);
    const protectedSpans = collectProtectedSpans(text, from);
    const builder = new RangeSetBuilder<Decoration>();

    for (const match of findCustomSymbols(text)) {
      const start = from + match.from;
      const end = from + match.to;

      // 커서가 토큰 위에 있으면 원문을 드러내 편집할 수 있게 한다.
      if (cursorHead >= start && cursorHead <= end) continue;
      if (isProtected(protectedSpans, start, end)) continue;

      builder.add(
        start,
        end,
        Decoration.replace({ widget: new CustomSymbolWidget(match.def), bidiIsolate: false }),
      );
    }

    return builder.finish();
  }
}
