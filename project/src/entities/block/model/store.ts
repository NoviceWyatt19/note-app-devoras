import { create } from 'zustand';
import { buildHeadingId, parseHeadingLine } from '@/shared/lib/headingId';

export interface EditorBlock {
  id: string;
  level: number;
  content: string;
  children: EditorBlock[];
}

interface BlockState {
  blocks: EditorBlock[];
  ownerTabId: string | null;
  activeBlockId: string | null;
  focusOffset: number; // Used to direct cursor placement when changing focus
  setBlocksFromContent: (content: string, ownerTabId?: string) => void;
  getMergedContent: () => string;
  updateBlockContent: (id: string, content: string) => void;

  mergeBlockWithPrevious: (id: string) => void;
  focusBlock: (id: string, offset?: number) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// 헬퍼: 트리를 평면화하여 리스트로 반환
export function flattenTree(blocks: EditorBlock[]): EditorBlock[] {
  const result: EditorBlock[] = [];
  function traverse(node: EditorBlock) {
    result.push(node);
    node.children.forEach(traverse);
  }
  blocks.forEach(traverse);
  return result;
}

// ---------------------------------------------------------
// ID & Key Derivation (Legacy support for MindNode linking)
// ---------------------------------------------------------
function deriveBlockKey(
  content: string,
  parentKeyStack: { level: number; key: string }[],
  siblingCountMap: Record<string, number>,
): string {
  const firstLine = content.split('\n')[0];
  const parsed = parseHeadingLine(firstLine);
  
  let parentKey: string | null = null;
  const effectiveLevel = parsed ? parsed.level : 999;
  
  for (let i = parentKeyStack.length - 1; i >= 0; i--) {
    if (parentKeyStack[i].level < effectiveLevel) {
      parentKey = parentKeyStack[i].key;
      break;
    }
  }

  if (!parsed) {
    const parentId = parentKey || 'root';
    const index = (siblingCountMap[parentId] || 0) + 1;
    siblingCountMap[parentId] = index;
    return `${parentId}-textblock-${index}`;
  }

  return buildHeadingId(parsed.label, parentKey, siblingCountMap);
}

function deriveKeysWithParentStack(contents: string[]): string[] {
  const sibMap: Record<string, number> = {};
  const parentStack: { level: number; key: string }[] = [];
  return contents.map((content) => {
    const key = deriveBlockKey(content, parentStack, sibMap);
    const parsed = parseHeadingLine(content.split('\n')[0]);
    if (parsed) {
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= parsed.level) {
        parentStack.pop();
      }
      parentStack.push({ level: parsed.level, key });
    }
    return key;
  });
}
// ---------------------------------------------------------

/**
 * 평면화된 청크들을 트리 구조로 조립합니다.
 */
function buildTreeFromChunks(chunks: EditorBlock[]): EditorBlock[] {
  const roots: EditorBlock[] = [];
  const stack: EditorBlock[] = [];

  for (const node of chunks) {
    if (node.level > 0) {
      // 현재 노드가 헤딩(1~3)이면, 자신보다 깊거나 같은 레벨의 조상을 스택에서 팝
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }
    }
    // 텍스트 블록(level 0)은 스택을 팝하지 않고, 무조건 가장 최근의 조상에 편입

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }

    if (node.level > 0) {
      stack.push(node);
    }
  }

  return roots;
}

export const useBlockStore = create<BlockState>((set, get) => ({
  blocks: [],
  ownerTabId: null,
  activeBlockId: null,
  focusOffset: 0,

  setBlocksFromContent: (content, ownerTabId) => {
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const newBlockContents: string[] = [];
    let currentBlockLines: string[] = [];

    let insideCodeFence = false;
    lines.forEach((line) => {
      if (/^(`{3,}|~{3,})/.test(line)) {
        insideCodeFence = !insideCodeFence;
        currentBlockLines.push(line);
        return;
      }
      // H1, H2, H3를 모두 슬라이스 경계로 판단
      if (!insideCodeFence && (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### '))) {
        if (currentBlockLines.length > 0) {
          newBlockContents.push(currentBlockLines.join('\n'));
          currentBlockLines = [];
        }
      }
      currentBlockLines.push(line);
    });

    if (currentBlockLines.length > 0) {
      newBlockContents.push(currentBlockLines.join('\n'));
    }

    if (newBlockContents.length === 0) {
      newBlockContents.push('');
    }

    const newKeys = deriveKeysWithParentStack(newBlockContents);
    const currentBlocks = flattenTree(get().blocks); // 기존 트리를 평면화하여 ID 매칭
    const oldKeys = deriveKeysWithParentStack(currentBlocks.map((b) => b.content));
    
    const existingByKey = new Map<string, EditorBlock>();
    currentBlocks.forEach((b, i) => {
      if (!existingByKey.has(oldKeys[i])) existingByKey.set(oldKeys[i], b);
    });

    const usedIds = new Set<string>();
    const flatChunks: EditorBlock[] = newBlockContents.map((blockText, i) => {
      const key = newKeys[i];
      const existing = existingByKey.get(key);
      const id = (existing && !usedIds.has(existing.id)) ? existing.id : generateId();
      if (existing) usedIds.add(existing.id);

      // 레벨 계산
      const firstLine = blockText.split('\n')[0];
      let level = 0;
      if (firstLine.startsWith('# ')) level = 1;
      else if (firstLine.startsWith('## ')) level = 2;
      else if (firstLine.startsWith('### ')) level = 3;

      return { id, level, content: blockText, children: [] };
    });

    // 트리를 빌드하여 상태에 저장
    const treeBlocks = buildTreeFromChunks(flatChunks);
    set({ blocks: treeBlocks, ownerTabId: ownerTabId ?? get().ownerTabId });
  },

  getMergedContent: () => {
    return flattenTree(get().blocks).map(b => b.content).join('\n');
  },

  updateBlockContent: (id, content) => {
    // 트리 전체를 복제하면서 특정 노드만 업데이트
    const updateNode = (blocks: EditorBlock[]): EditorBlock[] => {
      return blocks.map(block => {
        if (block.id === id) {
          return { ...block, content };
        }
        if (block.children.length > 0) {
          return { ...block, children: updateNode(block.children) };
        }
        return block;
      });
    };
    
    set({ blocks: updateNode(get().blocks) });
  },

  mergeBlockWithPrevious: (id) => {
    // 자가 치유(Heal) 메커니즘: 평면화된 리스트에서 문자열을 합치고 전체 트리를 다시 빌드
    const flatBlocks = flattenTree(get().blocks);
    const index = flatBlocks.findIndex(b => b.id === id);
    if (index <= 0) return; // Cannot merge first block

    const currentBlock = flatBlocks[index];
    const previousBlock = flatBlocks[index - 1];

    // Strip H1~H6 header mark from current block start when merging into parent block content
    // (parseHeadingLine 은 #{1,6} 을 인식하므로 여기서도 동일 범위를 벗겨야 마크가 남지 않는다)
    const cleanedCurrentText = currentBlock.content.replace(/^#{1,6}\s*/, '');
    const joinSeparator = previousBlock.content.endsWith('\n') ? '' : '\n';
    const mergedContent = previousBlock.content + joinSeparator + cleanedCurrentText;
    const focusOffset = previousBlock.content.length;

    // 현재 블록은 지우고 이전 블록의 텍스트를 업데이트
    flatBlocks[index - 1] = { ...previousBlock, content: mergedContent };
    flatBlocks.splice(index, 1);

    // 전체 콘텐츠 문자열로 변환한 뒤, setBlocksFromContent 호출을 통해 트리 재생성!
    const fullText = flatBlocks.map(b => b.content).join('\n');

    get().setBlocksFromContent(fullText, get().ownerTabId ?? undefined);

    // activeBlockId 는 재생성 전 previousBlock.id 를 그대로 쓰면 안 된다: 헤딩 블록의 id 는
    // 라벨에서 파생되므로(buildHeadingId) 재생성 시 바뀔 수 있다. 재생성 후 "위치"로 재조회한다.
    const rebuilt = flattenTree(get().blocks);
    set({
      activeBlockId: rebuilt[index - 1]?.id ?? null,
      focusOffset,
    });
  },

  focusBlock: (id, offset = 0) => {
    set({
      activeBlockId: id,
      focusOffset: offset,
    });
  },

  reorderBlocks: (fromIndex, toIndex) => {
    const flat = flattenTree(get().blocks);
    if (fromIndex < 0 || fromIndex >= flat.length) return;          // Step 1: 경계
    if (toIndex   < 0 || toIndex   >= flat.length) return;
    if (fromIndex === toIndex) return;

    const node   = flat[fromIndex];
    // flattenTree returns the same object references, so includes() works
    const group  = [node, ...flattenTree(node.children)];           // Step 2: 서브트리 통째로
    const target = flat[toIndex];
    if (group.includes(target)) return;                             // Step 3: 자기 자손에 드롭 금지

    const rest = flat.filter(b => !group.includes(b));
    let insertAt = rest.indexOf(target);
    if (insertAt < 0) return;
    if (toIndex > fromIndex) {                                      // Step 4: 아래로 이동 → target 서브트리 "뒤"
      insertAt += 1 + flattenTree(target.children).length;
    }
    rest.splice(insertAt, 0, ...group);

    get().setBlocksFromContent(rest.map(b => b.content).join('\n'), get().ownerTabId ?? undefined);
  },
}));
