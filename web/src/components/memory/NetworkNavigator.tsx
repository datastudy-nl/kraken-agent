import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { Search, Minus, Plus, Maximize2, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntities, useGraph, type GraphNode } from "@/hooks/useMemory";

/* ---- colour palette by entity type ---- */
const TYPE_COLORS: Record<string, string> = {
  person: "#6366f1",
  concept: "#06b6d4",
  organization: "#f59e0b",
  location: "#10b981",
  event: "#ef4444",
  tool: "#8b5cf6",
  skill: "#ec4899",
};
const DEFAULT_COLOR = "#94a3b8";
function colorFor(type: string | undefined | null) {
  if (!type) return DEFAULT_COLOR;
  return TYPE_COLORS[type.toLowerCase()] ?? DEFAULT_COLOR;
}

/* ---- force‑graph node type ---- */
interface FGNode {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  isCenter: boolean;
  color: string;
  degree: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  __bckgDimensions?: [number, number];
}

interface FGLink {
  source: string;
  target: string;
  type: string;
}

export function NetworkNavigator() {
  const [search, setSearch] = useState("");
  const [centerId, setCenterId] = useState("");
  const [depth, setDepth] = useState(2);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; name: string }[]>([]);

  const graphRef = useRef<ForceGraphMethods<FGNode>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  /* resize observer */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDimensions({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* entity picker data */
  const { data: entitiesData } = useEntities(search, "", 20);
  const entities = entitiesData?.entities ?? [];

  /* graph data */
  const { data: graphData, isLoading } = useGraph(centerId, depth);

  /* transform for force‑graph */
  const fgData = useMemo(() => {
    if (!graphData) return { nodes: [] as FGNode[], links: [] as FGLink[] };

    const nodeIds = new Set(graphData.nodes.map((n) => n.id));
    const links: FGLink[] = graphData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type }));

    // count connections per node
    const degreeMap = new Map<string, number>();
    for (const l of links) {
      degreeMap.set(l.source, (degreeMap.get(l.source) ?? 0) + 1);
      degreeMap.set(l.target, (degreeMap.get(l.target) ?? 0) + 1);
    }

    // Build adjacency and BFS tree from center
    const adj = new Map<string, string[]>();
    for (const l of links) {
      if (!adj.has(l.source)) adj.set(l.source, []);
      if (!adj.has(l.target)) adj.set(l.target, []);
      adj.get(l.source)!.push(l.target);
      adj.get(l.target)!.push(l.source);
    }

    // BFS to build a tree: parent -> children[]
    const parentMap = new Map<string, string | null>();
    const childrenMap = new Map<string, string[]>();
    const depthMap = new Map<string, number>();

    if (centerId) {
      const queue = [centerId];
      parentMap.set(centerId, null);
      depthMap.set(centerId, 0);
      childrenMap.set(centerId, []);

      while (queue.length > 0) {
        const cur = queue.shift()!;
        const d = depthMap.get(cur)!;
        for (const nb of adj.get(cur) ?? []) {
          if (!parentMap.has(nb)) {
            parentMap.set(nb, cur);
            depthMap.set(nb, d + 1);
            childrenMap.set(nb, []);
            if (!childrenMap.has(cur)) childrenMap.set(cur, []);
            childrenMap.get(cur)!.push(nb);
            queue.push(nb);
          }
        }
      }
    }

    // Count total leaf descendants to allocate angular space proportionally
    const leafCountCache = new Map<string, number>();
    function leafCount(id: string): number {
      if (leafCountCache.has(id)) return leafCountCache.get(id)!;
      const ch = childrenMap.get(id) ?? [];
      const count = ch.length === 0 ? 1 : ch.reduce((sum, c) => sum + leafCount(c), 0);
      leafCountCache.set(id, count);
      return count;
    }

    // Radial tree layout: each node gets an angular sector from its parent
    const RING_SPACING = 280;
    const posMap = new Map<string, { x: number; y: number }>();

    function layoutSubtree(id: string, angleStart: number, angleEnd: number, depth: number) {
      if (depth === 0) {
        posMap.set(id, { x: 0, y: 0 });
      } else {
        const angleMid = (angleStart + angleEnd) / 2;
        const radius = depth * RING_SPACING;
        posMap.set(id, {
          x: Math.cos(angleMid) * radius,
          y: Math.sin(angleMid) * radius,
        });
      }

      const children = childrenMap.get(id) ?? [];
      if (children.length === 0) return;

      const totalLeaves = leafCount(id);
      let cursor = angleStart;

      for (const child of children) {
        const share = leafCount(child) / totalLeaves;
        const childStart = cursor;
        const childEnd = cursor + (angleEnd - angleStart) * share;
        layoutSubtree(child, childStart, childEnd, depth + 1);
        cursor = childEnd;
      }
    }

    if (centerId) {
      layoutSubtree(centerId, 0, 2 * Math.PI, 0);
    }

    const nodes: FGNode[] = graphData.nodes.map((n) => {
      const pos = posMap.get(n.id);
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        properties: n.properties,
        isCenter: n.id === centerId,
        color: colorFor(n.type),
        degree: degreeMap.get(n.id) ?? 0,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        fx: pos?.x ?? 0,
        fy: pos?.y ?? 0,
      };
    });

    return { nodes, links };
  }, [graphData, centerId]);

  /* set of node IDs connected to hovered node */
  const hoverNeighbors = useMemo(() => {
    if (!hoveredId) return null;
    const set = new Set<string>([hoveredId]);
    for (const l of fgData.links) {
      const src = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
      if (src === hoveredId) set.add(tgt);
      if (tgt === hoveredId) set.add(src);
    }
    return set;
  }, [hoveredId, fgData.links]);

  /* fit camera when data changes */
  useEffect(() => {
    if (fgData.nodes.length > 0) {
      setTimeout(() => graphRef.current?.zoomToFit(400, 60), 300);
    }
  }, [fgData]);

  /* navigate to entity */
  const navigateTo = useCallback(
    (id: string, name: string) => {
      setHistory((h) => {
        const existing = h.findIndex((x) => x.id === id);
        if (existing >= 0) return h.slice(0, existing + 1);
        return [...h, { id, name }];
      });
      setCenterId(id);
      setSelected(null);
    },
    [],
  );

  /* pick from search */
  const pickEntity = useCallback(
    (entity: { id: string; name: string }) => {
      navigateTo(entity.id, entity.name);
      setSearch("");
    },
    [navigateTo],
  );

  /* click node */
  const handleNodeClick = useCallback(
    (node: FGNode) => {
      const gNode = graphData?.nodes.find((n) => n.id === node.id);
      setSelected(gNode ?? null);
    },
    [graphData],
  );

  /* double‑click to navigate */
  const handleNodeDblClick = useCallback(
    (node: FGNode) => {
      navigateTo(node.id, node.name);
    },
    [navigateTo],
  );

  /* node paint — circles with wrapped text, size scales with degree */
  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const degreeScale = 1 + Math.min(node.degree, 20) * 0.06;
      const fontSize = 5 * degreeScale;
      const fontStr = `${node.isCenter ? "bold " : ""}${fontSize}px Inter, system-ui, sans-serif`;
      ctx.font = fontStr;

      // wrap text into lines that fit a target width
      const maxLineWidth = fontSize * 6;
      const words = label.split(/\s+/);
      const lines: string[] = [];
      let currentLine = "";
      for (const word of words) {
        const test = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(test).width > maxLineWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = test;
        }
      }
      if (currentLine) lines.push(currentLine);

      // compute circle radius to fit all lines
      const lineHeight = fontSize * 1.25;
      const textBlockHeight = lines.length * lineHeight;
      const widestLine = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const contentSize = Math.max(widestLine, textBlockHeight);
      const radius = (contentSize / 2) + fontSize * 0.35;

      const isDimmed = hoverNeighbors !== null && !hoverNeighbors.has(node.id);
      const isHighlighted = hoveredId === node.id;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // circle background
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.closePath();

      ctx.globalAlpha = isDimmed ? 0.15 : 1;
      ctx.fillStyle = node.color + (node.isCenter ? "ee" : "cc");
      ctx.fill();

      if (node.isCenter || isHighlighted) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = (isHighlighted ? 2.5 : 2) / globalScale;
        ctx.stroke();
      }

      // draw wrapped text
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      const textStartY = y - (textBlockHeight / 2) + lineHeight / 2;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, textStartY + i * lineHeight);
      }

      ctx.globalAlpha = 1;
      node.__bckgDimensions = [radius * 2, radius * 2];
    },
    [hoverNeighbors, hoveredId],
  );

  /* hit area */
  const nodePointerArea = useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = (node.__bckgDimensions?.[0] ?? 20) / 2;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  /* link color — highlight edges connected to hovered node */
  const linkColor = useCallback(
    (link: any) => {
      if (!hoveredId) return "rgba(148,163,184,0.35)";
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (src === hoveredId || tgt === hoveredId) return "rgba(255,255,255,0.8)";
      return "rgba(148,163,184,0.08)";
    },
    [hoveredId],
  );

  /* link width — thicker for hovered connections */
  const linkWidth = useCallback(
    (link: any) => {
      if (!hoveredId) return 1.5;
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (src === hoveredId || tgt === hoveredId) return 2.5;
      return 0.5;
    },
    [hoveredId],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* entity search / picker */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entity to explore…"
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && entities.length > 0 && (
            <div className="absolute z-20 top-full mt-1 left-0 w-full rounded-lg border bg-popover shadow-md max-h-48 overflow-auto">
              {entities.map((e) => (
                <button
                  key={e.id}
                  onClick={() => pickEntity(e)}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: colorFor(e.type) }}
                  />
                  <span className="truncate">{e.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{e.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* depth control */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>Depth</span>
          <button
            onClick={() => setDepth((d) => Math.max(1, d - 1))}
            className="p-1 rounded hover:bg-muted"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-5 text-center font-medium text-foreground">{depth}</span>
          <button
            onClick={() => setDepth((d) => Math.min(5, d + 1))}
            className="p-1 rounded hover:bg-muted"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* fit button */}
        <button
          onClick={() => graphRef.current?.zoomToFit(400, 60)}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
          title="Fit to view"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* breadcrumb trail */}
        {history.length > 0 && (
          <div className="flex items-center gap-1 text-sm ml-auto overflow-x-auto max-w-[40%]">
            {history.map((h, i) => (
              <span key={h.id} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                <button
                  onClick={() => navigateTo(h.id, h.name)}
                  className={cn(
                    "px-2 py-0.5 rounded text-xs transition-colors",
                    h.id === centerId
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {h.name}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* main area */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* graph canvas */}
        <div
          ref={containerRef}
          className="flex-1 rounded-xl border bg-background overflow-hidden relative"
        >
          {!centerId && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Search and select an entity to explore its neighborhood
            </div>
          )}
          {centerId && isLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Loading graph…
            </div>
          )}
          {centerId && !isLoading && fgData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              No connections found for this entity
            </div>
          )}
          {centerId && fgData.nodes.length > 0 && (
            <ForceGraph2D
              ref={graphRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={fgData}
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={nodePointerArea}
              onNodeClick={handleNodeClick}
              onNodeRightClick={handleNodeDblClick}
              onNodeHover={(node) => setHoveredId(node?.id ?? null)}
              onNodeDragEnd={(node) => {
                (node as any).fx = (node as any).x;
                (node as any).fy = (node as any).y;
              }}
              linkColor={linkColor}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              linkCurvature={0.15}
              linkWidth={linkWidth}
              cooldownTicks={0}
              enableZoomInteraction
              enablePanInteraction
              onBackgroundClick={() => setSelected(null)}
            />
          )}

          {/* instructions overlay */}
          {centerId && fgData.nodes.length > 0 && (
            <div className="absolute top-3 right-3 text-[11px] text-muted-foreground bg-background/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border">
              Click to inspect · Drag to pin · Scroll to zoom
            </div>
          )}
        </div>

        {/* detail panel */}
        {selected && (
          <div className="w-72 shrink-0 rounded-xl border bg-background p-4 overflow-auto">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-sm">{selected.name}</h3>
                <span
                  className="inline-flex items-center gap-1.5 text-xs mt-1 px-2 py-0.5 rounded-full text-white"
                  style={{ background: colorFor(selected.type) }}
                >
                  {selected.type}
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1 rounded text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* connections */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Connections
                </h4>
                <div className="space-y-1">
                  {graphData?.edges
                    .filter((e) => e.source === selected.id || e.target === selected.id)
                    .map((e) => {
                      const otherId = e.source === selected.id ? e.target : e.source;
                      const other = graphData?.nodes.find((n) => n.id === otherId);
                      if (!other) return null;
                      return (
                        <button
                          key={e.id}
                          onClick={() => navigateTo(other.id, other.name)}
                          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted text-sm transition-colors"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: colorFor(other.type) }}
                          />
                          <span className="truncate">{other.name}</span>
                          <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                            {e.type}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* properties */}
              {selected.properties && Object.keys(selected.properties).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                    Properties
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(selected.properties).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">{k}:</span>
                        <span className="truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* navigate button */}
              {selected.id !== centerId && (
                <button
                  onClick={() => navigateTo(selected.id, selected.name)}
                  className="w-full mt-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Explore from here
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
