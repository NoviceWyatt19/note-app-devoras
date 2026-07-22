import { create } from 'zustand';
import { buildHeadingId, parseHeadingLine } from '@/shared/lib/headingId';

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

/**
 * Derives a canonical key for a block from its content using the same
 * buildHeadingId logic as the markdown parser.  This ensures that a block
 * in the editor and the corresponding MindNode share the same ID so the two
 * layers can be reliably cross-referenced.
 *
 * For a block whose first line is a heading (H1 or H2), the key is the
 * hierarchical path produced by buildHeadingId.  For any other content,
 * a simple first-line key is returned as a best-effort fallback.
 */
function deriveBlockKey(
  content: string,
  parentKeyStack: { level: number; key: string }[],
  siblingCountMap: Record<string, number>,
): string {
  const firstLine = content.split('\n')[0];
  const parsed = parseHeadingLine(firstLine);
  if (!parsed) return firstLine; // non-heading block — use raw first line

  // Find the closest ancestor whose level is strictly less than ours
  let parentKey: string | null = null;
  for (let i = parentKeyStack.length - 1; i >= 0; i--) {
    if (parentKeyStack[i].level < parsed.level) {
      parentKey = parentKeyStack[i].key;
      break;
    }
  }

  return buildHeadingId(parsed.label, parentKey, siblingCountMap);
}

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

    // Build canonical keys for every new block using the shared ID utility.
    // This makes each block's key identical to the corresponding MindNode's id
    // produced by the markdown parser — enabling reliable cross-layer mapping.
    const siblingCountMap: Record<string, number> = {};
    const parentKeyStack: { level: number; key: string }[] = [];
    const newKeys: string[] = newBlockContents.map((blockText) => {
      const key = deriveBlockKey(blockText, parentKeyStack, siblingCountMap);
      const firstLine = blockText.split('\n')[0];
      const parsed = parseHeadingLine(firstLine);
      if (parsed) {
        // Maintain the parent stack so nested headings resolve their parent correctly
        while (parentKeyStack.length > 0 && parentKeyStack[parentKeyStack.length - 1].level >= parsed.level) {
          parentKeyStack.pop();
        }
        parentKeyStack.push({ level: parsed.level, key });
      }
      return key;
    });

    // Preserve existing block IDs by matching on canonical keys.
    // IMPORTANT: old block keys must be derived using the SAME sequential
    // parent-stack accumulation as new block keys. Deriving them in isolation
    // (empty parentStack per block) produces a different path for H2+ blocks
    // (e.g. "Section A" instead of "Title/Section A"), causing every H2 block
    // to receive a new random ID on every re-slice and making it impossible to
    // identify the truly new block — which was the root cause of the cursor
    // always jumping to the first H2 instead of the newly created block.
    const currentBlocks = get().blocks;
    const oldSiblingCountMap: Record<string, number> = {};
    const oldParentKeyStack: { level: number; key: string }[] = [];
    const existingByKey = new Map<string, EditorBlock>();
    currentBlocks.forEach((b) => {
      const key = deriveBlockKey(b.content, oldParentKeyStack, oldSiblingCountMap);
      // Maintain old parent stack identically to the new-key derivation loop
      const firstLine = b.content.split('\n')[0];
      const parsed = parseHeadingLine(firstLine);
      if (parsed) {
        while (oldParentKeyStack.length > 0 && oldParentKeyStack[oldParentKeyStack.length - 1].level >= parsed.level) {
          oldParentKeyStack.pop();
        }
        oldParentKeyStack.push({ level: parsed.level, key });
      }
      if (!existingByKey.has(key)) existingByKey.set(key, b);
    });

    const usedIds = new Set<string>();
    const updatedBlocks: EditorBlock[] = newBlockContents.map((blockText, i) => {
      const key = newKeys[i];
      const existing = existingByKey.get(key);
      if (existing && !usedIds.has(existing.id)) {
        usedIds.add(existing.id);
        return { id: existing.id, content: blockText };
      }
      return { id: generateId(), content: blockText };
    });

    // Pure block transformation: only update the blocks array.
    // Cursor positioning (activeBlockId, focusOffset) is entirely delegated to callers:
    //   - handleBlockUpdate uses absoluteCursorPos-based mapping for all re-slice cases
    //     (both promotion and demotion), eliminating the junction-point approximation
    //     that Case A/B used to impose.
    //   - FileExplorer calls focusBlock(blocks[0].id, 0) after file load / creation.
    set({ blocks: updatedBlocks });

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
