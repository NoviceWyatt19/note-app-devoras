export interface MindNode {
  id: string; // Hierarchical path (e.g. "Root/SubNode") to uniquely identify even if duplicates exist
  label: string; // The heading text itself
  level: number; // 1 to 6
  parentId: string | null;
  x: number;
  y: number;
}

export interface SpatialData {
  [nodeId: string]: { x: number; y: number };
}

/**
 * Parses markdown to extract headings and link them with spatial metadata (X, Y).
 */
export function parseMarkdown(content: string, filePath: string): { nodes: MindNode[]; spatialData: SpatialData } {
  const nodes: MindNode[] = [];
  const lines = content.split('\n');
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  // 1. Parse spatial metadata from comments
  // Formats: <!-- devoras:spatial {"/path/to/file.md": {"HeadingName": {"x": 100, "y": 200}}} -->
  let spatialData: SpatialData = {};
  const spatialRegex = /<!--\s*devoras:spatial\s*([\s\S]*?)\s*-->/g;
  let match;
  while ((match = spatialRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed[filePath]) {
        spatialData = parsed[filePath];
      } else {
        // Fallback: If it's a flat format without file prefix
        spatialData = parsed;
      }
    } catch (e) {
      console.warn('Failed to parse devoras:spatial metadata comment:', e);
    }
  }

  // 2. Parse headings
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

      // Coordinate matching: Check by full ID first, fall back to label
      const coords = spatialData[id] || spatialData[label] || { x: 0, y: 0 };

      const node: MindNode = {
        id,
        label,
        level,
        parentId,
        x: coords.x,
        y: coords.y,
      };

      // Keep only parents of higher hierarchy in the stack
      while (activeHeaders.length > 0 && activeHeaders[activeHeaders.length - 1].level >= level) {
        activeHeaders.pop();
      }
      activeHeaders.push(node);
      nodes.push(node);
    }
  });

  // 3. Apply default layout coordinates for nodes without custom positions
  // We lay them out in a simple vertical-horizontal tree structure initially
  let yOffset = 100;
  nodes.forEach((node) => {
    if (node.x === 0 && node.y === 0) {
      node.x = node.level * 220;
      node.y = yOffset;
      yOffset += 120;
    }
  });

  return { nodes, spatialData };
}

/**
 * Updates spatial metadata comments in the markdown content.
 */
export function serializeSpatialData(
  content: string,
  filePath: string,
  spatialData: SpatialData
): string {
  // Strip existing comments first to avoid duplicate comments
  const spatialRegex = /<!--\s*devoras:spatial\s*([\s\S]*?)\s*-->/g;
  const strippedContent = content.replace(spatialRegex, '').trimEnd();

  const metadata = {
    [filePath]: spatialData,
  };

  const comment = `\n\n<!-- devoras:spatial ${JSON.stringify(metadata)} -->`;
  return strippedContent + comment;
}
