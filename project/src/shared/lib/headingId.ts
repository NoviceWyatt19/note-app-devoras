/**
 * Shared heading ID generation logic.
 *
 * Both the markdown parser (for mind-map nodes) and the block editor store
 * (for CodeMirror block identity) use this same function so that a given
 * heading always maps to the same canonical key regardless of which layer
 * is asking for it.
 *
 * Format: "parentId/headingText" for nested headings, "headingText" for root.
 * Duplicate siblings get a numeric suffix: "Title", "Title_2", "Title_3", …
 */
export function buildHeadingId(
  label: string,
  parentId: string | null,
  siblingCountMap: Record<string, number>,
): string {
  const basePath = parentId ? `${parentId}/${label}` : label;

  if (siblingCountMap[basePath] === undefined) {
    siblingCountMap[basePath] = 1;
  } else {
    siblingCountMap[basePath]++;
  }

  const count = siblingCountMap[basePath];
  return count > 1 ? `${basePath}_${count}` : basePath;
}

/**
 * Extracts the heading level and label from a raw markdown heading line.
 * Returns null when the line is not a heading.
 *
 * Examples:
 *   "## My Section"  →  { level: 2, label: "My Section" }
 *   "Normal text"    →  null
 */
export function parseHeadingLine(
  line: string,
): { level: number; label: string } | null {
  const match = /^(#{1,6})\s+(.+)$/.exec(line);
  if (!match) return null;
  return { level: match[1].length, label: match[2].trim() };
}
