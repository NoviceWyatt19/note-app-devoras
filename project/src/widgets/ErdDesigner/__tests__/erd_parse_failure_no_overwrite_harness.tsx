/**
 * T1.5 — BUG-20260902-01: ERD 문서 파싱 실패 시 빈 문서로 덮어쓰지 않는다
 *
 * 결함(수정 전): `ErdDesignerMainView` 가 파싱 실패를 감지하면 `createEmptyErdDocument()`
 * 로 만든 빈 문서를 `setRawContent`/`updateContentForTab` 으로 즉시 써버렸다 — 읽기
 * 실패가 쓰기로 이어져 손상된 원본이 메모리에서 사라졌다(`ticket/debug/20260902_0410_erd_empty_doc_overwrite.yml`).
 * 지금은 파싱 실패를 표시 상태로만 다루고, 원본 `rawContent` 를 절대 덮어쓰지 않는다.
 *
 * 여기서 다루는 두 조건(문법 오류·구조 오류) 모두 `<ErdDesigner>`(React Flow 기반)를
 * 마운트하지 않는 이른 반환 경로라 jsdom 에서 안전하게 렌더된다. 빈 문서 초기화(D12,
 * 정상 성공 경로)는 `<ErdDesigner>` 를 실제로 마운트하는데, jsdom 에는 `@xyflow/react` 가
 * 요구하는 요소 크기 측정 환경이 없어(ResizeObserver 스텁을 넣어도 뷰포트 계산이
 * 멈추지 않는다 — 직접 확인, 하네스가 타임아웃까지 걸렸다) 여기서 자동화하지 않는다.
 * D12("여는 것만으로 쓰지 않는다")는 실 브라우저로 별도 확인했다: 빈 .erd 를 새로 열어
 * 캔버스는 정상 렌더되지만 저장 버튼에 dirty 점이 뜨지 않는 것, 탭 스토어 rawContent 가
 * 빈 문자열로 남아 있는 것을 콘솔로 확인.
 *
 * `rawContent` 는 `isDirty` 를 거치지 않고 탭 스코프 스토어(`tabStoreRegistry.getTabStore`)
 * 에서 직접 읽는다 — `updateContentForTab`(documentStore) 은 잡지만 `setRawContent`
 * (tabStore) 단독 호출은 `isDirty` 만으로는 못 잡는다(두 스토어의 별개 플래그).
 *
 * 실행: pnpm test:erdparsefailure
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, screen, cleanup } from '@testing-library/react';
import { ErdDesignerMainView } from '../ui/ErdDesignerMainView';
import { TabDocumentProvider } from '@/entities/document/model/TabDocumentProvider';
import { useDocumentStore } from '@/entities/document/model/store';
import { getTabStore } from '@/entities/document/model/tabStoreRegistry';

afterEach(cleanup);

function seedTabInDocumentStore(tabId: string) {
  useDocumentStore.setState({
    activePaneId: 'pane-main',
    panes: [
      {
        id: 'pane-main',
        activeTabId: tabId,
        tabs: [{ id: tabId, type: 'erd', title: 'test.erd', isDirty: false } as any],
      } as any,
    ],
  } as any);
}

test('문법이 깨진 JSON 을 열면 빈 캔버스 대신 에러 UI 가 뜨고 원본 텍스트가 보존된다', () => {
  const broken = '{ "version": 1, "tables": [ BROKEN';
  seedTabInDocumentStore('erd-broken-1');

  render(
    <TabDocumentProvider tabId="erd-broken-1" initialContent={broken}>
      <ErdDesignerMainView tab={{ id: 'erd-broken-1' } as any} />
    </TabDocumentProvider>,
  );

  assert.ok(screen.getByText(/해석할 수 없습니다/), '에러 UI 가 렌더되지 않았다');
  assert.ok(screen.getByText(broken, { exact: false }), '원본 텍스트가 화면에 보존돼 있지 않다');

  const tab = useDocumentStore.getState().panes[0].tabs[0] as any;
  assert.strictEqual(tab.isDirty, false, '파싱 실패만으로 탭이 dirty 표시되면 안 된다 — 쓰기가 발생했다는 뜻');

  const tabStore = getTabStore('erd-broken-1');
  assert.strictEqual(tabStore?.getState().rawContent, broken, '탭 스토어 rawContent 가 원본 그대로여야 한다 — setRawContent 가 불렸다면 여기서 바뀐다');
});

test('구조가 잘못된 JSON(relations 없음)을 열어도 에러 UI 로 처리되고 원본이 보존된다', () => {
  // 문법은 맞지만 ErdDocumentV1 계약(relations 배열)을 안 지키는 문서 —
  // 옛 코드는 `!parsed.version || !parsed.tables` 만 봐서 이런 문서를 그대로
  // 통과시켰다(그리고 다운스트림에서 `.relations.map` 이 터졌다). 지금은
  // `parseErdDocument` 가 이 단계에서 명시적으로 막는다.
  const structurallyInvalid = JSON.stringify({ version: 1, tables: [] });
  seedTabInDocumentStore('erd-broken-2');

  render(
    <TabDocumentProvider tabId="erd-broken-2" initialContent={structurallyInvalid}>
      <ErdDesignerMainView tab={{ id: 'erd-broken-2' } as any} />
    </TabDocumentProvider>,
  );

  assert.ok(screen.getByText(/해석할 수 없습니다/), '구조 오류도 에러 UI 로 처리돼야 한다');

  const tab = useDocumentStore.getState().panes[0].tabs[0] as any;
  assert.strictEqual(tab.isDirty, false, '구조 오류도 쓰기를 유발하면 안 된다');

  const tabStore = getTabStore('erd-broken-2');
  assert.strictEqual(tabStore?.getState().rawContent, structurallyInvalid, '탭 스토어 rawContent 가 원본 그대로여야 한다');
});
