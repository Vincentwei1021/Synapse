"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GoNoGoBadge } from "@/components/go-no-go-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchQuestionNode {
  uuid: string;
  title: string;
  status: string;
}

interface ExperimentDesignNode {
  uuid: string;
  title: string;
  status: string;
  inputUuids: string[];
}

interface ExperimentRunNode {
  uuid: string;
  title: string;
  status: string;
  outcome: string | null;
  experimentDesignUuid: string | null;
  goNoGoCriteria?: {
    metricName: string | null;
    threshold: number | null;
    operator: string | null;
    actualValue: number | null;
    required: boolean;
    isEarlyStop: boolean;
  }[];
}

interface HypothesisBoardProps {
  questions: ResearchQuestionNode[];
  designs: ExperimentDesignNode[];
  runs: ExperimentRunNode[];
  projectUuid: string;
}

// ---------------------------------------------------------------------------
// Status / outcome helpers
// ---------------------------------------------------------------------------

const questionStatusColors: Record<string, string> = {
  open: "bg-[#E3F2FD] text-[#1976D2]",
  completed: "bg-[#E0F2F1] text-[#00796B]",
  closed: "bg-[#F5F5F5] text-[#9A9A9A]",
};

const designStatusColors: Record<string, string> = {
  approved: "bg-[#E8F5E9] text-[#5A9E6F]",
  rejected: "bg-[#FFEBEE] text-[#D32F2F]",
  pending: "bg-[#FFF3E0] text-[#E65100]",
  draft: "bg-[#F5F5F5] text-[#9A9A9A]",
};

const outcomeBorderColors: Record<string, string> = {
  accepted: "#22c55e",
  rejected: "#ef4444",
  inconclusive: "#eab308",
};

const outcomeBadgeColors: Record<string, string> = {
  accepted: "bg-[#E8F5E9] text-[#22c55e]",
  rejected: "bg-[#FFEBEE] text-[#ef4444]",
  inconclusive: "bg-[#FFFDE7] text-[#eab308]",
};

// ---------------------------------------------------------------------------
// Node dimensions per type
// ---------------------------------------------------------------------------

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  question: { width: 220, height: 80 },
  design: { width: 200, height: 80 },
  run: { width: 180, height: 80 },
};

// ---------------------------------------------------------------------------
// Custom node components
// ---------------------------------------------------------------------------

interface QuestionNodeData {
  label: string;
  status: string;
  nodeKind: "question";
  [key: string]: unknown;
}

function QuestionNode({ data }: NodeProps<Node<QuestionNodeData>>) {
  return (
    <div
      className="rounded-lg border-2 bg-white px-4 py-3 shadow-sm cursor-pointer"
      style={{ borderColor: "#1976D2", width: 220 }}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-[#1976D2] !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1.5">
        <Badge className={`text-[10px] ${questionStatusColors[data.status] || "bg-[#F5F5F5] text-[#9A9A9A]"}`}>
          {data.status}
        </Badge>
      </div>
      <p className="text-xs font-medium text-[#2C2C2C] leading-snug line-clamp-2">
        {data.label}
      </p>
    </div>
  );
}

interface DesignNodeData {
  label: string;
  status: string;
  nodeKind: "design";
  [key: string]: unknown;
}

function DesignNode({ data }: NodeProps<Node<DesignNodeData>>) {
  return (
    <div
      className="rounded-lg border-2 bg-white px-4 py-3 shadow-sm cursor-pointer"
      style={{ borderColor: "#7B1FA2", width: 200 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#7B1FA2] !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1.5">
        <Badge className={`text-[10px] ${designStatusColors[data.status] || "bg-[#F5F5F5] text-[#9A9A9A]"}`}>
          {data.status}
        </Badge>
      </div>
      <p className="text-xs font-medium text-[#2C2C2C] leading-snug line-clamp-2">
        {data.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-[#7B1FA2] !w-2 !h-2" />
    </div>
  );
}

interface RunNodeData {
  label: string;
  status: string;
  outcome: string | null;
  nodeKind: "run";
  goNoGoCriteria?: {
    metricName: string | null;
    threshold: number | null;
    operator: string | null;
    actualValue: number | null;
    required: boolean;
    isEarlyStop: boolean;
  }[];
  [key: string]: unknown;
}

function RunNode({ data }: NodeProps<Node<RunNodeData>>) {
  const borderColor = data.outcome
    ? outcomeBorderColors[data.outcome] || "#9ca3af"
    : "#9ca3af";

  return (
    <div
      className="rounded-lg border-2 bg-white px-4 py-3 shadow-sm cursor-pointer"
      style={{ borderColor, width: 180 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#9ca3af] !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        {data.outcome && (
          <Badge className={`text-[10px] ${outcomeBadgeColors[data.outcome] || "bg-[#F5F5F5] text-[#9A9A9A]"}`}>
            {data.outcome}
          </Badge>
        )}
        {data.goNoGoCriteria && data.goNoGoCriteria.some((c) => c.metricName) && (
          <GoNoGoBadge criteria={data.goNoGoCriteria} size="sm" />
        )}
      </div>
      <p className="text-xs font-medium text-[#2C2C2C] leading-snug line-clamp-2">
        {data.label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node type registry
// ---------------------------------------------------------------------------

const nodeTypes = {
  question: QuestionNode,
  design: DesignNode,
  run: RunNode,
};

// ---------------------------------------------------------------------------
// Dagre layout
// ---------------------------------------------------------------------------

type AnyNodeData = QuestionNodeData | DesignNodeData | RunNodeData;

function getLayoutedElements(
  nodes: Node<AnyNodeData>[],
  edges: Edge[],
): { nodes: Node<AnyNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    const dims = NODE_DIMENSIONS[node.type || "question"];
    g.setNode(node.id, { width: dims.width, height: dims.height });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const dims = NODE_DIMENSIONS[node.type || "question"];
    return {
      ...node,
      position: {
        x: pos.x - dims.width / 2,
        y: pos.y - dims.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ---------------------------------------------------------------------------
// Edge style
// ---------------------------------------------------------------------------

const defaultEdgeStyle = {
  animated: true,
  style: { stroke: "#C67A52", strokeWidth: 2 },
  markerEnd: { type: "arrowclosed" as const, color: "#C67A52" },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HypothesisBoard({
  questions,
  designs,
  runs,
  projectUuid,
}: HypothesisBoardProps) {
  const router = useRouter();

  const { initialNodes, initialEdges } = useMemo(() => {
    const builtNodes: Node<AnyNodeData>[] = [];
    const builtEdges: Edge[] = [];

    // Question nodes
    questions.forEach((q) => {
      builtNodes.push({
        id: `q-${q.uuid}`,
        type: "question",
        position: { x: 0, y: 0 },
        data: { label: q.title, status: q.status, nodeKind: "question" as const },
      });
    });

    // Design nodes
    designs.forEach((d) => {
      builtNodes.push({
        id: `d-${d.uuid}`,
        type: "design",
        position: { x: 0, y: 0 },
        data: { label: d.title, status: d.status, nodeKind: "design" as const },
      });

      // Edges: Question -> Design
      d.inputUuids.forEach((qUuid) => {
        builtEdges.push({
          id: `e-q${qUuid}-d${d.uuid}`,
          source: `q-${qUuid}`,
          target: `d-${d.uuid}`,
          ...defaultEdgeStyle,
        });
      });
    });

    // Run nodes
    runs.forEach((r) => {
      builtNodes.push({
        id: `r-${r.uuid}`,
        type: "run",
        position: { x: 0, y: 0 },
        data: {
          label: r.title,
          status: r.status,
          outcome: r.outcome,
          nodeKind: "run" as const,
          goNoGoCriteria: r.goNoGoCriteria,
        },
      });

      // Edges: Design -> Run
      if (r.experimentDesignUuid) {
        builtEdges.push({
          id: `e-d${r.experimentDesignUuid}-r${r.uuid}`,
          source: `d-${r.experimentDesignUuid}`,
          target: `r-${r.uuid}`,
          ...defaultEdgeStyle,
        });
      }
    });

    if (builtNodes.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }

    const { nodes: laid, edges: laidEdges } = getLayoutedElements(builtNodes, builtEdges);
    return { initialNodes: laid, initialEdges: laidEdges };
  }, [questions, designs, runs]);

  const [nodes, , onNodesChange] = useNodesState<Node<AnyNodeData>>(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState<Edge>(initialEdges);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<AnyNodeData>) => {
      const data = node.data as AnyNodeData;
      const rawId = node.id;

      if (data.nodeKind === "question") {
        const uuid = rawId.replace("q-", "");
        router.push(`/research-projects/${projectUuid}/research-questions/${uuid}`);
      } else if (data.nodeKind === "design") {
        const uuid = rawId.replace("d-", "");
        router.push(`/research-projects/${projectUuid}/experiment-designs/${uuid}`);
      } else if (data.nodeKind === "run") {
        const uuid = rawId.replace("r-", "");
        router.push(`/research-projects/${projectUuid}/experiment-runs?run=${uuid}`);
      }
    },
    [router, projectUuid],
  );

  // Empty state
  if (questions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[#9A9A9A]">
        No research data to display
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-xl border border-[#E5E0D8] bg-[#FAFAF8]" style={{ minHeight: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E5E0D8" gap={20} />
        <Controls
          className="[&>button]:border-[#E5E0D8] [&>button]:bg-white [&>button]:text-[#2C2C2C] [&>button:hover]:bg-[#FAF8F4]"
        />
      </ReactFlow>
    </div>
  );
}
