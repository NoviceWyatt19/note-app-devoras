import { MindNode } from '@/entities/document/lib/parser';

/**
 * Extracts the markdown body text of the section that starts at `targetNode`.
 *
 * The section extends from the line immediately after the target heading
 * to the line just before the next heading of the same or higher level
 * (i.e., level <= targetNode.level), or the end of the document.
 *
 * @param rawContent  Full markdown string of the currently open document
 * @param targetNode  The MindNode whose section content we want
 * @param allNodes    All nodes in document order (from useDocumentStore().nodes)
 * @returns           Trimmed markdown string of the section body.
 *                    Returns empty string if the section has no body content.
 */
export function extractSectionContent(
  rawContent: string,
  targetNode: MindNode,
): string {
  if (!rawContent) return '';

  const lines = rawContent.split('\n');

  // Find the 0-based line index of the target heading
  const headingPattern = new RegExp(
    `^#{${targetNode.level}}\\s+${escapeRegex(targetNode.label)}\\s*$`,
  );

  let headingLineIndex = -1;
  let insideFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code fences so we don't mistake headings inside them
    if (/^(`{3,}|~{3,})/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    if (headingPattern.test(line)) {
      headingLineIndex = i;
      break;
    }
  }

  if (headingLineIndex === -1) return '';

  // Scan forward to find the next heading at same or higher level
  let endLineIndex = lines.length; // exclusive
  insideFence = false;

  for (let i = headingLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (/^(`{3,}|~{3,})/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    // Detect any heading with level <= target level
    const levelMatch = line.match(/^(#{1,6})\s/);
    if (levelMatch && levelMatch[1].length <= targetNode.level) {
      endLineIndex = i;
      break;
    }
  }

  return lines
    .slice(headingLineIndex + 1, endLineIndex)
    .join('\n')
    .trim();
}

/** Escapes special regex characters in a string literal. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
