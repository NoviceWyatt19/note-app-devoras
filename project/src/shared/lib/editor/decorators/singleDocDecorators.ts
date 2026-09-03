import { SyntaxDecorator } from './types';
import { BlockCardDecorator } from './impl/BlockCardDecorator';
import { BoldItalicDecorator } from './impl/BoldItalicDecorator';
import { StrikethroughDecorator } from './impl/StrikethroughDecorator';
import { CheckboxDecorator } from './impl/CheckboxDecorator';
import { CodeBlockDecorator } from './impl/CodeBlockDecorator';
import { LatexDecorator } from './impl/LatexDecorator';
import { HyperlinkDecorator } from './impl/HyperlinkDecorator';
import { ImageDecorator } from './impl/ImageDecorator';
import { HeadingDecorator } from './impl/HeadingDecorator';
import { ListDecorator } from './impl/ListDecorator';
import { BlockquoteDecorator } from './impl/BlockquoteDecorator';
import { HorizontalRuleDecorator } from './impl/HorizontalRuleDecorator';
import { CustomSymbolDecorator } from './impl/CustomSymbolDecorator';
import { TableDecorator } from './impl/TableDecorator';

/**
 * `SingleDocEditor` 의 데코레이터 목록 — 단일 소스. `structural_trigger_coverage_harness.ts`
 * (T1, DEBUG_PLAN §5.0.5)가 이 배열을 직접 순회해 각 구조 데코레이터에 트리거 표본이
 * 등록돼 있는지 확인한다.
 *
 * §8c 지적(2026-09-03): 이 배열이 `SingleDocEditor.tsx` 안의 모듈 지역 상수였을 때는
 * "새 구조 데코레이터를 추가하면 하네스에도 표본을 추가하라"가 **주석으로만** 존재하는
 * 결합점이었다 — 사람이 잊으면 하네스가 조용히 통과한다(정확히 `~~~` 결함이 났던 구조).
 * 여기로 옮겨 export 함으로써 하네스가 "표본이 있는 데코레이터 목록"이 아니라
 * **"실제로 등록된 데코레이터 목록"** 을 순회하게 만든다 — 새 데코레이터가 추가되고
 * 표본이 안 따라오면 하네스가 반드시 실패한다.
 */

// 구조 레이어(다중 라인 매칭 쌍 필요, 또는 문서 전역 스캔이 필요) vs 뷰포트 레이어
// ([from,to) 만 스캔) — 경계 근거는 singleDocOrchestrator.ts 헤더 주석 참고.
export const structuralDecorators: SyntaxDecorator[] = [
  new CodeBlockDecorator(),
  new TableDecorator(),
  new LatexDecorator(),
  new BlockCardDecorator(),
];

export const viewportDecorators: SyntaxDecorator[] = [
  new HeadingDecorator(),
  new BoldItalicDecorator(),
  new StrikethroughDecorator(),
  new CheckboxDecorator(),
  new HyperlinkDecorator(),
  new ImageDecorator(),
  new ListDecorator(),
  new BlockquoteDecorator(),
  new HorizontalRuleDecorator(),
  new CustomSymbolDecorator(),
];
