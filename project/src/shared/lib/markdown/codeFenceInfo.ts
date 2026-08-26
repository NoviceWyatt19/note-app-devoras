/**
 * Devoras 확장 코드펜스 문법 파서.
 *
 *   ```lang|title|="제목"
 *   ```lang |title|="제목"
 *   ```|title|="제목"
 *
 * `|tile|` 오타 별칭과 작은따옴표/따옴표 없는 값도 허용한다.
 *
 * 단일 진실 공급원(Single Source of Truth): Read Mode(marked 렌더러),
 * Write Mode(CodeBlockDecorator), CodeMirror 코드펜스 언어 매칭이 모두
 * 이 함수를 사용해야 세 경로의 해석이 어긋나지 않는다.
 */
export interface CodeFenceInfo {
  /** 하이라이팅에 쓰일 언어 이름. 없으면 빈 문자열. */
  lang: string;
  /** 코드블록 헤더 가운데에 표시할 제목. 없으면 빈 문자열. */
  title: string;
}

// |title| = "..." | '...' | bare-token
const TITLE_RE = /\|\s*(?:title|tile)\s*\|\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s|]+))/i;

export function parseCodeFenceInfo(info: string | null | undefined): CodeFenceInfo {
  const raw = (info ?? '').trim();
  if (!raw) return { lang: '', title: '' };

  // 언어 이름은 항상 첫 '|' 이전 구간에서만 취한다.
  // 이렇게 해야 |title| 문법이 틀렸더라도(예: |titel|=...) 언어가 사라지지 않는다.
  const pipeIdx = raw.indexOf('|');
  const langPart = pipeIdx === -1 ? raw : raw.slice(0, pipeIdx);
  const lang = langPart.trim().split(/\s+/)[0] ?? '';

  if (pipeIdx === -1) return { lang, title: '' };

  const m = raw.slice(pipeIdx).match(TITLE_RE);
  const title = m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : '';
  return { lang, title };
}
