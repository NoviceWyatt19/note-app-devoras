/**
 * `node --import ./scripts/register-dom.mjs <harness.tsx>` 로 T1.5 하네스를 실행한다.
 *
 * T1(`register-ts.mjs`)이 이미 처리하는 것 위에 jsdom 전역 하나만 얹는다
 * (REF-20260902-01). React/testing-library 가 로드되기 전에 window/document
 * 등이 globalThis 에 있어야 하므로, 이 파일이 `--import` 로 가장 먼저 실행되는
 * 시점에 동기적으로 끝낸다 — 순서가 유일한 함정이다.
 */
import { JSDOM } from 'jsdom';
import { register } from 'node:module';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true, // window.requestAnimationFrame 활성화
});

const { window } = dom;

// jsdom 의 window 가 가진 프로퍼티를 globalThis 에 복사한다. 이미 Node 에 있는
// 전역(예: fetch, structuredClone)은 건드리지 않는다 — jsdom 쪽이 더 축소된
// 구현일 수 있어서다.
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  try {
    globalThis[key] = window[key];
  } catch {
    // window 의 일부 프로퍼티(예: 몇몇 getter-only 항목)는 복사가 막혀 있다 — 무시한다.
  }
}

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.customElements = window.customElements;

// Node 21+ 는 `navigator` 를 getter-only 로 이미 전역에 깔아 둔다 — 단순
// 대입은 "has only a getter" 로 죽는다. 프로퍼티 자체를 jsdom 것으로
// 재정의해야 한다.
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
  writable: true,
});

// React 18 + @testing-library/react 가 act() 환경임을 판별하는 데 쓴다.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 은 Range.getClientRects/getBoundingClientRect 를 구현하지 않는다.
// CodeMirror(@codemirror/view) 는 레이아웃 측정(measure) 때마다 이걸 호출한다 —
// 없으면 매 렌더마다 콘솔에 TypeError 스택이 찍힌다(측정 자체는 CodeMirror가
// try/catch 로 삼키므로 테스트 실패로 이어지진 않는다. 다만 노이즈가 크고,
// 실제 좌표가 필요한 어떤 미래 테스트가 여기서 조용히 잘못된 값을 받을 수도
// 있으니 최소 스텁을 명시적으로 둔다).
if (!window.Range.prototype.getClientRects) {
  window.Range.prototype.getClientRects = function () {
    return [];
  };
}
if (!window.Range.prototype.getBoundingClientRect) {
  window.Range.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
  };
}

// register-ts.mjs 가 하는 일(⁠__DEVORAS_TEST_ENV__ 시드 + ts-hook.mjs 등록)을
// 그대로 재사용한다 — 두 로더를 따로 유지하지 않는다.
globalThis.__DEVORAS_TEST_ENV__ = { DEV: true, PROD: false, MODE: 'test' };
register('./ts-hook.mjs', import.meta.url);
