/**
 * 커스텀 심볼 치환을 금지할 "보호 구간" 계산.
 *
 * 순수 문자열 함수로 분리해 둔 이유는 두 가지다.
 * - Write Mode(CodeMirror)와 하네스 테스트가 같은 규칙을 공유한다.
 * - 심볼이 늘어나도 보호 규칙은 한 곳에서만 관리된다.
 */

export interface TextSpan {
  /** 시작 오프셋(포함). */
  readonly from: number;
  /** 끝 오프셋(제외). */
  readonly to: number;
}

const CODE_FENCE_RE = /^(\s*)(`{3,}|~{3,})/;
const MATH_FENCE_RE = /^\$\$\s*$/;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const MATH_RE = /\$\$[^$\n]+?\$\$|(?<!\$)\$[^$\n]+?\$(?!\$)/g;
const IMAGE_RE = /!\[(?:[^[\]\n]|\[[^[\]\n]*\])*\]\([^)\n]+\)/g;
/** 링크는 목적지 `](url)` 만 보호한다 — 링크 텍스트 안의 화살표는 렌더링해도 안전하다. */
const LINK_DEST_RE = /\]\([^)\n]+\)/g;

const INLINE_RULES = [INLINE_CODE_RE, MATH_RE, IMAGE_RE, LINK_DEST_RE];

/**
 * `text`(여러 줄 가능) 안에서 심볼 렌더링을 하지 말아야 할 구간을 모은다.
 *
 * 보호 대상과 그 이유:
 * - **코드펜스 / 인라인 코드** — `ptr->field`, `x => x + 1` 은 코드지 화살표가 아니다.
 * - **수식(`$…$`, `$$…$$`)** — LatexDecorator 가 구간 전체를 KaTeX 위젯으로 치환한다.
 * - **이미지 `![alt](url)`** — ImageDecorator 가 구간 전체를 치환한다.
 * - **링크 목적지 `](url)`** — HyperlinkDecorator 가 마커/URL 을 숨긴다.
 *
 * 뒤의 세 가지는 의미 보존뿐 아니라 충돌 회피 목적이다. CodeMirror 는 서로 겹치는
 * `Decoration.replace` 를 허용하지 않으므로, 이미 치환되는 구간 안에 위젯을 또
 * 넣으면 에디터가 깨진다.
 *
 * @param offset 반환 오프셋에 더할 기준값 (문서 부분 슬라이스를 넘길 때 사용).
 */
export function collectProtectedSpans(text: string, offset = 0): TextSpan[] {
  const spans: TextSpan[] = [];

  let inCodeFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let inMathFence = false;

  let lineStart = 0;
  while (lineStart <= text.length) {
    const newlineAt = text.indexOf('\n', lineStart);
    const lineEnd = newlineAt === -1 ? text.length : newlineAt;
    const line = text.slice(lineStart, lineEnd);

    const pushLine = (): void => {
      spans.push({ from: offset + lineStart, to: offset + lineEnd });
    };

    const fence = CODE_FENCE_RE.exec(line);
    if (fence && !inMathFence) {
      const marker = fence[2];
      if (!inCodeFence) {
        inCodeFence = true;
        fenceChar = marker[0];
        fenceLen = marker.length;
        pushLine();
        lineStart = lineEnd + 1;
        continue;
      }
      if (marker[0] === fenceChar && marker.length >= fenceLen) {
        inCodeFence = false;
        pushLine();
        lineStart = lineEnd + 1;
        continue;
      }
    }
    if (inCodeFence) {
      pushLine();
      lineStart = lineEnd + 1;
      continue;
    }

    // 단독 `$$` 라인은 수식 블록의 열기/닫기 펜스다.
    if (MATH_FENCE_RE.test(line)) {
      inMathFence = !inMathFence;
      pushLine();
      lineStart = lineEnd + 1;
      continue;
    }
    if (inMathFence) {
      pushLine();
      lineStart = lineEnd + 1;
      continue;
    }

    for (const re of INLINE_RULES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        spans.push({
          from: offset + lineStart + m.index,
          to: offset + lineStart + m.index + m[0].length,
        });
      }
    }

    if (newlineAt === -1) break;
    lineStart = lineEnd + 1;
  }

  return spans;
}

/** `[from, to)` 가 보호 구간 중 하나라도 겹치는지. */
export function isProtected(spans: readonly TextSpan[], from: number, to: number): boolean {
  return spans.some((s) => from < s.to && to > s.from);
}
