import { ERD_CODE_BLOCK_LANGUAGE } from "./erd";

export interface ErdBlockRange {
  lineStart: number;
  lineEnd: number;
  source: string;
}

const OPENING_FENCE = new RegExp(`^\\s*\`\`\`${ERD_CODE_BLOCK_LANGUAGE}\\s*$`);
const ANY_FENCE = /^\s*```\s*$/;

export function findErdBlocks(markdown: string): ErdBlockRange[] {
  const lines = markdown.split("\n");
  const blocks: ErdBlockRange[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!OPENING_FENCE.test(lines[index])) {
      index += 1;
      continue;
    }

    const lineStart = index;
    index += 1;
    const contentStart = index;
    while (index < lines.length && !ANY_FENCE.test(lines[index])) {
      index += 1;
    }

    if (index < lines.length) {
      blocks.push({
        lineStart,
        lineEnd: index,
        source: lines.slice(contentStart, index).join("\n")
      });
    }
    index += 1;
  }

  return blocks;
}

export function findErdBlockAtLine(markdown: string, line: number): ErdBlockRange | null {
  return findErdBlocks(markdown).find((block) => line >= block.lineStart && line <= block.lineEnd) ?? null;
}

export function replaceErdBlock(markdown: string, range: ErdBlockRange, nextBlock: string): string {
  const lines = markdown.split("\n");
  lines.splice(range.lineStart, range.lineEnd - range.lineStart + 1, ...nextBlock.split("\n"));
  return lines.join("\n");
}
