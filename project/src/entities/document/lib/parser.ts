import { buildHeadingId, parseHeadingLine } from '@/shared/lib/headingId';

export interface MindNode {
  id: string; // Hierarchical path (e.g. "Root/SubNode") to uniquely identify even if duplicates exist
  label: string; // The heading text itself
  level: number; // 1 to 6
  parentId: string | null;
  x: number;
  y: number;
}

/**
 * Parses markdown content to extract the heading nodes tree.
 *
 * Code fences (``` / ~~~) are tracked so that headings written inside a
 * fenced code block are never mistaken for mind-map nodes.
 */
export function parseMarkdown(content: string): MindNode[] {
  const nodes: MindNode[] = [];
  const lines = content.split('\n');

  const activeHeaders: MindNode[] = []; // Stack to keep track of parents
  const siblingCountMap: Record<string, number> = {};

  // Track whether the current line is inside a fenced code block (``` or ~~~).
  // Headings inside code fences must NOT be parsed as mind nodes.
  let insideCodeFence = false;

  lines.forEach((line) => {
    // Toggle fence state on opening/closing delimiters
    if (/^(`{3,}|~{3,})/.test(line)) {
      insideCodeFence = !insideCodeFence;
      return; // The fence delimiter line itself is never a heading
    }
    // Skip all content inside a code fence
    if (insideCodeFence) return;

    const parsed = parseHeadingLine(line);
    if (!parsed) return;

    const { level, label } = parsed;

    // Find parent from stack: last header with level < current level
    let parent: MindNode | null = null;
    for (let i = activeHeaders.length - 1; i >= 0; i--) {
      if (activeHeaders[i].level < level) {
        parent = activeHeaders[i];
        break;
      }
    }

    // Generate a stable, unique ID using the shared utility
    const id = buildHeadingId(label, parent ? parent.id : null, siblingCountMap);

    const node: MindNode = {
      id,
      label,
      level,
      parentId: parent ? parent.id : null,
      x: 0,
      y: 0,
    };

    // Keep only parents of higher hierarchy in the stack
    while (activeHeaders.length > 0 && activeHeaders[activeHeaders.length - 1].level >= level) {
      activeHeaders.pop();
    }
    activeHeaders.push(node);
    nodes.push(node);
  });

  // Apply default layout coordinates for nodes (initial tree layout representation)
  let yOffset = 100;
  nodes.forEach((node) => {
    node.x = node.level * 220;
    node.y = yOffset;
    yOffset += 120;
  });

  return nodes;
}
