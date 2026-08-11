export const ERD_CODE_BLOCK_LANGUAGE = "obsidian-erd";

export type ErdLegacyCardinality =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many";

export type ErdEndpointCardinality =
  | "one"
  | "zero-or-one"
  | "many"
  | "zero-or-many";

export interface ErdPoint {
  x: number;
  y: number;
}

export interface ErdColumn {
  id: string;
  name: string;
  type: string;
  primaryKey?: boolean;
  foreignKey?: boolean;
  unique?: boolean;
  nullable?: boolean;
}

export interface ErdTable {
  id: string;
  name: string;
  columns: ErdColumn[];
  position: ErdPoint;
}

export interface ErdRelation {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  fromCardinality: ErdEndpointCardinality;
  toCardinality: ErdEndpointCardinality;
}

export interface ErdDocumentV1 {
  version: 1;
  tables: ErdTable[];
  relations: ErdRelation[];
}

export interface ErdValidationResult {
  valid: boolean;
  errors: string[];
}

export function createEmptyErdDocument(): ErdDocumentV1 {
  return {
    version: 1,
    tables: [
      {
        id: "table_1",
        name: "users",
        position: { x: 120, y: 80 },
        columns: [
          {
            id: "column_1",
            name: "id",
            type: "uuid",
            primaryKey: true,
            nullable: false
          },
          {
            id: "column_2",
            name: "email",
            type: "varchar",
            unique: true,
            nullable: false
          }
        ]
      },
      {
        id: "table_2",
        name: "posts",
        position: { x: 460, y: 120 },
        columns: [
          {
            id: "column_1",
            name: "id",
            type: "uuid",
            primaryKey: true,
            nullable: false
          },
          {
            id: "column_2",
            name: "user_id",
            type: "uuid",
            foreignKey: true,
            nullable: false
          }
        ]
      }
    ],
    relations: [
      {
        id: "relation_1",
        fromTable: "table_2",
        fromColumn: "column_2",
        toTable: "table_1",
        toColumn: "column_1",
        fromCardinality: "zero-or-many",
        toCardinality: "one"
      }
    ]
  };
}

export function parseErdDocument(source: string): ErdDocumentV1 {
  const parsed = JSON.parse(source) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("ERD document must be a JSON object.");
  }
  if (parsed.version !== 1) {
    throw new Error("Only ERD document version 1 is supported.");
  }
  if (!Array.isArray(parsed.tables) || !Array.isArray(parsed.relations)) {
    throw new Error("ERD document must include tables and relations arrays.");
  }

  return {
    version: 1,
    tables: parsed.tables.map(normalizeTable),
    relations: parsed.relations.map(normalizeRelation)
  };
}

export function serializeErdDocument(document: ErdDocumentV1): string {
  return JSON.stringify(document, null, 2);
}

export function createErdCodeBlock(document: ErdDocumentV1): string {
  return [
    `\`\`\`${ERD_CODE_BLOCK_LANGUAGE}`,
    serializeErdDocument(document),
    "```"
  ].join("\n");
}

export function validateErdDocument(document: ErdDocumentV1): ErdValidationResult {
  const errors: string[] = [];
  const tableIds = new Set<string>();

  for (const table of document.tables) {
    if (!table.id.trim()) errors.push("Table id cannot be empty.");
    if (tableIds.has(table.id)) errors.push(`Duplicate table id: ${table.id}`);
    tableIds.add(table.id);

    const columnIds = new Set<string>();
    for (const column of table.columns) {
      if (!column.id.trim()) {
        errors.push(`Column id cannot be empty in table ${table.id}.`);
      }
      if (columnIds.has(column.id)) {
        errors.push(`Duplicate column id in ${table.id}: ${column.id}`);
      }
      columnIds.add(column.id);
    }
  }

  for (const relation of document.relations) {
    const fromTable = document.tables.find((table) => table.id === relation.fromTable);
    const toTable = document.tables.find((table) => table.id === relation.toTable);

    if (!fromTable) {
      errors.push(`Relation ${relation.id} references missing source table: ${relation.fromTable}`);
      continue;
    }
    if (!toTable) {
      errors.push(`Relation ${relation.id} references missing target table: ${relation.toTable}`);
      continue;
    }
    if (!fromTable.columns.some((column) => column.id === relation.fromColumn)) {
      errors.push(`Relation ${relation.id} references missing source column: ${relation.fromTable}.${relation.fromColumn}`);
    }
    if (!toTable.columns.some((column) => column.id === relation.toColumn)) {
      errors.push(`Relation ${relation.id} references missing target column: ${relation.toTable}.${relation.toColumn}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function sanitizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || fallback;
}

export function makeUniqueId(base: string, existing: Iterable<string>): string {
  const seen = new Set(existing);
  if (!seen.has(base)) return base;
  let suffix = 2;
  while (seen.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function relationLabel(document: ErdDocumentV1, relation: ErdRelation): string {
  const fromTable = document.tables.find((table) => table.id === relation.fromTable);
  const toTable = document.tables.find((table) => table.id === relation.toTable);
  const fromName = fromTable?.name ?? relation.fromTable;
  const toName = toTable?.name ?? relation.toTable;
  const fromColumnName = fromTable?.columns.find((column) => column.id === relation.fromColumn)?.name ?? relation.fromColumn;
  const toColumnName = toTable?.columns.find((column) => column.id === relation.toColumn)?.name ?? relation.toColumn;
  return `${fromName}.${fromColumnName} -> ${toName}.${toColumnName}`;
}

function normalizeTable(value: unknown): ErdTable {
  if (!isRecord(value)) throw new Error("Each table must be an object.");
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    throw new Error("Each table must include string id and name.");
  }
  if (!Array.isArray(value.columns)) {
    throw new Error(`Table ${value.id} must include a columns array.`);
  }

  const position = isRecord(value.position) ? value.position : {};
  const x = typeof position.x === "number" ? position.x : 0;
  const y = typeof position.y === "number" ? position.y : 0;

  return {
    id: value.id,
    name: value.name,
    position: { x, y },
    columns: value.columns.map(normalizeColumn)
  };
}

function normalizeColumn(value: unknown): ErdColumn {
  if (!isRecord(value)) throw new Error("Each column must be an object.");
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    throw new Error("Each column must include string id and name.");
  }

  return {
    id: value.id,
    name: value.name,
    type: typeof value.type === "string" ? value.type : "",
    primaryKey: value.primaryKey === true,
    foreignKey: value.foreignKey === true,
    unique: value.unique === true,
    nullable: value.nullable !== false
  };
}

function normalizeRelation(value: unknown): ErdRelation {
  if (!isRecord(value)) throw new Error("Each relation must be an object.");
  const fields = ["id", "fromTable", "fromColumn", "toTable", "toColumn"];
  for (const field of fields) {
    if (typeof value[field] !== "string") {
      throw new Error(`Relation field ${field} must be a string.`);
    }
  }
  const endpointCardinality = normalizeEndpointCardinality(value);

  return {
    id: value.id as string,
    fromTable: value.fromTable as string,
    fromColumn: value.fromColumn as string,
    toTable: value.toTable as string,
    toColumn: value.toColumn as string,
    fromCardinality: endpointCardinality.fromCardinality,
    toCardinality: endpointCardinality.toCardinality
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeEndpointCardinality(value: Record<string, unknown>): {
  fromCardinality: ErdEndpointCardinality;
  toCardinality: ErdEndpointCardinality;
} {
  if (isEndpointCardinality(value.fromCardinality) && isEndpointCardinality(value.toCardinality)) {
    return {
      fromCardinality: value.fromCardinality,
      toCardinality: value.toCardinality
    };
  }
  if (isLegacyCardinality(value.cardinality)) {
    return legacyToEndpointCardinality(value.cardinality);
  }
  throw new Error("Relation must include fromCardinality and toCardinality.");
}

function legacyToEndpointCardinality(cardinality: ErdLegacyCardinality): {
  fromCardinality: ErdEndpointCardinality;
  toCardinality: ErdEndpointCardinality;
} {
  switch (cardinality) {
    case "one-to-one":
      return { fromCardinality: "one", toCardinality: "one" };
    case "one-to-many":
      return { fromCardinality: "one", toCardinality: "zero-or-many" };
    case "many-to-one":
      return { fromCardinality: "zero-or-many", toCardinality: "one" };
    case "many-to-many":
      return { fromCardinality: "zero-or-many", toCardinality: "zero-or-many" };
  }
}

function isEndpointCardinality(value: unknown): value is ErdEndpointCardinality {
  return value === "one"
    || value === "zero-or-one"
    || value === "many"
    || value === "zero-or-many";
}

function isLegacyCardinality(value: unknown): value is ErdLegacyCardinality {
  return value === "one-to-one"
    || value === "one-to-many"
    || value === "many-to-one"
    || value === "many-to-many";
}
