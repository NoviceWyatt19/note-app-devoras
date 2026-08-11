import type { ErdDocumentV1, ErdEndpointCardinality, ErdRelation, ErdTable } from "./erd";

export type RelationSide = "left" | "right" | "top" | "bottom";

export interface TableBox {
  table: ErdTable;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RelationEndpoint {
  side: RelationSide;
  x: number;
  y: number;
  symbol: string;
  optional: boolean;
}

export interface RoutedRelation {
  from: TableBox;
  to: TableBox;
  source: RelationEndpoint;
  target: RelationEndpoint;
}

export interface RelationVisualStyle {
  color: string;
  sourceColor: string;
  targetColor: string;
  dashed: boolean;
  sourceOptional: boolean;
  targetOptional: boolean;
}

export const TABLE_WIDTH = 260;
export const HEADER_HEIGHT = 34;
export const ROW_HEIGHT = 26;

export function tableHeight(table: ErdTable): number {
  return HEADER_HEIGHT + Math.max(1, table.columns.length) * ROW_HEIGHT;
}

export function endpointSymbol(cardinality: ErdEndpointCardinality): string {
  switch (cardinality) {
    case "one":
      return "1";
    case "zero-or-one":
      return "1";
    case "many":
      return "N";
    case "zero-or-many":
      return "N";
  }
}

export function isOptionalEndpoint(cardinality: ErdEndpointCardinality): boolean {
  return cardinality === "zero-or-one" || cardinality === "zero-or-many";
}

export function relationSymbols(relation: ErdRelation): { source: string; target: string } {
  return {
    source: endpointSymbol(relation.fromCardinality),
    target: endpointSymbol(relation.toCardinality)
  };
}

export function relationVisualStyle(relation: ErdRelation): RelationVisualStyle {
  return {
    color: endpointColor(relation.fromCardinality) === endpointColor(relation.toCardinality)
      ? endpointColor(relation.fromCardinality)
      : "var(--text-normal, #667085)",
    sourceColor: endpointColor(relation.fromCardinality),
    targetColor: endpointColor(relation.toCardinality),
    dashed: isOptionalEndpoint(relation.fromCardinality) || isOptionalEndpoint(relation.toCardinality),
    sourceOptional: isOptionalEndpoint(relation.fromCardinality),
    targetOptional: isOptionalEndpoint(relation.toCardinality)
  };
}

export function buildTableBoxes(document: ErdDocumentV1): TableBox[] {
  return document.tables.map((table) => ({
    table,
    x: table.position.x,
    y: table.position.y,
    width: TABLE_WIDTH,
    height: tableHeight(table)
  }));
}

export function routeRelation(document: ErdDocumentV1, relation: ErdRelation, boxes: TableBox[]): RoutedRelation | null {
  const from = boxes.find((box) => box.table.id === relation.fromTable);
  const to = boxes.find((box) => box.table.id === relation.toTable);
  if (!from || !to) return null;

  const sourceSide = sideToward(from, to);
  const targetSide = sideToward(to, from);
  const symbols = relationSymbols(relation);

  return {
    from,
    to,
    source: {
      ...pointOnSide(from, sourceSide),
      side: sourceSide,
      symbol: symbols.source,
      optional: isOptionalEndpoint(relation.fromCardinality)
    },
    target: {
      ...pointOnSide(to, targetSide),
      side: targetSide,
      symbol: symbols.target,
      optional: isOptionalEndpoint(relation.toCardinality)
    }
  };
}

export function handleId(side: RelationSide): string {
  return side;
}

export function oppositeSide(side: RelationSide): RelationSide {
  if (side === "left") return "right";
  if (side === "right") return "left";
  if (side === "top") return "bottom";
  return "top";
}

function sideToward(from: TableBox, to: TableBox): RelationSide {
  const fromCenter = center(from);
  const toCenter = center(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

function pointOnSide(box: TableBox, side: RelationSide): { x: number; y: number } {
  switch (side) {
    case "left":
      return { x: box.x, y: box.y + box.height / 2 };
    case "right":
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case "top":
      return { x: box.x + box.width / 2, y: box.y };
    case "bottom":
      return { x: box.x + box.width / 2, y: box.y + box.height };
  }
}

function center(box: TableBox): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

function endpointColor(cardinality: ErdEndpointCardinality): string {
  return hasMany(cardinality)
    ? "var(--text-normal, #667085)"
    : "var(--text-accent, #7c3aed)";
}

function hasMany(cardinality: ErdEndpointCardinality): boolean {
  return cardinality === "many" || cardinality === "zero-or-many";
}
