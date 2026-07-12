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
 */
export function parseMarkdown(content: string): MindNode[] {
  const nodes: MindNode[] = [];
  const lines = content.split('\n');
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  const activeHeaders: MindNode[] = []; // Stack to keep track of parents
  const siblingCountMap: Record<string, number> = {};

  lines.forEach((line) => {
    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const label = headingMatch[2].trim();

      // Find parent from stack: last header in stack with level < current level
      let parent: MindNode | null = null;
      for (let i = activeHeaders.length - 1; i >= 0; i--) {
        if (activeHeaders[i].level < level) {
          parent = activeHeaders[i];
          break;
        }
      }

      // Generate a unique ID based on full path to handle duplicate names
      const parentId = parent ? parent.id : null;
      const basePath = parentId ? `${parentId}/${label}` : label;

      // Track sibling counts to avoid duplicate IDs for identical headers
      if (siblingCountMap[basePath] === undefined) {
        siblingCountMap[basePath] = 1;
      } else {
        siblingCountMap[basePath]++;
      }

      const count = siblingCountMap[basePath];
      const id = count > 1 ? `${basePath}_${count}` : basePath;

      const node: MindNode = {
        id,
        label,
        level,
        parentId,
        x: 0,
        y: 0,
      };

      // Keep only parents of higher hierarchy in the stack
      while (activeHeaders.length > 0 && activeHeaders[activeHeaders.length - 1].level >= level) {
        activeHeaders.pop();
      }
      activeHeaders.push(node);
      nodes.push(node);
    }
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
