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

/**
 * Derives canonical keys for a list of block contents, accumulating the
 * parent-stack state sequentially across the entire list.
 *
 * This is the single source of truth for the stack pop/push logic that was
 * previously duplicated between the newKeys loop and the existingByKey loop
 * in setBlocksFromContent. Any change to heading traversal rules only needs
 * to be made here.
 */
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

    // Build canonical keys for every new block. Keys are identical to the
    // corresponding MindNode IDs produced by the markdown parser, enabling
    // reliable cross-layer mapping.
    const newKeys = deriveKeysWithParentStack(newBlockContents);

    // Preserve existing block IDs by matching canonical keys.
    // deriveKeysWithParentStack guarantees the same sequential parent-stack
    // accumulation for both old and new keys, so H2+ block paths are consistent
    // (e.g. "Title/Section A" not just "Section A") and IDs are correctly preserved.
    const currentBlocks = get().blocks;
    const oldKeys = deriveKeysWithParentStack(currentBlocks.map((b) => b.content));
    const existingByKey = new Map<string, EditorBlock>();
    currentBlocks.forEach((b, i) => {
      if (!existingByKey.has(oldKeys[i])) existingByKey.set(oldKeys[i], b);
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
