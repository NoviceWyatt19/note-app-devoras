import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { customSymbolMarkedExtension } from './customSymbolMarked';

/**
 * Write Mode 테이블 미리보기 전용 렌더러.
 *
 * Read Mode(`ReadView.tsx`)의 `markedParser` 와는 별도 인스턴스다 — GFM 표의 셀은
 * 한 줄짜리 인라인 콘텐츠만 담을 수 있어(코드펜스·이미지 캡션 같은 블록 확장이
 * 들어갈 수 없다) Read Mode 전용 렌더러(하이라이트.js, 워크스페이스 자산 경로
 * 해석)를 그대로 끌어오면 `shared` 가 `widgets/BlockEditor` 를 참조하게 되어
 * 레이어 역전이 생긴다. 표에서 실제로 쓰이는 인라인 문법(굵게·기울임·링크·
 * 인라인 코드·커스텀 심볼·`==하이라이트==`)만 동일하게 재현한다.
 */
const tableMarked = new Marked({ gfm: true, breaks: true });
tableMarked.use(customSymbolMarkedExtension());

function preprocessInline(md: string): string {
  return md.replace(/==([\s\S]+?)==/g, '<mark>$1</mark>');
}

export function renderTableMarkdown(raw: string): string {
  const html = tableMarked.parse(preprocessInline(raw)) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
