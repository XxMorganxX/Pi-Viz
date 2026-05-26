import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  useReactFlow,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import MissionNode from './MissionNode';
import ThreadNode from './ThreadNode';
import ResponseFrameNode from './ResponseFrameNode';
import AgentExecutionNode from './AgentExecutionNode';
import TraceFeedNode from './TraceFeedNode';
import { graphInteractionProps } from '../lib/graph-interactions';
import type { GraphModel, NodeData } from '../lib/types';
import {
  graphNodesToFlowNodes,
  mergeFlowNodePositions,
  moveContainedNodesWithDraggedFrames,
  preventResponseFrameOverlapDuringDrag,
  syncResponseFrameBounds,
} from '../lib/flow-nodes';
import { graphEdgesToFlowEdges } from '../lib/flow-edges';

const nodeTypes: NodeTypes = {
  mission: MissionNode,
  thread: ThreadNode,
  responseFrame: ResponseFrameNode,
  orchestrator: AgentExecutionNode,
  subagent: AgentExecutionNode,
  traceFeed: TraceFeedNode,
};

interface Props {
  graph: GraphModel;
  enteredIds?: Set<string>;
  selectedId: string | null;
  focusedNodeId?: string | null;
  onFocusedNodeSettled?: () => void;
  onSelect: (id: string | null, data: NodeData | null) => void;
}

function GraphCanvasInner({
  graph,
  enteredIds,
  selectedId,
  focusedNodeId,
  onFocusedNodeSettled,
  onSelect,
}: Props) {
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow<Node, Edge>();
  const graphNodesRef = useRef(graph.nodes);
  graphNodesRef.current = graph.nodes;
  const enteredIdsRef = useRef<Set<string>>(enteredIds ?? new Set());
  enteredIdsRef.current = enteredIds ?? new Set();

  const flowNodes: Node[] = useMemo(
    () => graphNodesToFlowNodes(graph.nodes, selectedId, enteredIdsRef.current, graph.edges),
    [graph.nodes, graph.edges, selectedId, enteredIds]
  );

  const flowEdges: Edge[] = useMemo(() => {
    return graphEdgesToFlowEdges(graph.edges, graph.nodes);
  }, [graph.edges, graph.nodes]);

  useEffect(() => {
    setNodes((current) => syncResponseFrameBounds(mergeFlowNodePositions(flowNodes, current), graph.nodes));
  }, [flowNodes, graph.nodes, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      setNodes((current) => {
        const changed = applyNodeChanges(changes, current);
        const moved = moveContainedNodesWithDraggedFrames(changed, current, graphNodesRef.current);
        const clamped = preventResponseFrameOverlapDuringDrag(moved, current, graphNodesRef.current);
        return syncResponseFrameBounds(clamped, graphNodesRef.current);
      });
    },
    [setNodes]
  );

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  useEffect(() => {
    if (!focusedNodeId || !nodes.some((node) => node.id === focusedNodeId)) return;
    void fitView({ nodes: [{ id: focusedNodeId }], padding: 0.2, duration: 260 });
    onFocusedNodeSettled?.();
  }, [fitView, focusedNodeId, nodes, onFocusedNodeSettled]);

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        {...graphInteractionProps}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const original = graph.nodes.find((n) => n.id === node.id);
          onSelect(node.id, (original?.data as NodeData) ?? null);
        }}
        onPaneClick={() => onSelect(null, null)}
      >
        <Background gap={24} color="#1c2030" />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export default function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
