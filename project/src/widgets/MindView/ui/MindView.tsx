import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Marked } from 'marked';
import { useDocumentStore } from '@/entities/document/model/store';
import { MindNode } from '@/entities/document/lib/parser';
import { extractSectionContent } from '@/entities/document/lib/extractSection';
import { EyeOff, X, Pin, PinOff } from 'lucide-react';

// ---------------------------------------------------------------------------
// Markdown renderer for the preview panel (reuse marked from ReadView)
// ---------------------------------------------------------------------------
const markedParser = new Marked({ gfm: true, breaks: true });

function renderPreview(md: string): string {
  if (!md) return '<p class="text-mutedText/40 text-xs italic">본문 내용이 없습니다.</p>';
  return markedParser.parse(md) as string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MindViewProps {
  /** Called when the user clicks the close (X) button inside the panel. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// MindView Component
// ---------------------------------------------------------------------------

export const MindView: React.FC<MindViewProps> = ({ onClose }) => {
  const { nodes, rawContent, updateNodeCoordinate, currentFile } = useDocumentStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // ── Preview state ──────────────────────────────────────────────────────────
  const [hoveredNode, setHoveredNode] = useState<MindNode | null>(null);
  const [pinnedNode, setPinnedNode] = useState<MindNode | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** The node currently being previewed: pinned takes priority over hovered. */
  const previewNode = pinnedNode ?? hoveredNode;
  const previewContent = previewNode
    ? extractSectionContent(rawContent, previewNode)
    : '';

  // ── Drag offset refs ───────────────────────────────────────────────────────
  const dragStartRef = useRef({
    nodeId: '',
    startMouseX: 0,
    startMouseY: 0,
    startNodeX: 0,
    startNodeY: 0,
  });

  const panStartRef = useRef({
    startMouseX: 0,
    startMouseY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const scaleFactor = 1.05;
    const newZoom =
      e.deltaY < 0
        ? Math.min(2.5, zoom * scaleFactor)
        : Math.max(0.4, zoom / scaleFactor);
    setZoom(newZoom);
  };

  // ── Node drag ──────────────────────────────────────────────────────────────
  const handleNodeMouseDown = (e: React.MouseEvent, node: MindNode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragStartRef.current = {
      nodeId: node.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
    };
    setDraggingNodeId(node.id);
  };

  // ── Canvas pan ─────────────────────────────────────────────────────────────
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      panStartRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      setIsPanning(true);
    }
  };

  // ── Global mouse handlers ──────────────────────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingNodeId) {
        const d = dragStartRef.current;
        const snap = (v: number) => Math.round(v / 10) * 10;
        updateNodeCoordinate(
          d.nodeId,
          snap(d.startNodeX + (e.clientX - d.startMouseX) / zoom),
          snap(d.startNodeY + (e.clientY - d.startMouseY) / zoom),
        );
      } else if (isPanning) {
        const p = panStartRef.current;
        setPan({
          x: p.startPanX + (e.clientX - p.startMouseX),
          y: p.startPanY + (e.clientY - p.startMouseY),
        });
      }
    };
    const handleMouseUp = () => {
      setDraggingNodeId(null);
      setIsPanning(false);
    };

    if (draggingNodeId || isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNodeId, isPanning, zoom, updateNodeCoordinate]);

  // ── Hover handlers (debounced 200 ms) ─────────────────────────────────────

  const handleNodeMouseEnter = useCallback(
    (node: MindNode) => {
      // Never change the preview if a node is pinned
      if (pinnedNode) return;
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => setHoveredNode(node), 200);
    },
    [pinnedNode],
  );

  const handleNodeMouseLeave = useCallback(() => {
    if (pinnedNode) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredNode(null), 300);
  }, [pinnedNode]);

  // Clean up hover timer on unmount
  useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);

  // ── Pin toggle ─────────────────────────────────────────────────────────────
  const handlePinToggle = () => {
    setPinnedNode((prev) => (prev ? null : hoveredNode));
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!currentFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none bg-[#111216]/20">
        <EyeOff className="w-12 h-12 text-mutedText/20 mb-3" />
        <h3 className="text-sm font-semibold text-mutedText/40 mb-1">마인드 맵 로드 대기</h3>
        <p className="text-xs text-mutedText/30 max-w-xs leading-relaxed">
          마크다운 문서가 열려야 헤딩 계층 구조를 시각화할 수 있습니다.
        </p>
        {/* Close button even in empty state */}
        <button
          onClick={onClose}
          title="마인드 뷰 닫기"
          className="absolute top-3 right-3 p-1.5 rounded hover:bg-white/10 text-mutedText/40 hover:text-slate-300 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  // ── Node colours ───────────────────────────────────────────────────────────
  const nodeWidth = 200;
  const nodeHeight = 64;

  const levelColors: Record<number, string> = {
    1: 'border-l-indigo-500 shadow-indigo-950/20 bg-indigo-950/20',
    2: 'border-l-teal-500 shadow-teal-950/10 bg-teal-950/20',
    3: 'border-l-sky-500 shadow-sky-950/10 bg-sky-950/20',
    4: 'border-l-amber-500 shadow-amber-950/10 bg-amber-950/20',
    5: 'border-l-pink-500 shadow-pink-950/10 bg-pink-950/20',
    6: 'border-l-purple-500 shadow-purple-950/10 bg-purple-950/20',
  };
  const levelBadgeColors: Record<number, string> = {
    1: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
    2: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
    3: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
    4: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    5: 'bg-pink-500/20 text-pink-400 border border-pink-500/30',
    6: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 select-none overflow-hidden h-full w-full">

      {/* ── Close button (top-right) ─────────────────────────────────────── */}
      <button
        onClick={onClose}
        title="마인드 뷰 닫기"
        className="absolute top-3 right-3 z-20 p-1.5 rounded
          hover:bg-white/10 text-mutedText/40 hover:text-slate-300
          transition-colors"
      >
        <X size={13} />
      </button>

      {/* ── Zoom / help controls (bottom-left) ──────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-10 bg-darkPanel/90 border border-darkBorder/60
        px-3 py-2 rounded-lg flex items-center space-x-4 shadow-xl pointer-events-none">
        <div className="text-[10px] text-mutedText flex flex-col font-medium">
          <span className="font-semibold text-slate-300">조작 가이드</span>
          <span>드래그: 노드 이동</span>
          <span>배경 드래그: 패닝(이동)</span>
          <span>마우스 휠: 줌 인/아웃</span>
          <span>호버: 본문 미리보기</span>
        </div>
        <div className="border-l border-darkBorder/60 h-8" />
        <div className="text-xs font-mono font-bold text-slate-300">
          Zoom: {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* ── Section preview panel ────────────────────────────────────────── */}
      {previewNode && (
        <div
          className="absolute top-10 right-4 z-20 w-64
            bg-darkPanel/95 border border-darkBorder/70 rounded-xl shadow-2xl
            flex flex-col overflow-hidden backdrop-blur-sm
            transition-opacity duration-150"
          // Prevent hover on the panel itself from clearing the hovered node
          onMouseEnter={() => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2
            border-b border-darkBorder/50 bg-darkBg/40">
            <span className="text-[10px] font-semibold text-slate-300 truncate flex-1 mr-2">
              {previewNode.label}
            </span>
            {/* Pin toggle */}
            <button
              onClick={handlePinToggle}
              title={pinnedNode ? '고정 해제' : '미리보기 고정'}
              className={[
                'flex-shrink-0 p-1 rounded transition-colors',
                pinnedNode
                  ? 'text-indigo-400 bg-indigo-900/40 hover:bg-indigo-900/60'
                  : 'text-mutedText/40 hover:text-slate-300 hover:bg-white/10',
              ].join(' ')}
            >
              {pinnedNode ? <Pin size={11} /> : <PinOff size={11} />}
            </button>
          </div>

          {/* Markdown content (scrollable) */}
          <div
            className="rv-content px-3 py-2.5 overflow-y-auto max-h-72
              text-[11px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderPreview(previewContent) }}
          />
        </div>
      )}

      {/* ── SVG Canvas ───────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing bg-[#0d0e12]"
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Curved connections */}
          {nodes.map((node) => {
            if (!node.parentId) return null;
            const parent = nodes.find((n) => n.id === node.parentId);
            if (!parent) return null;

            const startX = parent.x + nodeWidth;
            const startY = parent.y + nodeHeight / 2;
            const endX = node.x;
            const endY = node.y + nodeHeight / 2;
            const controlDist = Math.max(80, (endX - startX) * 0.5);

            return (
              <path
                key={`link-${node.id}`}
                d={`M ${startX} ${startY} C ${startX + controlDist} ${startY}, ${endX - controlDist} ${endY}, ${endX} ${endY}`}
                fill="none"
                stroke="#272a37"
                strokeWidth={1.5}
                className="transition-all duration-300 hover:stroke-primary/50"
              />
            );
          })}

          {/* Mind map nodes */}
          {nodes.map((node) => {
            const isDragging = draggingNodeId === node.id;
            const isPreviewed = previewNode?.id === node.id;
            return (
              <g
                key={`node-${node.id}`}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onMouseEnter={() => handleNodeMouseEnter(node)}
                onMouseLeave={handleNodeMouseLeave}
                className="cursor-move select-none"
              >
                <foreignObject width={nodeWidth} height={nodeHeight}>
                  <div
                    className={[
                      'w-full h-full rounded-lg border-l-4 border border-darkBorder',
                      'bg-darkPanel/90 flex flex-col justify-between p-2.5',
                      'shadow-lg select-none transition-all duration-200',
                      levelColors[node.level] ?? 'border-l-indigo-400',
                      isDragging
                        ? 'scale-105 border-primary shadow-primary/20 ring-2 ring-primary/30 z-50 bg-darkPanel/100'
                        : isPreviewed
                          ? 'ring-1 ring-indigo-500/40 border-indigo-500/40'
                          : 'hover:border-darkBorder/80 hover:shadow-xl',
                    ].join(' ')}
                  >
                    <div className="text-xs font-bold text-slate-100 truncate w-full" title={node.label}>
                      {node.label}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[8px] font-bold px-1 rounded font-mono ${levelBadgeColors[node.level]}`}>
                        H{node.level}
                      </span>
                      <span className="text-[8px] text-mutedText/40 font-mono">
                        {node.x}, {node.y}
                      </span>
                    </div>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
