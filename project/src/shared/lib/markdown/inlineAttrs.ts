/**
 * Devoras 확장 인라인 속성 문법 파서.
 *
 *   ![대체텍스트 | ["title":"제목", "title-position":"top"]](경로)
 *   [링크텍스트 | ["title":"제목"]](주소)          ← 하이퍼링크 확장 시 동일 파서 재사용
 *
 * 라벨(`[]` 안쪽) 끝에 `| [ "key":"value", ... ]` 블록을 붙여 속성을 전달한다.
 * 속성을 대괄호 한 덩어리로 묶었기 때문에 `img-size`, `img-position` 같은 키가
 * 추가되어도 파서를 고칠 필요 없이 키만 더 읽으면 된다.
 *
 * 이미지/링크/코드펜스가 각자 정규식을 들고 있으면 해석이 어긋나므로
 * 라벨 해석은 반드시 이 모듈을 거친다. (참고: codeFenceInfo.ts 도 같은 원칙)
 */

export type InlineAttrs = Record<string, string>;

export interface ParsedLabel {
  /** `|` 앞부분. 이미지의 alt, 링크의 표시 텍스트. */
  label: string;
  /** 소문자로 정규화된 키 → 값. 속성 블록이 없으면 빈 객체. */
  attrs: InlineAttrs;
}

/** 라벨 맨 끝의 `| [ ... ]` 블록. 끝에만 허용해야 본문 속 `|` 와 충돌하지 않는다. */
const ATTR_BLOCK_RE = /\|\s*\[([^[\]]*)\]\s*$/;

/** 블록 안의 `"key" : "value"` 쌍. */
const PAIR_RE = /"([^"]+)"\s*:\s*"([^"]*)"/g;

export function parseLabelAttrs(rawLabel: string | null | undefined): ParsedLabel {
  const raw = rawLabel ?? '';
  const block = raw.match(ATTR_BLOCK_RE);
  if (!block) return { label: raw.trim(), attrs: {} };

  const attrs: InlineAttrs = {};
  PAIR_RE.lastIndex = 0;
  let pair: RegExpExecArray | null;
  while ((pair = PAIR_RE.exec(block[1])) !== null) {
    attrs[pair[1].trim().toLowerCase()] = pair[2].trim();
  }

  return { label: raw.slice(0, block.index).trim(), attrs };
}

// ---------------------------------------------------------------------------
// title / title-position
// ---------------------------------------------------------------------------

export type TitlePosition = 'top' | 'bottom';

export interface TitleSpec {
  title: string;
  position: TitlePosition;
}

/** `title` 이 없으면 null. `title-position` 이 없거나 값이 이상하면 'bottom'. */
export function readTitleSpec(attrs: InlineAttrs): TitleSpec | null {
  const title = attrs['title'];
  if (!title) return null;
  const position = attrs['title-position']?.toLowerCase() === 'top' ? 'top' : 'bottom';
  return { title, position };
}
