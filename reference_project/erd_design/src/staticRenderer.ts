import type { ErdDocumentV1, ErdRelation, ErdTable } from "./erd";
import { relationLabel } from "./erd";
import { buildTableBoxes, HEADER_HEIGHT, ROW_HEIGHT, TABLE_WIDTH, relationVisualStyle, routeRelation, type RelationSide, type TableBox } from "./relations";

export interface ErdSvgOptions {
  fitToContent?: boolean;
  padding?: number;
  minWidth?: number;
  minHeight?: number;
}

export function generateErdSvg(document: ErdDocumentV1, options: ErdSvgOptions = {}): string {
  const tables = buildTableBoxes(document);

  const bounds = getBounds(tables);
  const padding = options.padding ?? 32;
  const minWidth = options.fitToContent ? (options.minWidth ?? 0) : (options.minWidth ?? 720);
  const minHeight = options.fitToContent ? (options.minHeight ?? 0) : (options.minHeight ?? 420);
  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;
  const width = Math.max(minWidth, bounds.maxX - bounds.minX + padding * 2);
  const height = Math.max(minHeight, bounds.maxY - bounds.minY + padding * 2);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="ERD diagram">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" />`,
    ...document.relations.map((relation) => renderRelation(document, relation, tables, offsetX, offsetY)),
    ...tables.map((entry) => renderTable(entry, offsetX, offsetY)),
    "</svg>"
  ].join("");
}

export function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function svgToPngBlob(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG export failed.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderTable(entry: TableBox, offsetX: number, offsetY: number): string {
  const x = entry.x + offsetX;
  const y = entry.y + offsetY;
  const rows = entry.table.columns.length > 0
    ? entry.table.columns
    : [{ id: "__empty", name: "(no columns)", type: "", nullable: true }];

  return [
    `<g class="erd-table" transform="translate(${x} ${y})">`,
    `<rect width="${entry.width}" height="${entry.height}" rx="8" fill="#ffffff" stroke="#d0d5dd" />`,
    `<rect width="${entry.width}" height="${HEADER_HEIGHT}" rx="8" fill="#0f172a" />`,
    `<path d="M0 ${HEADER_HEIGHT - 8} H${entry.width} V${HEADER_HEIGHT} H0 Z" fill="#0f172a" />`,
    `<text x="14" y="22" fill="#ffffff" font-size="14" font-family="ui-sans-serif, system-ui" font-weight="700">${escapeXml(entry.table.name)}</text>`,
    ...rows.map((column, index) => {
      const rowY = HEADER_HEIGHT + index * ROW_HEIGHT;
      const badges = [
        column.primaryKey ? "PK" : "",
        column.foreignKey ? "FK" : "",
        column.unique ? "UQ" : ""
      ].filter(Boolean).join(" ");
      return [
        `<line x1="0" y1="${rowY}" x2="${entry.width}" y2="${rowY}" stroke="#eaecf0" />`,
        `<text x="14" y="${rowY + 17}" fill="#101828" font-size="12" font-family="ui-sans-serif, system-ui">${escapeXml(column.name)}</text>`,
        `<text x="124" y="${rowY + 17}" fill="#667085" font-size="12" font-family="ui-sans-serif, system-ui">${escapeXml(column.type)}</text>`,
        badges ? `<text x="${entry.width - 14}" y="${rowY + 17}" fill="#475467" text-anchor="end" font-size="11" font-family="ui-sans-serif, system-ui">${escapeXml(badges)}</text>` : ""
      ].join("");
    }),
    "</g>"
  ].join("");
}

function renderRelation(
  document: ErdDocumentV1,
  relation: ErdRelation,
  tables: TableBox[],
  offsetX: number,
  offsetY: number
): string {
  const route = routeRelation(document, relation, tables);
  if (!route) return "";

  const start = { x: route.source.x + offsetX, y: route.source.y + offsetY };
  const end = { x: route.target.x + offsetX, y: route.target.y + offsetY };
  const midX = start.x + (end.x - start.x) / 2;
  const midY = start.y + (end.y - start.y) / 2;
  const label = relationLabel(document, relation);
  const style = relationVisualStyle(relation);
  const dash = style.dashed ? " stroke-dasharray=\"7 5\"" : "";
  const sourceLabel = endpointTextPosition(start.x, start.y, route.source.side);
  const targetLabel = endpointTextPosition(end.x, end.y, route.target.side);

  return [
    `<path d="M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}" fill="none" stroke="${style.color}" stroke-width="2"${dash} />`,
    route.source.optional ? `<circle cx="${start.x}" cy="${start.y}" r="5" fill="#f8fafc" stroke="${style.sourceColor}" stroke-width="2" />` : "",
    route.target.optional ? `<circle cx="${end.x}" cy="${end.y}" r="5" fill="#f8fafc" stroke="${style.targetColor}" stroke-width="2" />` : "",
    `<text x="${sourceLabel.x}" y="${sourceLabel.y}" fill="${style.sourceColor}" text-anchor="${sourceLabel.anchor}" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-weight="700">${escapeXml(route.source.symbol)}</text>`,
    `<text x="${targetLabel.x}" y="${targetLabel.y}" fill="${style.targetColor}" text-anchor="${targetLabel.anchor}" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-weight="700">${escapeXml(route.target.symbol)}</text>`,
    `<text x="${midX}" y="${midY - 8}" fill="${style.color}" text-anchor="middle" font-size="11" font-family="ui-sans-serif, system-ui">${escapeXml(label)}</text>`
  ].join("");
}

function endpointTextPosition(
  x: number,
  y: number,
  side: RelationSide
): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  switch (side) {
    case "left":
      return { x: x - 24, y: y - 10, anchor: "end" };
    case "right":
      return { x: x + 24, y: y - 10, anchor: "start" };
    case "top":
      return { x: x + 14, y: y - 14, anchor: "start" };
    case "bottom":
      return { x: x + 14, y: y + 22, anchor: "start" };
  }
}

function getBounds(tables: TableBox[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (tables.length === 0) return { minX: 0, minY: 0, maxX: 720, maxY: 420 };
  return tables.reduce(
    (bounds, entry) => ({
      minX: Math.min(bounds.minX, entry.x),
      minY: Math.min(bounds.minY, entry.y),
      maxX: Math.max(bounds.maxX, entry.x + entry.width),
      maxY: Math.max(bounds.maxY, entry.y + entry.height)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load SVG for PNG export."));
    image.src = url;
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
