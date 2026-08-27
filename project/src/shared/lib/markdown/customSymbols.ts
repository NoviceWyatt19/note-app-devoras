/**
 * Devoras 커스텀 심볼 레지스트리 (Custom Symbol Registry)
 *
 * function_roadmap.md → Phase 6 「인라인 스마트 커스텀 심볼」의 **선구현(pre-implementation)**.
 * 현재는 화살표 두 종(`->`, `=>`)만 내장 심볼로 제공하지만, 최종 형태(사용자가
 * 심볼의 의미·기능을 직접 정의하고 툴팁으로 확인하는 위젯)로 확장할 수 있도록
 * "정의(데이터)"와 "렌더링(글리프)"·"탐색(매처)"을 분리해 두었다.
 *
 * ## 확장 지점
 * - **새 내장 심볼 추가**: {@link BUILTIN_CUSTOM_SYMBOLS} 배열에 정의 한 줄 추가.
 *   → Write Mode(CustomSymbolDecorator)·Read Mode(marked 확장) 양쪽에 자동 반영된다.
 * - **사용자 정의 심볼**: 추후 워크스페이스 설정에서 읽은 정의를 같은
 *   {@link CustomSymbolDef} 형태로 만들어 {@link registerCustomSymbols} 로 주입하면 된다.
 * - **툴팁/인터랙션**: 정의에 이미 `label`·`description` 이 있으므로, 위젯의
 *   호버 툴팁(로드맵 요구사항)은 이 필드를 그대로 사용하면 된다. 현재는 최소
 *   구현으로 네이티브 `title` 속성에 연결해 둔다.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 심볼을 그리는 벡터 글리프. 높이는 {@link GLYPH_HEIGHT} 로 고정, 폭만 가변. */
export interface CustomSymbolGlyph {
  /** viewBox 폭 (글리프 단위). 높이는 항상 GLYPH_HEIGHT. */
  readonly width: number;
  /** 현재 텍스트 색(currentColor)으로 그려지는 `<path d="...">` 목록. */
  readonly paths: readonly string[];
  readonly strokeWidth: number;
}

/** 하나의 커스텀 심볼 정의. */
export interface CustomSymbolDef {
  /** 안정적인 식별자. DOM `data-symbol-id`, 위젯 비교(eq)에 사용된다. */
  readonly id: string;
  /** 소스 마크다운에 그대로 적히는 리터럴 토큰. 예: `->` */
  readonly token: string;
  /** 접근성 레이블 / 툴팁 제목. */
  readonly label: string;
  /** 심볼의 의미. 향후 호버 툴팁 본문으로 사용된다. */
  readonly description: string;
  readonly glyph: CustomSymbolGlyph;
}

/** 텍스트에서 발견된 심볼 1건. */
export interface CustomSymbolMatch {
  /** 토큰 시작 오프셋(포함). */
  readonly from: number;
  /** 토큰 끝 오프셋(제외). */
  readonly to: number;
  readonly def: CustomSymbolDef;
}

// ---------------------------------------------------------------------------
// Built-in symbols
// ---------------------------------------------------------------------------

/** 모든 글리프의 viewBox 높이. 폰트 크기에 상대적으로 스케일된다. */
export const GLYPH_HEIGHT = 12;

/** 렌더링 시 글리프 높이(em). 본문 글자와 시각적 무게를 맞춘 값. */
const GLYPH_EM_HEIGHT = 0.8;

export const BUILTIN_CUSTOM_SYMBOLS: readonly CustomSymbolDef[] = [
  {
    id: 'arrow-single',
    token: '->',
    label: '화살표 (→)',
    description: '단선 화살표 — 흐름·이동·다음 단계를 나타낸다.',
    glyph: {
      width: 20,
      strokeWidth: 1.7,
      paths: [
        'M2.6 6 H16.9',          // 축(shaft)
        'M12.8 2.2 L17.2 6 L12.8 9.8', // 촉(head)
      ],
    },
  },
  {
    id: 'arrow-double',
    token: '=>',
    label: '이중 화살표 (⇒)',
    description: '쌍선 화살표 — 귀결·함의·강한 인과를 나타낸다.',
    glyph: {
      width: 20,
      strokeWidth: 1.45,
      paths: [
        'M2.6 4.2 H14.7',        // 위쪽 축
        'M2.6 7.8 H14.7',        // 아래쪽 축
        'M12.8 1.9 L17.2 6 L12.8 10.1', // 촉(head)
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Registry (mutable — 추후 사용자 정의 심볼 주입 지점)
// ---------------------------------------------------------------------------

let registry: readonly CustomSymbolDef[] = BUILTIN_CUSTOM_SYMBOLS;
/** 최장 일치를 보장하기 위해 토큰 길이 내림차순으로 정렬해 둔 사본. */
let byTokenLengthDesc: readonly CustomSymbolDef[] = [];
let scanRe: RegExp = /(?!)/g;

function rebuildIndex(): void {
  // 긴 토큰 우선 — 접두사가 겹치는 심볼(`=>` vs `=>>`)이 추가돼도 최장 일치가 된다.
  byTokenLengthDesc = [...registry].sort((a, b) => b.token.length - a.token.length);
  const alternatives = byTokenLengthDesc.map((d) => escapeRegExp(d.token));
  scanRe = alternatives.length > 0
    ? new RegExp(`(?:${alternatives.join('|')})`, 'g')
    : /(?!)/g;
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 심볼 목록을 교체한다. (내장 심볼 + 사용자 정의 심볼 병합 지점)
 * 로드맵의 "사용자가 직접 정의하는 심볼" 단계에서 설정 로더가 호출하게 된다.
 */
export function registerCustomSymbols(defs: readonly CustomSymbolDef[]): void {
  registry = defs;
  rebuildIndex();
}

export function getCustomSymbols(): readonly CustomSymbolDef[] {
  return registry;
}

export function getCustomSymbolById(id: string): CustomSymbolDef | undefined {
  return registry.find((d) => d.id === id);
}

rebuildIndex();

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * 토큰 바로 앞/뒤에 오면 심볼로 보지 않을 문자들.
 *
 * `-->`(HTML 주석 종료), `<->`, `==>`, `->>` 처럼 화살표 글자가 연달아 붙은
 * 표기는 사용자가 의도한 다른 기호일 가능성이 높으므로 원문을 보존한다.
 */
const ADJACENCY_BLOCKERS = new Set(['-', '=', '<', '>']);

function isBlocked(ch: string): boolean {
  return ch.length > 0 && ADJACENCY_BLOCKERS.has(ch);
}

/**
 * `text[index]` 위치에서 시작하는 심볼을 반환한다. 인접 문자 가드까지 적용.
 * `prevCharOverride` 를 주면 `index` 앞 문자 대신 그 값을 경계 판정에 쓴다
 * (marked 처럼 앞선 텍스트가 다른 토큰으로 잘려 나간 경우에 필요).
 */
export function matchCustomSymbolAt(
  text: string,
  index: number,
  prevCharOverride?: string,
): CustomSymbolDef | null {
  const prevChar = prevCharOverride !== undefined
    ? prevCharOverride
    : (index > 0 ? text[index - 1] : '');
  if (isBlocked(prevChar)) return null;

  for (const def of byTokenLengthDesc) {
    if (!text.startsWith(def.token, index)) continue;
    const nextChar = text[index + def.token.length] ?? '';
    if (isBlocked(nextChar)) return null;
    return def;
  }
  return null;
}

/** `text` 안의 모든 심볼을 앞에서부터 찾아 반환한다. */
export function findCustomSymbols(text: string): CustomSymbolMatch[] {
  const found: CustomSymbolMatch[] = [];
  scanRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = scanRe.exec(text)) !== null) {
    const def = matchCustomSymbolAt(text, m.index);
    if (def) {
      found.push({ from: m.index, to: m.index + def.token.length, def });
      scanRe.lastIndex = m.index + def.token.length;
    }
  }
  return found;
}

/** `text` 안의 첫 심볼 위치. 없으면 -1. (marked `start()` 훅용) */
export function findFirstCustomSymbolIndex(text: string): number {
  const [first] = findCustomSymbols(text);
  return first ? first.from : -1;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** 심볼 위젯 래퍼 클래스. Write/Read 모드가 동일한 클래스를 공유한다. */
export const CUSTOM_SYMBOL_CLASS = 'dv-symbol';

function glyphSizeStyle(glyph: CustomSymbolGlyph): string {
  const width = (glyph.width / GLYPH_HEIGHT) * GLYPH_EM_HEIGHT;
  return `height:${GLYPH_EM_HEIGHT}em;width:${width.toFixed(3)}em`;
}

/**
 * 심볼의 인라인 SVG 마크업을 만든다.
 *
 * 반환 문자열은 전적으로 레지스트리(우리 소유의 상수)에서 생성되며 사용자
 * 입력이 보간되지 않는다 — `innerHTML` 로 주입해도 안전하다.
 */
export function renderCustomSymbolHtml(def: CustomSymbolDef): string {
  const { glyph } = def;
  const paths = glyph.paths.map((d) => `<path d="${d}"/>`).join('');
  return (
    `<span class="${CUSTOM_SYMBOL_CLASS}" data-symbol-id="${def.id}" title="${def.label} — ${def.description}">` +
    `<svg viewBox="0 0 ${glyph.width} ${GLYPH_HEIGHT}" style="${glyphSizeStyle(glyph)}"` +
    ` fill="none" stroke="currentColor" stroke-width="${glyph.strokeWidth}"` +
    ` stroke-linecap="round" stroke-linejoin="round"` +
    ` role="img" aria-label="${def.label}">${paths}</svg>` +
    `</span>`
  );
}

/** {@link renderCustomSymbolHtml} 의 DOM 버전 (CodeMirror 위젯용). */
export function createCustomSymbolElement(def: CustomSymbolDef): HTMLElement {
  const host = document.createElement('span');
  host.innerHTML = renderCustomSymbolHtml(def);
  return host.firstElementChild as HTMLElement;
}
