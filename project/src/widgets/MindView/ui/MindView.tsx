import React, { useState, useRef, useEffect } from 'react';
import { useDocumentStore } from '@/entities/document/model/store';
import { MindNode } from '@/entities/document/lib/parser';
import { EyeOff } from 'lucide-react';

export const MindView: React.FC = () => {
  const { nodes, updateNodeCoordinate, currentFile } = useDocumentStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Drag offsets
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

  // Handle Zoom on Wheel
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const scaleFactor = 1.05;
    let newZoom = zoom;
    if (e.deltaY < 0) {
      newZoom = Math.min(2.5, zoom * scaleFactor);
    } else {
      newZoom = Math.max(0.4, zoom / scaleFactor);
    }
    setZoom(newZoom);
  };

  // Node Drag Initiation
  const handleNodeMouseDown = (e: React.MouseEvent, node: MindNode) => {
    e.stopPropagation(); // Prevent trigger canvas panning
    if (e.button !== 0) return; // Left click only

    dragStartRef.current = {
      nodeId: node.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
    };
    setDraggingNodeId(node.id);
  };

  // Canvas Pan Initiation
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      // Left or middle mouse click
      panStartRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      setIsPanning(true);
    }
  };

  // Global mousemove and mouseup listeners for drag safety
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingNodeId) {
        const dragInfo = dragStartRef.current;
        const deltaX = (e.clientX - dragInfo.startMouseX) / zoom;
        const deltaY = (e.clientY - dragInfo.startMouseY) / zoom;

        // Snapping: Align to grid of 10px for alignment helper
        const snap = (val: number) => Math.round(val / 10) * 10;

        const targetX = snap(dragInfo.startNodeX + deltaX);
        const targetY = snap(dragInfo.startNodeY + deltaY);

        updateNodeCoordinate(dragInfo.nodeId, targetX, targetY);
      } else if (isPanning) {
        const panInfo = panStartRef.current;
        const deltaX = e.clientX - panInfo.startMouseX;
        const deltaY = e.clientY - panInfo.startMouseY;
        setPan({
          x: panInfo.startPanX + deltaX,
          y: panInfo.startPanY + deltaY,
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

  if (!currentFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none bg-[#111216]/20">
        <EyeOff className="w-12 h-12 text-mutedText/20 mb-3" />
        <h3 className="text-sm font-semibold text-mutedText/40 mb-1">마인드 맵 로드 대기</h3>
        <p className="text-xs text-mutedText/30 max-w-xs leading-relaxed">
          마크다운 문서가 열려야 헤딩 계층 구조를 시각화할 수 있습니다.
        </p>
      </div>
    );
  }

  // Node dimensions
  const nodeWidth = 200;
  const nodeHeight = 64;

  // Colors for heading levels
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

  return (
    <div className="absolute inset-0 select-none overflow-hidden h-full w-full">
      {/* Zoom / Pan Help Controls */}
      <div className="absolute bottom-4 left-4 z-10 bg-darkPanel/90 border border-darkBorder/60 px-3 py-2 rounded-lg flex items-center space-x-4 shadow-xl pointer-events-none">
        <div className="text-[10px] text-mutedText flex flex-col font-medium">
          <span className="font-semibold text-slate-300">조작 가이드</span>
          <span>드래그: 노드 이동</span>
          <span>배경 드래그: 패닝(이동)</span>
          <span>마우스 휠: 줌 인/아웃</span>
        </div>
        <div className="border-l border-darkBorder/60 h-8"></div>
        <div className="text-xs font-mono font-bold text-slate-300">
          Zoom: {Math.round(zoom * 100)}%
        </div>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing bg-[#0d0e12]"
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 1. Curved Connections */}
          {nodes.map((node) => {
            if (!node.parentId) return null;
            const parent = nodes.find((n) => n.id === node.parentId);
            if (!parent) return null;

            // Start coordinates: center-right of parent card
            const startX = parent.x + nodeWidth;
            const startY = parent.y + nodeHeight / 2;

            // End coordinates: center-left of child card
            const endX = node.x;
            const endY = node.y + nodeHeight / 2;

            // Cubic bezier control points
            const controlDist = Math.max(80, (endX - startX) * 0.5);
            const cp1X = startX + controlDist;
            const cp1Y = startY;
            const cp2X = endX - controlDist;
            const cp2Y = endY;

            return (
              <path
                key={`link-${node.id}`}
                d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                fill="none"
                stroke="#272a37"
                strokeWidth={1.5}
                className="transition-all duration-300 hover:stroke-primary/50"
              />
            );
          })}

          {/* 2. Mind Map Nodes */}
          {nodes.map((node) => {
            const isDragging = draggingNodeId === node.id;
            return (
              <g
                key={`node-${node.id}`}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                className="cursor-move select-none"
              >
                {/* HTML content inside SVG using foreignObject */}
                <foreignObject width={nodeWidth} height={nodeHeight}>
                  <div
                    className={`w-full h-full rounded-lg border-l-4 border border-darkBorder bg-darkPanel/90 flex flex-col justify-between p-2.5 shadow-lg select-none transition-all duration-200 ${
                      levelColors[node.level] || 'border-l-indigo-400'
                    } ${
                      isDragging
                        ? 'scale-105 border-primary shadow-primary/20 ring-2 ring-primary/30 z-50 bg-darkPanel/100'
                        : 'hover:border-darkBorder/80 hover:shadow-xl'
                    }`}
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
