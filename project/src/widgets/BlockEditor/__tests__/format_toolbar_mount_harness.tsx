/**
 * T1.5 — FormatToolbar 마운트 회귀 재현 (REF-20260902-01 first_targets #2)
 *
 * 결함(9a7c82c 이전, C-2 단계): FormatToolbar 가 전역 useDocumentStore() 를
 * 직접 불러 viewMode/toggleViewMode 를 읽었다. C-4(ac2354c)가 그 전역 필드를
 * 지우면서, 이관되지 않은 소비자는 렌더 중 undefined 를 destructure 하고
 * throw 했다 — 에러 바운더리가 없으므로 BlockEditor 서브트리 전체가
 * 통째로 사라졌다("FormatToolbar 마운트 회귀"). 지금은 useEffectiveTabStore()
 * 로 고정돼 있다(FormatToolbar.tsx) — 이 하네스는 그 소비자 배선이 계속
 * 옳게 유지되는지를 실제 DOM 렌더로 검증한다.
 *
 * 실행: pnpm test:formattoolbar
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormatToolbar } from '../ui/FormatToolbar';
import { TabDocumentProvider } from '@/entities/document/model/TabDocumentProvider';

afterEach(cleanup);

test('FormatToolbar 는 TabDocumentProvider 안에서 정상 마운트되고 write 모드 UI 를 보여준다', () => {
  render(
    <TabDocumentProvider tabId="fmt-tab-1" initialContent="# Hello">
      <FormatToolbar />
    </TabDocumentProvider>,
  );

  assert.ok(screen.getByTitle('굵게 (Bold)'), '서식 버튼이 렌더되지 않았다 — write 모드 분기가 죽었다');
  assert.ok(
    screen.getByTitle('읽기 모드로 전환 (Read)'),
    'viewMode 토글 버튼이 렌더되지 않았다 — useEffectiveTabStore 배선이 깨졌다',
  );
});

test('viewMode 토글 클릭 후에도 FormatToolbar 가 언마운트되지 않고 read 모드로 갱신된다', async () => {
  const user = userEvent.setup();
  render(
    <TabDocumentProvider tabId="fmt-tab-2" initialContent="# Hello">
      <FormatToolbar />
    </TabDocumentProvider>,
  );

  await user.click(screen.getByTitle('읽기 모드로 전환 (Read)'));

  // 과거 결함의 실패 모드: 필드가 undefined 가 되어 렌더 중 throw → 서브트리
  // 전체 소멸. 여기서는 토글 이후에도 컴포넌트가 살아 있고 read 모드 상태를
  // 정확히 반영해야 한다.
  assert.ok(
    screen.getByTitle('편집 모드로 전환 (Edit)'),
    '토글 후 컴포넌트가 사라졌거나 viewMode 가 갱신되지 않았다',
  );
  assert.strictEqual(screen.queryByTitle('굵게 (Bold)'), null, 'read 모드에서는 서식 버튼이 숨어야 한다');
});

test('TabDocumentProvider 없이 마운트하면 조용히 넘어가지 않고 명시적으로 throw 한다', () => {
  // 과거 결함의 근본 원인은 "계획에서 빠진 소비자가 조용히 undefined 를
  // 소비"한 것이었다. 지금 계약은 Provider 밖 호출을 명시적 throw 로 막는다 —
  // 그래야 다음에 같은 종류의 누락이 생겨도 런타임에서 곧바로 드러난다.
  const originalError = console.error;
  console.error = () => {}; // React 가 콘솔에 찍는 에러 바운더리 경고를 테스트 출력에서 숨긴다
  try {
    assert.throws(() => render(<FormatToolbar />), /TabDocumentProvider/);
  } finally {
    console.error = originalError;
  }
});
