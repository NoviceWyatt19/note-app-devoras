import type { MarkedExtension, Tokens, TokenizerAndRendererExtension } from 'marked';

import {
  findFirstCustomSymbolIndex,
  getCustomSymbolById,
  matchCustomSymbolAt,
  renderCustomSymbolHtml,
} from './customSymbols';

/**
 * Read Mode 용 커스텀 심볼 렌더러 (marked 인라인 확장).
 *
 * 전처리(문자열 치환)가 아니라 **인라인 토크나이저**로 구현한 이유:
 * `->` / `=>` 는 코드에서 극히 흔한 표기라서(`ptr->field`, `x => x + 1`) 단순
 * 치환을 하면 코드펜스·인라인 코드 안까지 화살표로 바뀐다. 인라인 레벨 확장은
 * marked 가 코드 토큰을 먼저 소비한 뒤에만 호출되므로 코드 영역은 자연히 보존된다.
 */

const TOKEN_TYPE = 'customSymbol';

interface CustomSymbolToken extends Tokens.Generic {
  type: typeof TOKEN_TYPE;
  raw: string;
  symbolId: string;
}

const extension: TokenizerAndRendererExtension = {
  name: TOKEN_TYPE,
  level: 'inline',

  /** marked 가 텍스트 토큰을 어디서 끊어야 할지 알려 주는 훅. */
  start(src: string): number | undefined {
    const idx = findFirstCustomSymbolIndex(src);
    return idx >= 0 ? idx : undefined;
  },

  tokenizer(src: string, tokens: Tokens.Generic[]): CustomSymbolToken | undefined {
    // 앞선 문자는 이미 다른 토큰으로 잘려 나갔을 수 있으므로 직전 토큰 raw 의
    // 마지막 글자를 경계 판정에 넘겨 준다 (`-->` 같은 표기 보호).
    const prevRaw = tokens.length > 0 ? (tokens[tokens.length - 1].raw ?? '') : '';
    const def = matchCustomSymbolAt(src, 0, prevRaw.slice(-1));
    if (!def) return undefined;

    return { type: TOKEN_TYPE, raw: def.token, symbolId: def.id };
  },

  renderer(token: Tokens.Generic): string {
    const def = getCustomSymbolById((token as CustomSymbolToken).symbolId);
    return def ? renderCustomSymbolHtml(def) : token.raw;
  },
};

/** `markedParser.use(customSymbolMarkedExtension())` 로 등록한다. */
export function customSymbolMarkedExtension(): MarkedExtension {
  return { extensions: [extension] };
}
