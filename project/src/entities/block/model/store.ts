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
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const newBlockContents: string[] = [];
    let currentBlockLines: string[] = [];

    // Parse blocks sliced by H1 ('# ') or H2 ('## ').
    // Lines inside fenced code blocks (``` / ~~~) are intentionally excluded
    // from slice boundary detection to prevent code comments like '# note'
    // from breaking the document into spurious editor blocks.
    let insideCodeFence = false;
    lines.forEach((line) => {
      // Toggle fence state; the delimiter line itself is not a boundary
      if (/^(`{3,}|~{3,})/.test(line)) {
        insideCodeFence = !insideCodeFence;
        currentBlockLines.push(line);
        return;
      }
      if (!insideCodeFence && (line.startsWith('# ') || line.startsWith('## '))) {
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

    // Preserve block identity by matching on the first line (heading text).
    // This is more robust than index-based matching: if a new block is inserted
    // in the middle, existing blocks keep their IDs regardless of position shift.
    const currentBlocks = get().blocks;
    const headingKeyOf = (text: string) => text.split('\n')[0];
    const existingByKey = new Map<string, EditorBlock>();
    currentBlocks.forEach(b => {
      const key = headingKeyOf(b.content);
      // Only register the first occurrence per heading key to avoid ambiguity
      if (!existingByKey.has(key)) existingByKey.set(key, b);
    });

    const usedIds = new Set<string>();
    const updatedBlocks: EditorBlock[] = newBlockContents.map((blockText) => {
      const key = headingKeyOf(blockText);
      const existing = existingByKey.get(key);
      if (existing && !usedIds.has(existing.id)) {
        usedIds.add(existing.id);
        return { id: existing.id, content: blockText };
      }
      // New block — assign a fresh ID
      return { id: generateId(), content: blockText };
    });

    // Keep the currently active block focused; fall back to first block
    let activeId = get().activeBlockId;
    if (!activeId || !updatedBlocks.some(b => b.id === activeId)) {
      activeId = updatedBlocks[0].id;
    }

    set({
      blocks: updatedBlocks,
      activeBlockId: activeId,
    });
  },

  getMergedContent: () => {
    return get().blocks.map(b => b.content).join('\n');
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

    // Splitting H2: Prefix the new block with H2 heading to create a new mind node
    const newBlockId = generateId();
    const newBlock: EditorBlock = {
      id: newBlockId,
      content: `## 새 노드\n${textAfter}`,
    };

    const newBlocks = [...blocks];
    newBlocks[index] = { ...targetBlock, content: textBefore };
    newBlocks.splice(index + 1, 0, newBlock);

    set({
      blocks: newBlocks,
      activeBlockId: newBlockId,
      focusOffset: 3, // Focus cursor after '## ' prefix
    });
  },

  mergeBlockWithPrevious: (id) => {
    const { blocks } = get();
    const index = blocks.findIndex(b => b.id === id);
    if (index <= 0) return; // Cannot merge first block

    const currentBlock = blocks[index];
    const previousBlock = blocks[index - 1];

    // Strip H1 or H2 header mark from current block start when merging into parent block content
    const cleanedCurrentText = currentBlock.content.replace(/^(##?)\s*/, '');
    const joinSeparator = previousBlock.content.endsWith('\n') ? '' : '\n';
    const mergedContent = previousBlock.content + joinSeparator + cleanedCurrentText;
    const focusOffset = previousBlock.content.length;

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
