/* eslint-disable no-restricted-imports --
 * 하네스는 번들러 없이 Node 로 단독 실행되므로 `@/` 별칭이 해석되지 않는다.
 * 소스를 그대로 import 하기 위해 이 파일만 상대 경로를 쓴다. */
/**
 * custom_symbol_harness.ts
 *
 * 커스텀 심볼(`->`, `=>`) 문법의 매칭 규칙과 Read Mode 렌더링을 검증하는 하네스.
 * 실제 소스를 그대로 import 하므로 로직 복사본이 없다 (Node.js 단독 실행).
 *
 * 실행: pnpm test:symbol
 *
 * 검증 항목:
 *  T1.  `->` 단선 화살표 인식
 *  T2.  `=>` 쌍선 화살표 인식
 *  T3.  한 줄에 여러 심볼 인식
 *  T4.  `-->` (HTML 주석 종료) 는 심볼로 보지 않음
 *  T5.  `==>` / `<->` / `->>` 인접 가드
 *  T6.  Read Mode: 문단 안 `->` → SVG 위젯
 *  T7.  Read Mode: 인라인 코드 안 화살표는 원문 유지
 *  T8.  Read Mode: 코드펜스 안 화살표는 원문 유지
 *  T9.  Read Mode: 강조/제목 안에서도 렌더링
 *  T10. 레지스트리 확장성 — registerCustomSymbols 로 새 심볼 주입
 *  T11. 보호 구간 — 인라인 코드
 *  T12. 보호 구간 — 코드펜스 블록 전체
 *  T13. 보호 구간 — 인라인/블록 수식 (LatexDecorator replace 충돌 방지)
 *  T14. 보호 구간 — 이미지 문법 전체 (ImageDecorator replace 충돌 방지)
 *  T15. 보호 구간 — 링크 목적지만 보호, 링크 텍스트는 렌더링
 *  T16. 보호 구간 — 일반 문단은 보호되지 않음
 */

import { Marked } from 'marked';
import {
  BUILTIN_CUSTOM_SYMBOLS,
  findCustomSymbols,
  registerCustomSymbols,
  type CustomSymbolDef,
} from '../customSymbols.ts';
import { customSymbolMarkedExtension } from '../customSymbolMarked.ts';
import { collectProtectedSpans, isProtected } from '../protectedRegions.ts';

const parser = new Marked({ gfm: true, breaks: true });
parser.use(customSymbolMarkedExtension());

const render = (md: string): string => parser.parse(md) as string;
const tokensOf = (text: string): string[] => findCustomSymbols(text).map((m) => m.def.token);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

console.log('\n═══ Custom Symbol Harness ═══\n');

// T1 / T2
check('T1  "A -> B" 에서 -> 1개 인식', JSON.stringify(tokensOf('A -> B')) === '["->"]');
check('T2  "A => B" 에서 => 1개 인식', JSON.stringify(tokensOf('A => B')) === '["=>"]');

// T3
check(
  'T3  "a -> b => c" 다중 인식',
  JSON.stringify(tokensOf('a -> b => c')) === '["->","=>"]',
  JSON.stringify(tokensOf('a -> b => c')),
);

// T4 / T5
check('T4  "<!-- x -->" 미인식', tokensOf('<!-- x -->').length === 0, JSON.stringify(tokensOf('<!-- x -->')));
check(
  'T5  "==>", "<->", "->>" 미인식',
  tokensOf('a ==> b').length === 0 && tokensOf('a <-> b').length === 0 && tokensOf('a ->> b').length === 0,
);

// T6
const t6 = render('입력 -> 출력');
check('T6  문단 내 -> → SVG 렌더링', t6.includes('data-symbol-id="arrow-single"') && t6.includes('<svg'), t6);

// T7
const t7 = render('`ptr->field` 는 코드다');
check('T7  인라인 코드 원문 유지', t7.includes('ptr-&gt;field') && !t7.includes('data-symbol-id'), t7);

// T8
const t8 = render('```js\nconst f = (x) => x + 1;\n```');
check('T8  코드펜스 원문 유지', !t8.includes('data-symbol-id'), t8);

// T9
const t9 = render('## 요청 => 응답\n\n**A -> B**');
check(
  'T9  제목/강조 내부 렌더링',
  t9.includes('data-symbol-id="arrow-double"') && t9.includes('data-symbol-id="arrow-single"'),
  t9,
);

// T10 — 레지스트리 확장성 (사용자 정의 심볼 주입 시나리오)
const custom: CustomSymbolDef = {
  id: 'arrow-back',
  token: '<-',
  label: '역방향 화살표',
  description: '테스트용 심볼',
  glyph: { width: 20, strokeWidth: 1.7, paths: ['M3.1 6 H17.4'] },
};
registerCustomSymbols([...BUILTIN_CUSTOM_SYMBOLS, custom]);
const t10ok = JSON.stringify(tokensOf('b <- a')) === '["<-"]';
registerCustomSymbols(BUILTIN_CUSTOM_SYMBOLS);
const t10restored = tokensOf('b <- a').length === 0;
check('T10 registerCustomSymbols 로 심볼 확장/복원', t10ok && t10restored);

// ── Write Mode 보호 구간 (CustomSymbolDecorator 가 그대로 사용하는 규칙) ────────

/** `md` 안의 심볼 중 실제로 위젯 치환될 토큰만 남긴다. */
function renderableTokens(md: string): string[] {
  const spans = collectProtectedSpans(md);
  return findCustomSymbols(md)
    .filter((m) => !isProtected(spans, m.from, m.to))
    .map((m) => m.def.token);
}

check('T11 인라인 코드 보호', renderableTokens('`a -> b` 와 c => d').join() === '=>');
check(
  'T12 코드펜스 보호',
  renderableTokens('앞 -> 뒤\n```ts\nconst f = (x) => x;\nconst g = a->b;\n```\n끝 => 결론').join() === '->,=>',
);
check('T13 수식 보호', renderableTokens('$a -> b$ 밖 -> 안').join() === '->');
check(
  'T13b 블록 수식 펜스 보호',
  renderableTokens('$$\nx -> y\n$$\n\n본문 ->').join() === '->',
);
check('T14 이미지 문법 보호', renderableTokens('![a -> b](img/x->y.png) 뒤 =>').join() === '=>');
check(
  'T15 링크: 텍스트는 렌더링, 목적지는 보호',
  renderableTokens('[A -> B](http://x/a->b)').join() === '->',
);
check('T16 일반 문단은 보호 없음', renderableTokens('a -> b => c').join() === '->,=>');

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log(`  결과: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n  ❌ 실패한 테스트:');
  failures.forEach((f) => console.log(`     - ${f}`));
} else {
  console.log('  🎉 All tests passed!');
}
console.log('══════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
