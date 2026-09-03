/**
 * DEBUG_PLAN §5.0.5 — 트리거 집합 결합점을 문서가 아니라 T1 게이트로 지킨다.
 *
 * `singleDocOrchestrator.ts` 의 구조 레이어는 `STRUCTURAL_TRIGGER_RE` 에 없는
 * 문법 문자로만 이뤄진 편집을 "구조 데코레이션에 영향 없음"으로 보고 전체
 * 재빌드를 건너뛴다. 그 판단이 실제 구조 데코레이터(코드펜스·표·KaTeX·카드)의
 * 구분자와 어긋나면, 트리거 집합 밖의 신규 구문이 **조용히 데코레이트되지
 * 않는 채로 남는다** — 무관한 다른 편집이 우연히 전체 재빌드를 유발할 때까지.
 *
 * 실제로 두 번 뚫렸다:
 *   1. 최초 구현이 백틱·`$`·`|` 만 넣고 `~~~` 펜스(CommonMark 유효,
 *      `CodeBlockDecorator` 가 이미 지원)를 놓쳤다 — 사람이 정규식을 읽다가
 *      발견했다(커밋 `16fe373`).
 *   2. `BlockCardDecorator` 를 구조 레이어에 추가하면서 `#` 을 안 넣을 뻔했다 —
 *      다중 라인 replace 가 아니라서 다른 세 데코레이터와 트리거 성격이
 *      달랐다(§5.4). 이번에도 사람이 코드를 읽다가 잡았다.
 *
 * §8c 지적(2026-09-03): 이 하네스가 **표본이 있는 데코레이터만** 확인하는 한,
 * "새 데코레이터를 추가하면 표본도 추가하라"는 여전히 사람이 기억해야 하는
 * 결합점이다 — 정확히 위 2번이 보여준 실패 모드. 그래서 표본을
 * `singleDocDecorators.ts` 가 내보내는 **실제 구조 데코레이터 목록**과
 * `SyntaxDecorator.name` 으로 대조한다 — 표본 없는 데코레이터가 그 배열에
 * 들어오면 이 하네스가 반드시 실패한다(표본을 깜빡했다는 이유로 조용히
 * 통과하는 게 아니라).
 *
 * 실행: pnpm test:structuraltrigger
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { STRUCTURAL_TRIGGER_RE } from '../decorators/singleDocOrchestrator';
import { structuralDecorators } from '../decorators/singleDocDecorators';
import { FENCE_OPEN_RE } from '../decorators/impl/CodeBlockDecorator';
import { DISPLAY_SINGLE_RE, INLINE_RE, DISPLAY_FENCE_RE } from '../decorators/impl/LatexDecorator';
import { HEADING_RE } from '../decorators/impl/BlockCardDecorator';

interface DelimiterSample {
  label: string;
  sample: string;
  /** 그 데코레이터 자신의 실제 판정 로직 — 표본이 진짜 그 데코레이터를 발동시키는지 확인한다. */
  ownMatch: (sample: string) => boolean;
}

/** 전역(/g) 정규식은 `.test()` 호출마다 `lastIndex` 상태가 남는다 — 매번 리셋해서 쓴다. */
function testGlobalRe(re: RegExp, sample: string): boolean {
  re.lastIndex = 0;
  return re.test(sample);
}

/**
 * `SyntaxDecorator.name` → 그 데코레이터가 반응해야 하는 구분자 표본(들).
 * `singleDocDecorators.ts` 의 `structuralDecorators` 에 새 데코레이터를 추가하면
 * 이 맵에도 항목을 추가해야 한다 — 안 하면 아래 "표본 존재" 테스트가 실패한다.
 */
const samplesByDecoratorName: Record<string, DelimiterSample[]> = {
  'code-block': [
    { label: '백틱 펜스', sample: '```js', ownMatch: (s) => FENCE_OPEN_RE.test(s) },
    { label: '틸드 펜스', sample: '~~~', ownMatch: (s) => FENCE_OPEN_RE.test(s) },
  ],
  latex: [
    { label: '인라인 수식', sample: '$x$', ownMatch: (s) => testGlobalRe(INLINE_RE, s) },
    { label: '한 줄 디스플레이 수식', sample: '$$x$$', ownMatch: (s) => testGlobalRe(DISPLAY_SINGLE_RE, s) },
    { label: '펜스형 디스플레이 수식', sample: '$$', ownMatch: (s) => DISPLAY_FENCE_RE.test(s) },
  ],
  table: [
    // TableDecorator.ts:107 은 정규식이 아니라 `headerLine.text.includes('|')` 평판정이다.
    { label: '표 행', sample: '| a | b |', ownMatch: (s) => s.includes('|') },
  ],
  'block-card': [
    // 다중 라인 replace 는 아니지만 문서 전역 스캔이 필요해 구조 레이어에 있다(§5.4).
    { label: '헤딩', sample: '## 헤딩', ownMatch: (s) => HEADING_RE.test(s) },
  ],
};

test('구조 데코레이터마다 트리거 표본이 등록돼 있다 — 새 데코레이터를 추가하면 이 테스트가 실패해야 정상', () => {
  for (const decorator of structuralDecorators) {
    const samples = samplesByDecoratorName[decorator.name];
    assert.ok(
      samples && samples.length > 0,
      `구조 데코레이터 "${decorator.name}" 에 트리거 표본이 없다 — ` +
        `structural_trigger_coverage_harness.ts 의 samplesByDecoratorName 에 항목을 추가할 것`,
    );
  }
});

test('구조 데코레이터 구분자 표본이 자기 자신의 판정 로직과 맞는다 (sanity)', () => {
  for (const decorator of structuralDecorators) {
    for (const { label, sample, ownMatch } of samplesByDecoratorName[decorator.name] ?? []) {
      assert.ok(ownMatch(sample), `sanity 실패: "${sample}" 가 ${decorator.name}(${label}) 자신의 판정을 통과하지 못한다`);
    }
  }
});

test('구조 데코레이터 구분자 표본이 전부 STRUCTURAL_TRIGGER_RE 에 걸린다', () => {
  for (const decorator of structuralDecorators) {
    for (const { label, sample } of samplesByDecoratorName[decorator.name] ?? []) {
      STRUCTURAL_TRIGGER_RE.lastIndex = 0;
      assert.ok(
        STRUCTURAL_TRIGGER_RE.test(sample),
        `${decorator.name}(${label}) 의 구분자 표본 "${sample}" 이 STRUCTURAL_TRIGGER_RE 에 안 걸린다 — ` +
          `트리거 게이트가 이 구문의 신규 편집을 조용히 건너뛴다. STRUCTURAL_TRIGGER_RE 에 ` +
          `해당 문자를 추가할 것(singleDocOrchestrator.ts)`,
      );
    }
  }
});
