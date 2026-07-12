import { create } from 'zustand';

export interface EditorBlock {
  id: string;
  content: string;
}

interface BlockState {
  blocks: EditorBlock[];
  activeBlockId: string | null;
  focusOffset: number; // Used to direct cursor placement when changing focus
  setBlocksFromContent: (content: string) => void;
  getMergedContent: () => string;
  updateBlockContent: (id: string, content: string) => void;
  splitBlock: (id: string, cursorOffset: number) => void;
  mergeBlockWithPrevious: (id: string) => void;
  focusBlock: (id: string, offset?: number) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useBlockStore = create<BlockState>((set, get) => ({
  blocks: [],
  activeBlockId: null,
  focusOffset: 0,

  setBlocksFromContent: (content) => {
    // Spatial metadata comment is parsed in documentStore, we strip it or handle it separately.
    // For editor blocks, we slice the content by double newlines (paragraphs)
    const normalized = content.replace(/\r\n/g, '\n');
    
    // We split by double newlines, but preserve structural boundaries
    const rawBlocks = normalized.split('\n\n');
    const blocks: EditorBlock[] = rawBlocks.map((blockContent) => ({
      id: generateId(),
      content: blockContent,
    }));

    if (blocks.length === 0) {
      blocks.push({ id: generateId(), content: '' });
    }

    set({
      blocks,
      activeBlockId: blocks[0].id,
      focusOffset: 0,
    });
  },

  getMergedContent: () => {
    return get().blocks.map(b => b.content).join('\n\n');
  },

  updateBlockContent: (id, content) => {
    const updated = get().blocks.map((block) => {
      if (block.id === id) {
        return { ...block, content };
      }
      return block;
    });
    set({ blocks: updated });
  },

  splitBlock: (id, cursorOffset) => {
    const { blocks } = get();
    const index = blocks.findIndex(b => b.id === id);
    if (index === -1) return;

    const targetBlock = blocks[index];
    const textBefore = targetBlock.content.substring(0, cursorOffset);
    const textAfter = targetBlock.content.substring(cursorOffset);

    const newBlockId = generateId();
    const newBlock: EditorBlock = {
      id: newBlockId,
      content: textAfter,
    };

    const newBlocks = [...blocks];
    newBlocks[index] = { ...targetBlock, content: textBefore };
    newBlocks.splice(index + 1, 0, newBlock);

    set({
      blocks: newBlocks,
      activeBlockId: newBlockId,
      focusOffset: 0,
    });
  },

  mergeBlockWithPrevious: (id) => {
    const { blocks } = get();
    const index = blocks.findIndex(b => b.id === id);
    if (index <= 0) return; // Cannot merge first block with previous

    const currentBlock = blocks[index];
    const previousBlock = blocks[index - 1];

    const mergedContent = previousBlock.content + currentBlock.content;
    const focusOffset = previousBlock.content.length; // Cursor will be at the join point

    const newBlocks = [...blocks];
    newBlocks[index - 1] = { ...previousBlock, content: mergedContent };
    newBlocks.splice(index, 1);

    set({
      blocks: newBlocks,
      activeBlockId: previousBlock.id,
      focusOffset,
    });
  },

  focusBlock: (id, offset = 0) => {
    set({
      activeBlockId: id,
      focusOffset: offset,
    });
  },
}));
