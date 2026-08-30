import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { EditorBlock, flattenTree, resolveBlocksFromContent } from '@/entities/block/model/store';
import { MindNode, parseMarkdown } from '@/entities/document/lib/parser';

/**
 * REF-20260831-01 (Step 7-C, P0-3 Stage B) — 탭 스코프 문서 스토어.
 *
 * `rawContent`/`blocks`/`nodes`/`isDirty`/`viewMode` 를 전역 싱글턴(`useBlockStore`
 * + `useDocumentStore` 의 문서 필드)에서 탭 하나에 묶인 독립 인스턴스로 옮긴다.
 * `createTabStore(tabId)` 가 호출될 때마다 완전히 새 zustand 스토어를 만든다 —
 * 소유권을 `ownerTabId` 런타임 가드로 검사하는 대신, **구조적으로 다른 탭이 이
 * 인스턴스에 접근할 방법 자체가 없게** 만드는 것이 목적이다(7-A 가 겪은 "소유권
 * 이전 지점마다 가드를 잊는다" 류의 버그를 애초에 성립 불가능하게 한다).
 *
 * 블록 매칭 로직(`resolveBlocksFromContent`)은 `entities/block/model/store.ts`
 * 의 검증된 2-패스 알고리즘을 그대로 재사용한다 — 두 벌로 갈라지면 그 자체가
 * 새 버그의 씨앗이다(A7 의 교훈).
 */
export interface TabStoreSnapshot {
  /** 이 스냅샷이 어느 탭 소유였는지 — Phase 2 TTL 언마운터가 외부에 저장/키잉할 때 필요. */
  tabId: string;
  rawContent: string;
  blocks: EditorBlock[];
  nodes: MindNode[];
  isDirty: boolean;
  viewMode: 'write' | 'read';
  activeBlockId: string | null;
  focusOffset: number;
}

export interface TabStoreState extends TabStoreSnapshot {
  /** 디스크/외부에서 읽은 원문으로 blocks·nodes 를 재계산한다(구조적 변경 경로). */
  setContent: (content: string) => void;
  /** blocks 는 그대로 두고 rawContent 만 현재 blocks 와 일치하도록 갱신한다(디바운스 동기화용, 재파싱 없음). */
  syncRawContentFromBlocks: () => void;
  /**
   * ERD 탭 전용 — rawContent 는 마크다운이 아니라 JSON 이므로 setContent 의
   * resolveBlocksFromContent/parseMarkdown 을 태우면 안 된다(의미 없는 blocks/
   * nodes 생성). blocks/nodes 를 건드리지 않고 rawContent 만 교체하고 dirty 로
   * 표시한다.
   */
  setRawContent: (content: string) => void;
  getMergedContent: () => string;
  updateBlockContent: (id: string, content: string) => void;
  mergeBlockWithPrevious: (id: string) => void;
  focusBlock: (id: string, offset?: number) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  updateNodeCoordinate: (nodeId: string, x: number, y: number) => void;
  setDirty: (isDirty: boolean) => void;
  setViewMode: (mode: 'write' | 'read') => void;
  toggleViewMode: () => void;
  /** Phase 2 TTL 언마운터 계약(C-5) — 현재 상태를 순수 스냅샷으로 뽑아낸다. */
  serialize: () => TabStoreSnapshot;
  /** 스냅샷으로부터 상태를 복원한다(언마운트→재마운트 왕복). */
  hydrate: (snapshot: TabStoreSnapshot) => void;
}

export type TabStoreApi = UseBoundStore<StoreApi<TabStoreState>>;

export function createTabStore(tabId: string, initialContent = ''): TabStoreApi {
  return create<TabStoreState>((set, get) => ({
    tabId,
    rawContent: initialContent,
    blocks: initialContent ? resolveBlocksFromContent(initialContent, []) : [],
    nodes: initialContent ? parseMarkdown(initialContent) : [],
    isDirty: false,
    viewMode: 'write',
    activeBlockId: null,
    focusOffset: 0,

    setContent: (content) => {
      const blocks = resolveBlocksFromContent(content, get().blocks);
      const nodes = parseMarkdown(content);
      set({ rawContent: content, blocks, nodes });
    },

    setRawContent: (content) => set({ rawContent: content, isDirty: true }),

    // 타이핑 도중에는 updateBlockContent 가 매 키 입력마다 blocks 를 이미
    // 갱신해 둔다. syncContent(디바운스) 는 그 blocks 를 문자열로 합쳐
    // rawContent 에 "밀어 넣기"만 하면 되고, resolveBlocksFromContent 로
    // 다시 매칭·파싱할 필요가 없다 — setContent 를 여기서 쓰면 매 디바운스
    // 주기마다 불필요한 재파싱이 들어간다.
    syncRawContentFromBlocks: () => {
      const merged = flattenTree(get().blocks).map((b) => b.content).join('\n');
      set({ rawContent: merged });
    },

    getMergedContent: () => flattenTree(get().blocks).map((b) => b.content).join('\n'),

    updateBlockContent: (id, content) => {
      const updateNode = (blocks: EditorBlock[]): EditorBlock[] =>
        blocks.map((block) => {
          if (block.id === id) return { ...block, content };
          if (block.children.length > 0) return { ...block, children: updateNode(block.children) };
          return block;
        });
      set({ blocks: updateNode(get().blocks) });
    },

    mergeBlockWithPrevious: (id) => {
      const flatBlocks = flattenTree(get().blocks);
      const index = flatBlocks.findIndex((b) => b.id === id);
      if (index <= 0) return; // 첫 블록은 병합할 대상이 없다

      const currentBlock = flatBlocks[index];
      const previousBlock = flatBlocks[index - 1];

      // parseHeadingLine 은 #{1,6} 을 인식하므로 여기서도 동일 범위를 벗겨야 마크가 안 남는다.
      const cleanedCurrentText = currentBlock.content.replace(/^#{1,6}\s*/, '');
      const joinSeparator = previousBlock.content.endsWith('\n') ? '' : '\n';
      const mergedContent = previousBlock.content + joinSeparator + cleanedCurrentText;
      const focusOffset = previousBlock.content.length;

      flatBlocks[index - 1] = { ...previousBlock, content: mergedContent };
      flatBlocks.splice(index, 1);

      const fullText = flatBlocks.map((b) => b.content).join('\n');
      get().setContent(fullText);

      // activeBlockId 는 재생성 전 previousBlock.id 를 그대로 쓰면 안 된다 — 헤딩
      // 블록의 id 는 라벨에서 파생되는 매칭을 거치므로 재생성 시 바뀔 수 있다.
      // 재생성 후 "위치"로 재조회한다(A7 의 부분 완화, 방어적으로 유지).
      const rebuilt = flattenTree(get().blocks);
      set({ activeBlockId: rebuilt[index - 1]?.id ?? null, focusOffset });
    },

    focusBlock: (id, offset = 0) => set({ activeBlockId: id, focusOffset: offset }),

    reorderBlocks: (fromIndex, toIndex) => {
      const flat = flattenTree(get().blocks);
      if (fromIndex < 0 || fromIndex >= flat.length) return;
      if (toIndex < 0 || toIndex >= flat.length) return;
      if (fromIndex === toIndex) return;

      const node = flat[fromIndex];
      const group = [node, ...flattenTree(node.children)];
      const target = flat[toIndex];
      if (group.includes(target)) return; // 자기 자손에 드롭 금지

      const rest = flat.filter((b) => !group.includes(b));
      let insertAt = rest.indexOf(target);
      if (insertAt < 0) return;
      if (toIndex > fromIndex) {
        insertAt += 1 + flattenTree(target.children).length;
      }
      rest.splice(insertAt, 0, ...group);

      get().setContent(rest.map((b) => b.content).join('\n'));
    },

    updateNodeCoordinate: (nodeId, x, y) => {
      set((s) => ({
        nodes: s.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node)),
        isDirty: true,
      }));
    },

    setDirty: (isDirty) => set({ isDirty }),
    setViewMode: (mode) => set({ viewMode: mode }),
    toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'write' ? 'read' : 'write' })),

    serialize: () => {
      const { tabId: id, rawContent, blocks, nodes, isDirty, viewMode, activeBlockId, focusOffset } = get();
      return { tabId: id, rawContent, blocks, nodes, isDirty, viewMode, activeBlockId, focusOffset };
    },

    hydrate: (snapshot) => {
      // 스토어 인스턴스는 생성 시점에 정확히 하나의 tabId 에 묶인다 — hydrate 는
      // 그 인스턴스의 상태를 복원하는 것이지 다른 탭으로 재배정하는 통로가
      // 아니다. C-5 계약 확정 전 임시 방어: 어긋나면 개발 빌드에서만 경고한다.
      if (import.meta.env.DEV && snapshot.tabId !== tabId) {
        console.error(
          `[tabStore] hydrate: tabId 불일치 — 이 스토어는 "${tabId}" 소유인데 "${snapshot.tabId}" 스냅샷을 복원하려 함`,
        );
      }
      set({ ...snapshot, tabId });
    },
  }));
}
