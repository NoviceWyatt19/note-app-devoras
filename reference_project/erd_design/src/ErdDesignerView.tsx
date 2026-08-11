import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView, Notice, TFile } from "obsidian";
import React, { useCallback, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps
} from "@xyflow/react";
import { replaceErdBlock, type ErdBlockRange } from "./blocks";
import type { ErdDesignerSettings } from "./settings";
import {
  createErdCodeBlock,
  type ErdColumn,
  type ErdDocumentV1,
  type ErdEndpointCardinality,
  type ErdRelation,
  type ErdTable,
  makeUniqueId,
  relationLabel,
  serializeErdDocument,
  validateErdDocument
} from "./erd";
import { downloadBlob, downloadTextFile, generateErdSvg, svgToPngBlob } from "./staticRenderer";
import { buildTableBoxes, handleId, relationSymbols, relationVisualStyle, routeRelation } from "./relations";

export const ERD_VIEW_TYPE = "erd-designer-view";

export interface ErdViewTarget {
  filePath: string;
  block: ErdBlockRange;
  document: ErdDocumentV1;
}

interface ErdDesignerProps {
  app: App;
  target: ErdViewTarget | null;
  settings: ErdDesignerSettings;
  onSave: (target: ErdViewTarget, document: ErdDocumentV1) => Promise<ErdViewTarget>;
  onExportSvg: (document: ErdDocumentV1, filePath: string) => void;
  onExportPng: (document: ErdDocumentV1, filePath: string) => Promise<void>;
}

type Selection =
  | { type: "table"; id: string }
  | { type: "relation"; id: string }
  | null;

type TableNodeData = {
  table: ErdTable;
};

type ErdEdgeData = {
  relation: ErdRelation;
  sourceSymbol: string;
  targetSymbol: string;
  color: string;
  sourceColor: string;
  targetColor: string;
  dashed: boolean;
  sourceOptional: boolean;
  targetOptional: boolean;
};

const endpointCardinalityOptions: ErdEndpointCardinality[] = [
  "one",
  "zero-or-one",
  "many",
  "zero-or-many"
];

type EndpointSymbolStyle = {
  textAlign: React.CSSProperties["textAlign"];
  transform: string;
};

export class ErdDesignerView extends ItemView {
  private root: Root | null = null;
  private target: ErdViewTarget | null = null;
  private readonly settings: ErdDesignerSettings;

  constructor(leaf: WorkspaceLeaf, settings: ErdDesignerSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string {
    return ERD_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (!this.target) return "ERD Designer";
    return `ERD: ${basename(this.target.filePath)}`;
  }

  getIcon(): string {
    return "database";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("erd-designer-view");
    this.root = createRoot(this.contentEl);
    this.render();
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  setTarget(target: ErdViewTarget): void {
    this.target = target;
    this.render();
  }

  getCurrentTarget(): ErdViewTarget | null {
    return this.target;
  }

  private render(): void {
    if (!this.root) return;
    this.root.render(
      <ReactFlowProvider>
        <ErdDesigner
          app={this.app}
          target={this.target}
          settings={this.settings}
          onSave={this.saveDocument}
          onExportSvg={exportSvg}
          onExportPng={exportPng}
        />
      </ReactFlowProvider>
    );
  }

  private saveDocument = async (target: ErdViewTarget, document: ErdDocumentV1): Promise<ErdViewTarget> => {
    const file = this.app.vault.getAbstractFileByPath(target.filePath);
    if (!(file instanceof TFile)) {
      throw new Error("The source note could not be found.");
    }

    const markdown = await this.app.vault.read(file);
    const nextBlock = createErdCodeBlock(document);
    const nextMarkdown = replaceErdBlock(markdown, target.block, nextBlock);
    await this.app.vault.modify(file, nextMarkdown);

    const lineCount = nextBlock.split("\n").length;
    const nextTarget = {
      ...target,
      document,
      block: {
        lineStart: target.block.lineStart,
        lineEnd: target.block.lineStart + lineCount - 1,
        source: serializeErdDocument(document)
      }
    };
    this.target = nextTarget;
    return nextTarget;
  };
}

function ErdDesigner(props: ErdDesignerProps): JSX.Element {
  const [document, setDocument] = useState<ErdDocumentV1 | null>(props.target?.document ?? null);
  const [target, setTarget] = useState<ErdViewTarget | null>(props.target);
  const [selection, setSelection] = useState<Selection>(null);
  const [dirty, setDirty] = useState(false);
  const [markdownOpen, setMarkdownOpen] = useState(true);
  const [markdownHeight, setMarkdownHeight] = useState(220);
  const validation = useMemo(() => document ? validateErdDocument(document) : { valid: false, errors: [] }, [document]);
  const generatedMarkdown = useMemo(() => document ? createErdCodeBlock(document) : "", [document]);

  React.useEffect(() => {
    setDocument(props.target?.document ?? null);
    setTarget(props.target);
    setSelection(null);
    setDirty(false);
    setMarkdownOpen(true);
    setMarkdownHeight(220);
  }, [props.target]);

  const nodes = useMemo<Node<TableNodeData>[]>(() => document?.tables.map((table) => ({
    id: table.id,
    type: "erdTable",
    position: table.position,
    data: { table }
  })) ?? [], [document?.tables]);

  const edges = useMemo<Edge<ErdEdgeData>[]>(() => {
    if (!document) return [];
    const boxes = buildTableBoxes(document);
    return document.relations.map((relation) => {
      const route = routeRelation(document, relation, boxes);
      const symbols = relationSymbols(relation);
      const style = relationVisualStyle(relation);
      return {
        id: relation.id,
        source: relation.fromTable,
        target: relation.toTable,
        sourceHandle: route ? handleId(route.source.side) : undefined,
        targetHandle: route ? handleId(route.target.side) : undefined,
        label: relationLabel(document, relation),
        type: "erdRelation",
        data: {
          relation,
          sourceSymbol: symbols.source,
          targetSymbol: symbols.target,
          color: style.color,
          sourceColor: style.sourceColor,
          targetColor: style.targetColor,
          dashed: style.dashed,
          sourceOptional: style.sourceOptional,
          targetOptional: style.targetOptional
        }
      };
    });
  }, [document?.relations, document?.tables]);

  const updateDocument = useCallback((updater: (document: ErdDocumentV1) => ErdDocumentV1) => {
    setDocument((current) => {
      if (!current) return current;
      const next = updater(current);
      if (next !== current) {
        setDirty(true);
      }
      return next;
    });
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    updateDocument((current) => {
      const removeIds = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
      const positionById = new Map(
        changes
          .flatMap((change) => change.type === "position" && change.position ? [[change.id, change.position] as const] : [])
      );

      let changed = false;
      const tables = current.tables
        .filter((table) => {
          const keep = !removeIds.has(table.id);
          if (!keep) changed = true;
          return keep;
        })
        .map((table) => {
          const nextPosition = positionById.get(table.id);
          if (!nextPosition) return table;
          if (table.position.x === nextPosition.x && table.position.y === nextPosition.y) return table;
          changed = true;
          return { ...table, position: nextPosition };
        });

      if (!changed) return current;

      return {
        ...current,
        tables,
        relations: current.relations.filter((relation) => !removeIds.has(relation.fromTable) && !removeIds.has(relation.toTable))
      };
    });
  }, [updateDocument]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    updateDocument((current) => {
      const removeIds = new Set(
        changes.flatMap((change) => (change.type === "remove" ? [change.id] : []))
      );
      if (removeIds.size === 0) return current;
      const nextRelations = current.relations.filter((relation) => !removeIds.has(relation.id));
      if (nextRelations.length === current.relations.length) return current;
      return {
        ...current,
        relations: nextRelations
      };
    });
  }, [updateDocument]);

  const save = useCallback(async (silent = false): Promise<void> => {
    if (!document || !target) return;
    const result = validateErdDocument(document);
    if (!result.valid) {
      new Notice("Fix ERD validation errors before saving.");
      return;
    }
    try {
      const nextTarget = await props.onSave(target, document);
      setTarget(nextTarget);
      setDirty(false);
      if (!silent) new Notice("ERD saved to note.");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not save ERD.");
    }
  }, [document, props, target]);

  React.useEffect(() => {
    if (!props.settings.autoSave || !dirty || !validation.valid || !document || !target) return;
    const timeout = window.setTimeout(() => {
      void save(true);
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [dirty, document, props.settings.autoSave, save, target, validation.valid]);

  if (!document || !target) {
    return (
      <div className="erd-empty-state">
        <h2>ERD Designer</h2>
        <p>Open or create an <code>obsidian-erd</code> code block from a Markdown note.</p>
      </div>
    );
  }

  return (
    <div
      className={`erd-shell ${markdownOpen ? "has-markdown" : "has-hidden-markdown"}`}
      style={{
        gridTemplateRows: markdownOpen
          ? `auto auto minmax(0, 1fr) ${markdownHeight}px`
          : "auto auto minmax(0, 1fr) auto"
      }}
    >
      <header className="erd-toolbar">
        <div>
          <strong>ERD Designer</strong>
          <span>{target.filePath}</span>
        </div>
        <div className="erd-toolbar-actions">
          {dirty && <span className="erd-dirty">Unsaved changes</span>}
          <button onClick={() => {
            const nextId = nextEntityId("table", document.tables.map((table) => table.id));
            updateDocument((current) => addTable(current, props.settings.newTableColumns, nextId));
            setSelection({ type: "table", id: nextId });
          }}>Add table</button>
          {props.settings.autoLayout && <button onClick={() => updateDocument(applySimpleLayout)}>Layout</button>}
          <button disabled={!validation.valid} onClick={() => void save(false)}>Save to note</button>
          <button onClick={() => props.onExportSvg(document, target.filePath)}>SVG</button>
          <button onClick={() => props.onExportPng(document, target.filePath)}>PNG</button>
        </div>
      </header>

      <div className={`erd-alert ${validation.valid ? "is-empty" : ""}`}>
        {!validation.valid && (
          <>
          {validation.errors.slice(0, 3).join(" ")}
          {validation.errors.length > 3 ? ` +${validation.errors.length - 3} more` : ""}
          </>
        )}
      </div>

      <main className="erd-main">
        <section className="erd-canvas" aria-label="ERD canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelection({ type: "table", id: node.id })}
            nodesConnectable={false}
            fitView
          >
            <Background />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </section>
        <Inspector
          document={document}
          selection={selection}
          defaultFromCardinality={props.settings.defaultFromCardinality}
          defaultToCardinality={props.settings.defaultToCardinality}
          onSelect={setSelection}
          onChange={updateDocument}
        />
      </main>
      <GeneratedMarkdownPanel
        open={markdownOpen}
        height={markdownHeight}
        markdown={generatedMarkdown}
        onToggle={() => setMarkdownOpen((current) => !current)}
        onResize={setMarkdownHeight}
      />
    </div>
  );
}

function GeneratedMarkdownPanel(props: {
  open: boolean;
  height: number;
  markdown: string;
  onToggle: () => void;
  onResize: (height: number) => void;
}): JSX.Element {
  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!props.open) return;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = props.height;
    event.currentTarget.setPointerCapture(pointerId);

    const onMove = (moveEvent: PointerEvent): void => {
      const nextHeight = clamp(startHeight - (moveEvent.clientY - startY), 140, 520);
      props.onResize(nextHeight);
    };
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const copyMarkdown = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(props.markdown);
      new Notice("Generated Markdown copied.");
    } catch {
      new Notice("Could not copy Markdown.");
    }
  };

  return (
    <section className={`erd-generated-markdown ${props.open ? "is-open" : "is-collapsed"}`}>
      {props.open && (
        <div
          className="erd-generated-markdown-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize generated Markdown panel"
          onPointerDown={startResize}
        />
      )}
      <header className="erd-generated-markdown-header">
        <button onClick={props.onToggle}>{props.open ? "Hide code" : "Show code"}</button>
        <div>
          <strong>Generated Markdown</strong>
          <span>Live preview of the code block that will be written on Save to note.</span>
        </div>
        <button onClick={copyMarkdown}>Copy</button>
      </header>
      {props.open && (
        <pre aria-label="Generated obsidian-erd Markdown"><code>{props.markdown}</code></pre>
      )}
    </section>
  );
}

function ErdTableNode({ data }: NodeProps<Node<TableNodeData>>): JSX.Element {
  const table = data.table;
  return (
    <div className="erd-node">
      <RelationHandles type="target" />
      <div className="erd-node-title">{table.name}</div>
      <div className="erd-node-columns">
        {table.columns.length === 0 && <div className="erd-node-column muted">(no columns)</div>}
        {table.columns.map((column) => (
          <div className="erd-node-column" key={column.id}>
            <span>{column.name}</span>
            <span>{column.type}</span>
            <span className="erd-column-badges">
              {column.primaryKey ? "PK" : ""}
              {column.foreignKey ? " FK" : ""}
              {column.unique ? " UQ" : ""}
            </span>
          </div>
        ))}
      </div>
      <RelationHandles type="source" />
    </div>
  );
}

const nodeTypes = {
  erdTable: ErdTableNode
};

const edgeTypes = {
  erdRelation: ErdRelationEdge
};

function RelationHandles(props: { type: "source" | "target" }): JSX.Element {
  return (
    <>
      <Handle id="left" type={props.type} position={Position.Left} />
      <Handle id="right" type={props.type} position={Position.Right} />
      <Handle id="top" type={props.type} position={Position.Top} />
      <Handle id="bottom" type={props.type} position={Position.Bottom} />
    </>
  );
}

function ErdRelationEdge(props: EdgeProps<Edge<ErdEdgeData>>): JSX.Element {
  if (!hasUsableEdgeCoordinates(props)) {
    return <></>;
  }

  const sourcePosition = props.sourcePosition ?? Position.Right;
  const targetPosition = props.targetPosition ?? Position.Left;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition,
    borderRadius: 8
  });
  const sourceSymbolStyle = endpointSymbolStyle(props.sourceX, props.sourceY, sourcePosition);
  const targetSymbolStyle = endpointSymbolStyle(props.targetX, props.targetY, targetPosition);
  const sourceOptionalStyle = optionalEndpointStyle(props.sourceX, props.sourceY);
  const targetOptionalStyle = optionalEndpointStyle(props.targetX, props.targetY);

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        className="erd-relation-edge"
        style={{
          stroke: props.data?.color,
          strokeDasharray: props.data?.dashed ? "7 5" : undefined
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="erd-relation-label"
          style={{
            borderColor: props.data?.color,
            color: props.data?.color,
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
          }}
        >
          {props.label}
        </div>
        <div
          className="erd-relation-symbol"
          style={{
            color: props.data?.sourceColor,
            textAlign: sourceSymbolStyle.textAlign,
            transform: sourceSymbolStyle.transform
          }}
        >
          {props.data?.sourceSymbol}
        </div>
        <div
          className="erd-relation-symbol"
          style={{
            color: props.data?.targetColor,
            textAlign: targetSymbolStyle.textAlign,
            transform: targetSymbolStyle.transform
          }}
        >
          {props.data?.targetSymbol}
        </div>
        {props.data?.sourceOptional && (
          <div
            className="erd-relation-optional"
            style={{
              borderColor: props.data.sourceColor,
              transform: sourceOptionalStyle.transform
            }}
          />
        )}
        {props.data?.targetOptional && (
          <div
            className="erd-relation-optional"
            style={{
              borderColor: props.data.targetColor,
              transform: targetOptionalStyle.transform
            }}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
}

function endpointSymbolStyle(
  x: number,
  y: number,
  position: Position | undefined
): EndpointSymbolStyle {
  switch (position) {
    case Position.Left:
      return {
        textAlign: "right",
        transform: `translate(-100%, -50%) translate(${x - 24}px, ${y - 12}px)`
      };
    case Position.Right:
      return {
        textAlign: "left",
        transform: `translate(0, -50%) translate(${x + 24}px, ${y - 12}px)`
      };
    case Position.Top:
      return {
        textAlign: "left",
        transform: `translate(0, -100%) translate(${x + 14}px, ${y - 14}px)`
      };
    case Position.Bottom:
      return {
        textAlign: "left",
        transform: `translate(0, 0) translate(${x + 14}px, ${y + 14}px)`
      };
    default:
      return {
        textAlign: "left",
        transform: `translate(0, -100%) translate(${x + 14}px, ${y - 14}px)`
      };
  }
}

function optionalEndpointStyle(x: number, y: number): { transform: string } {
  return {
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`
  };
}

function hasUsableEdgeCoordinates(props: EdgeProps<Edge<ErdEdgeData>>): boolean {
  return Number.isFinite(props.sourceX)
    && Number.isFinite(props.sourceY)
    && Number.isFinite(props.targetX)
    && Number.isFinite(props.targetY);
}

function Inspector(props: {
  document: ErdDocumentV1;
  selection: Selection;
  defaultFromCardinality: ErdEndpointCardinality;
  defaultToCardinality: ErdEndpointCardinality;
  onSelect: (selection: Selection) => void;
  onChange: (updater: (document: ErdDocumentV1) => ErdDocumentV1) => void;
}): JSX.Element {
  const selectedTable = props.selection?.type === "table"
    ? props.document.tables.find((table) => table.id === props.selection?.id)
    : null;
  const selectedRelation = props.selection?.type === "relation"
    ? props.document.relations.find((relation) => relation.id === props.selection?.id)
    : null;

  if (selectedTable) {
    return (
      <aside className="erd-inspector">
        <h3>Table</h3>
        <label>
          Selected table
          <select value={selectedTable.id} onChange={(event) => props.onSelect({ type: "table", id: event.currentTarget.value })}>
            {props.document.tables.map((table) => (
              <option key={table.id} value={table.id}>{table.name}</option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input
            value={selectedTable.name}
            onChange={(event) => {
              const name = event.currentTarget.value;
              props.onChange((document) => updateTableName(document, selectedTable.id, name));
            }}
          />
        </label>
        <div className="erd-inspector-actions">
          <button onClick={() => props.onChange((document) => addColumn(document, selectedTable.id))}>Add column</button>
          <button onClick={() => {
            props.onChange((document) => deleteTable(document, selectedTable.id));
            props.onSelect(null);
          }}>Delete table</button>
        </div>
        <div className="erd-column-editor">
          {selectedTable.columns.map((column, index) => (
            <ColumnEditor
              key={column.id}
              column={column}
              index={index}
              relation={findRelationForColumn(props.document, selectedTable.id, column.id)}
              onChange={(nextColumn) => {
                const shouldCreateRelation = column.foreignKey !== true && nextColumn.foreignKey === true;
                const shouldRemoveRelation = column.foreignKey === true && nextColumn.foreignKey !== true;
                const nextRelationId = nextEntityId("relation", props.document.relations.map((relation) => relation.id));
                props.onChange((document) => {
                  const updated = updateColumn(document, selectedTable.id, column.id, nextColumn);
                  if (shouldRemoveRelation) return removeRelationsForColumn(updated, selectedTable.id, nextColumn.id);
                  if (!shouldCreateRelation) return updated;
                  return addRelationForColumn(updated, props.defaultFromCardinality, props.defaultToCardinality, nextRelationId, selectedTable.id, nextColumn.id);
                });
              }}
              onEditRelation={(relationId) => props.onSelect({ type: "relation", id: relationId })}
              onMove={(direction) => props.onChange((document) => moveColumn(document, selectedTable.id, column.id, direction))}
              onDelete={() => props.onChange((document) => deleteColumn(document, selectedTable.id, column.id))}
            />
          ))}
        </div>
      </aside>
    );
  }

  if (selectedRelation) {
    return (
      <RelationInspector
        document={props.document}
        relation={selectedRelation}
        onChange={props.onChange}
        onDelete={() => {
          props.onChange((document) => ({
            ...document,
            relations: document.relations.filter((relation) => relation.id !== selectedRelation.id)
          }));
          props.onSelect(null);
        }}
      />
    );
  }

  return (
    <aside className="erd-inspector">
      <h3>Diagram</h3>
      <p>Select a table to edit it. Use an FK column's Edit relation button to edit a relationship.</p>
      <div className="erd-list">
        {props.document.tables.map((table) => (
          <button key={table.id} onClick={() => props.onSelect({ type: "table", id: table.id })}>{table.name}</button>
        ))}
      </div>
    </aside>
  );
}

function ColumnEditor(props: {
  column: ErdColumn;
  index: number;
  relation: ErdRelation | null;
  onChange: (column: ErdColumn) => void;
  onEditRelation: (relationId: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <div className="erd-column-card">
      <div className="erd-column-grid">
        <input
          aria-label="Column name"
          value={props.column.name}
          onChange={(event) => props.onChange({
            ...props.column,
            name: event.currentTarget.value
          })}
        />
        <input
          aria-label="Column type"
          value={props.column.type}
          onChange={(event) => props.onChange({ ...props.column, type: event.currentTarget.value })}
        />
      </div>
      <div className="erd-column-flags">
        <label><input type="checkbox" checked={props.column.primaryKey === true} onChange={(event) => props.onChange({ ...props.column, primaryKey: event.currentTarget.checked })} /> PK</label>
        <label><input type="checkbox" checked={props.column.foreignKey === true} onChange={(event) => props.onChange({ ...props.column, foreignKey: event.currentTarget.checked })} /> FK</label>
        <label><input type="checkbox" checked={props.column.unique === true} onChange={(event) => props.onChange({ ...props.column, unique: event.currentTarget.checked })} /> UQ</label>
        <label><input type="checkbox" checked={props.column.nullable !== false} onChange={(event) => props.onChange({ ...props.column, nullable: event.currentTarget.checked })} /> Nullable</label>
      </div>
      <div className="erd-column-actions">
        {props.column.foreignKey === true && props.relation && (
          <button onClick={() => props.onEditRelation(props.relation!.id)}>Edit relation</button>
        )}
        <button onClick={() => props.onMove(-1)}>Up</button>
        <button onClick={() => props.onMove(1)}>Down</button>
        <button onClick={props.onDelete}>Delete</button>
      </div>
    </div>
  );
}

function RelationInspector(props: {
  document: ErdDocumentV1;
  relation: ErdRelation;
  onChange: (updater: (document: ErdDocumentV1) => ErdDocumentV1) => void;
  onDelete: () => void;
}): JSX.Element {
  const fromTable = props.document.tables.find((table) => table.id === props.relation.fromTable) ?? props.document.tables[0];
  const toTable = props.document.tables.find((table) => table.id === props.relation.toTable) ?? props.document.tables[0];

  return (
    <aside className="erd-inspector">
      <h3>Relation</h3>
      <p>{relationLabel(props.document, props.relation)}</p>
      <label>
        From table
        <select value={props.relation.fromTable} onChange={(event) => {
          const fromTable = event.currentTarget.value;
          props.onChange((document) => updateRelation(document, props.relation.id, {
            fromTable,
            fromColumn: firstColumnId(document, fromTable)
          }));
        }}>
          {props.document.tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
        </select>
      </label>
      <label>
        From column
        <select value={props.relation.fromColumn} onChange={(event) => {
          const fromColumn = event.currentTarget.value;
          props.onChange((document) => updateRelation(document, props.relation.id, { fromColumn }));
        }}>
          {fromTable?.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
      </label>
      <label>
        To table
        <select value={props.relation.toTable} onChange={(event) => {
          const toTable = event.currentTarget.value;
          props.onChange((document) => updateRelation(document, props.relation.id, {
            toTable,
            toColumn: firstColumnId(document, toTable)
          }));
        }}>
          {props.document.tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
        </select>
      </label>
      <label>
        To column
        <select value={props.relation.toColumn} onChange={(event) => {
          const toColumn = event.currentTarget.value;
          props.onChange((document) => updateRelation(document, props.relation.id, { toColumn }));
        }}>
          {toTable?.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
      </label>
      <label>
        From cardinality
        <select value={props.relation.fromCardinality} onChange={(event) => {
          const fromCardinality = event.currentTarget.value as ErdEndpointCardinality;
          props.onChange((document) => updateRelation(document, props.relation.id, { fromCardinality }));
        }}>
          {endpointCardinalityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label>
        To cardinality
        <select value={props.relation.toCardinality} onChange={(event) => {
          const toCardinality = event.currentTarget.value as ErdEndpointCardinality;
          props.onChange((document) => updateRelation(document, props.relation.id, { toCardinality }));
        }}>
          {endpointCardinalityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button onClick={props.onDelete}>Delete relation</button>
    </aside>
  );
}

function addTable(document: ErdDocumentV1, columnTemplate: string, id: string): ErdDocumentV1 {
  return {
    ...document,
    tables: [
      ...document.tables,
      {
        id,
        name: "new_table",
        position: { x: 160 + document.tables.length * 40, y: 160 + document.tables.length * 40 },
        columns: parseColumnTemplate(columnTemplate)
      }
    ]
  };
}

function parseColumnTemplate(template: string): ErdColumn[] {
  const columns = template
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [rawName, rawType, ...flags] = part.split(":").map((item) => item.trim()).filter(Boolean);
      const name = rawName || "id";
      const type = rawType || "text";
      return {
        id: `column_${index + 1}`,
        name,
        type,
        primaryKey: flags.includes("pk"),
        foreignKey: flags.includes("fk"),
        unique: flags.includes("unique"),
        nullable: !flags.includes("not-null")
      };
    });

  return columns.length > 0
    ? columns
    : [{ id: "column_1", name: "id", type: "uuid", primaryKey: true, nullable: false }];
}

function applySimpleLayout(document: ErdDocumentV1): ErdDocumentV1 {
  const columns = Math.max(1, Math.ceil(Math.sqrt(document.tables.length)));
  return {
    ...document,
    tables: document.tables.map((table, index) => ({
      ...table,
      position: {
        x: 120 + (index % columns) * 340,
        y: 80 + Math.floor(index / columns) * 240
      }
    }))
  };
}

function addRelationForColumn(
  document: ErdDocumentV1,
  fromCardinality: ErdEndpointCardinality,
  toCardinality: ErdEndpointCardinality,
  id: string,
  fromTableId: string,
  fromColumnId: string
): ErdDocumentV1 {
  if (document.relations.some((relation) => relation.fromTable === fromTableId && relation.fromColumn === fromColumnId)) {
    return document;
  }

  const from = document.tables.find((table) => table.id === fromTableId);
  const to = document.tables.find((table) => table.id !== fromTableId);
  const toColumn = to?.columns.find((column) => column.primaryKey === true) ?? to?.columns[0];
  if (!from || !to || !from.columns.some((column) => column.id === fromColumnId) || !toColumn) {
    return document;
  }

  return {
    ...document,
    relations: [
      ...document.relations,
      {
        id,
        fromTable: from.id,
        fromColumn: fromColumnId,
        toTable: to.id,
        toColumn: toColumn.id,
        fromCardinality,
        toCardinality
      }
    ]
  };
}

function findRelationForColumn(document: ErdDocumentV1, tableId: string, columnId: string): ErdRelation | null {
  return document.relations.find((relation) => relation.fromTable === tableId && relation.fromColumn === columnId)
    ?? document.relations.find((relation) => relation.toTable === tableId && relation.toColumn === columnId)
    ?? null;
}

function removeRelationsForColumn(document: ErdDocumentV1, tableId: string, columnId: string): ErdDocumentV1 {
  const relations = document.relations.filter((relation) => {
    if (relation.fromTable === tableId && relation.fromColumn === columnId) return false;
    if (relation.toTable === tableId && relation.toColumn === columnId) return false;
    return true;
  });
  return relations.length === document.relations.length ? document : { ...document, relations };
}

function updateTableName(document: ErdDocumentV1, tableId: string, name: string): ErdDocumentV1 {
  return {
    ...document,
    tables: document.tables.map((table) => table.id === tableId ? { ...table, name } : table)
  };
}

function deleteTable(document: ErdDocumentV1, tableId: string): ErdDocumentV1 {
  return {
    ...document,
    tables: document.tables.filter((table) => table.id !== tableId),
    relations: document.relations.filter((relation) => relation.fromTable !== tableId && relation.toTable !== tableId)
  };
}

function addColumn(document: ErdDocumentV1, tableId: string): ErdDocumentV1 {
  return {
    ...document,
    tables: document.tables.map((table) => {
      if (table.id !== tableId) return table;
      const id = nextEntityId("column", table.columns.map((column) => column.id));
      return {
        ...table,
        columns: [...table.columns, { id, name: "new_column", type: "text", nullable: true }]
      };
    })
  };
}

function updateColumn(document: ErdDocumentV1, tableId: string, columnId: string, nextColumn: ErdColumn): ErdDocumentV1 {
  const table = document.tables.find((item) => item.id === tableId);
  const nextId = makeUniqueId(nextColumn.id, table?.columns.filter((column) => column.id !== columnId).map((column) => column.id) ?? []);
  return {
    ...document,
    tables: document.tables.map((item) => item.id === tableId
      ? { ...item, columns: item.columns.map((column) => column.id === columnId ? { ...nextColumn, id: nextId } : column) }
      : item),
    relations: document.relations.map((relation) => ({
      ...relation,
      fromColumn: relation.fromTable === tableId && relation.fromColumn === columnId ? nextId : relation.fromColumn,
      toColumn: relation.toTable === tableId && relation.toColumn === columnId ? nextId : relation.toColumn
    }))
  };
}

function deleteColumn(document: ErdDocumentV1, tableId: string, columnId: string): ErdDocumentV1 {
  return {
    ...document,
    tables: document.tables.map((table) => table.id === tableId
      ? { ...table, columns: table.columns.filter((column) => column.id !== columnId) }
      : table),
    relations: document.relations.filter((relation) => {
      if (relation.fromTable === tableId && relation.fromColumn === columnId) return false;
      if (relation.toTable === tableId && relation.toColumn === columnId) return false;
      return true;
    })
  };
}

function moveColumn(document: ErdDocumentV1, tableId: string, columnId: string, direction: -1 | 1): ErdDocumentV1 {
  return {
    ...document,
    tables: document.tables.map((table) => {
      if (table.id !== tableId) return table;
      const index = table.columns.findIndex((column) => column.id === columnId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= table.columns.length) return table;
      const columns = [...table.columns];
      const [column] = columns.splice(index, 1);
      columns.splice(nextIndex, 0, column);
      return { ...table, columns };
    })
  };
}

function updateRelation(document: ErdDocumentV1, relationId: string, patch: Partial<ErdRelation>): ErdDocumentV1 {
  let changed = false;
  const relations = document.relations.map((relation) => {
    if (relation.id !== relationId) return relation;
    const nextRelation = { ...relation, ...patch };
    const relationChanged = Object.keys(patch).some((key) => {
      const relationKey = key as keyof ErdRelation;
      return relation[relationKey] !== nextRelation[relationKey];
    });
    if (!relationChanged) return relation;
    changed = true;
    return nextRelation;
  });
  if (!changed) return document;
  return {
    ...document,
    relations
  };
}

function firstColumnId(document: ErdDocumentV1, tableId: string): string {
  return document.tables.find((table) => table.id === tableId)?.columns[0]?.id ?? "";
}

function exportSvg(document: ErdDocumentV1, filePath: string): void {
  downloadTextFile(`${basename(filePath)}.erd.svg`, generateErdSvg(document), "image/svg+xml");
}

async function exportPng(document: ErdDocumentV1, filePath: string): Promise<void> {
  const blob = await svgToPngBlob(generateErdSvg(document));
  downloadBlob(`${basename(filePath)}.erd.png`, blob);
}

function basename(filePath: string): string {
  return filePath.split("/").pop()?.replace(/\.md$/i, "") || "diagram";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextEntityId(prefix: string, existing: Iterable<string>): string {
  const seen = new Set(existing);
  let index = seen.size + 1;
  while (seen.has(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}
