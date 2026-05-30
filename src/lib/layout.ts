import dagre from 'dagre';
import type { GraphEdge, GraphModel, GraphNode } from './types';

const MISSION_W = 560;
const MISSION_H = 190;
const SESSION_ROOT_W = 620;
const SESSION_ROOT_H = 190;
const RESPONSE_FRAME_W = 1180;
const RESPONSE_FRAME_H = 1120;
const AGENT_EXECUTION_W = 620;
const AGENT_EXECUTION_H = 210;
const TRACE_FEED_W = 860;
const TRACE_FEED_H = 760;
const MILESTONE_W = 520;
const MILESTONE_H = 170;
const RESPONSE_FRAME_PAD_X = 70;
const RESPONSE_FRAME_PAD_TOP = 190;
const RESPONSE_FRAME_PAD_BOTTOM = 150;
const RESPONSE_FRAME_STACK_GAP_Y = 180;
const AGENT_LEVEL_GAP_Y = 170;
const CHILD_ROW_WIDTH_MULTIPLIER = 1.6;
const TRACE_FEED_ROW_GAP_Y = 120;
const TRACE_FEED_SIDE_GAP_X = 230;
const TRACE_FEED_COLUMN_GAP_X = 160;

/**
 * Hierarchical tree layout. Missions, threads, and subagents are regular
 * draggable nodes; parent-child relationships are shown by directed edges.
 */
export function layoutGraph(model: GraphModel): GraphModel {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 120, ranksep: 80, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of model.nodes) {
    const size = sizeForNode(n);
    g.setNode(n.id, size);
  }

  const edgeKeys = new Set<string>();
  for (const e of model.edges) {
    g.setEdge(e.source, e.target);
    edgeKeys.add(`${e.source}->${e.target}`);
  }

  for (const n of model.nodes) {
    const parentId = n.containerId ?? n.parentId;
    if (!parentId || parentId === n.id) continue;
    const edgeKey = `${parentId}->${n.id}`;
    if (edgeKeys.has(edgeKey)) continue;
    g.setEdge(parentId, n.id);
    edgeKeys.add(edgeKey);
  }

  dagre.layout(g);

  const positioned: GraphNode[] = model.nodes.map((n) => {
    const size = sizeForNode(n);
    const p = g.node(n.id);
    return {
      ...n,
      extent: undefined,
      position: {
        x: p.x - size.width / 2,
        y: p.y - size.height / 2,
      },
      width: size.width,
      height: size.height,
      style: { ...n.style, width: size.width, height: size.height },
    };
  });

  const formatted = formatResponseFrameContents(positioned);
  const framed = expandResponseFrames(formatted);
  const stacked = stackResponseFrames(framed);
  const edges: GraphEdge[] = model.edges.map((e) => ({ ...e }));
  return { nodes: stacked, edges };
}

function sizeForNode(node: GraphNode): { width: number; height: number } {
  if (node.category === 'missionGroup') return { width: MISSION_W, height: MISSION_H };
  if (node.category === 'sessionRoot') return { width: SESSION_ROOT_W, height: SESSION_ROOT_H };
  if (node.category === 'responseFrame') return { width: RESPONSE_FRAME_W, height: RESPONSE_FRAME_H };
  if (node.category === 'agentExecution') return { width: AGENT_EXECUTION_W, height: AGENT_EXECUTION_H };
  if (node.category === 'milestone') return { width: MILESTONE_W, height: MILESTONE_H };
  return { width: TRACE_FEED_W, height: TRACE_FEED_H };
}

function formatResponseFrameContents(nodes: GraphNode[]): GraphNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByFrameId = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    if (!node.containerId) continue;
    const siblings = childrenByFrameId.get(node.containerId) ?? [];
    siblings.push(node);
    childrenByFrameId.set(node.containerId, siblings);
  }

  const updatesById = new Map<string, { x: number; y: number }>();

  for (const [frameId, children] of childrenByFrameId) {
    const frame = nodeById.get(frameId);
    if (!frame) continue;

    const agents = children.filter((node) => node.category === 'agentExecution');
    const traceFeeds = children.filter((node) => node.category === 'traceDisplay');
    if (agents.length === 0) continue;

    const frameCenterX = frame.position.x + (frame.width ?? RESPONSE_FRAME_W) / 2;
    const topY = frame.position.y + RESPONSE_FRAME_PAD_TOP;
    layoutAgentSubtrees(agents, frameCenterX, topY, updatesById);
    layoutTraceFeeds(traceFeeds, agents, frameCenterX, nodeById, updatesById);
  }

  if (updatesById.size === 0) return nodes;
  return nodes.map((node) => {
    const position = updatesById.get(node.id);
    return position ? { ...node, position } : node;
  });
}

function layoutAgentSubtrees(
  agents: GraphNode[],
  frameCenterX: number,
  topY: number,
  updatesById: Map<string, { x: number; y: number }>
): number {
  const agentIds = new Set(agents.map((node) => node.id));
  const agentById = new Map(agents.map((node) => [node.id, node]));
  const childrenByParentId = new Map<string, GraphNode[]>();
  const levelsById = new Map<string, number>();

  for (const agent of agents) {
    if (!agent.parentId || !agentIds.has(agent.parentId)) continue;
    const siblings = childrenByParentId.get(agent.parentId) ?? [];
    siblings.push(agent);
    childrenByParentId.set(agent.parentId, siblings);
  }

  for (const siblings of childrenByParentId.values()) {
    siblings.sort(compareAgents);
  }

  const roots = agents.filter((agent) => !agent.parentId || !agentIds.has(agent.parentId)).sort(compareAgents);
  const rootAgents = roots.length > 0 ? roots : [...agents].sort(compareAgents);
  let deepestAgentBottom = topY;

  const placeAgent = (agent: GraphNode, centerX: number, level: number): void => {
    const width = agent.width ?? AGENT_EXECUTION_W;
    const y = topY + level * (AGENT_EXECUTION_H + AGENT_LEVEL_GAP_Y);
    updatesById.set(agent.id, { x: centerX - width / 2, y });
    levelsById.set(agent.id, level);
    deepestAgentBottom = Math.max(deepestAgentBottom, y + (agent.height ?? AGENT_EXECUTION_H));
  };

  const placeChildRow = (children: GraphNode[], parentCenterX: number, level: number): void => {
    if (children.length === 0) return;
    const row = children.sort(compareAgents);
    const widthSum = row.reduce((sum, child) => sum + (child.width ?? AGENT_EXECUTION_W), 0);
    const rowWidth = widthSum * CHILD_ROW_WIDTH_MULTIPLIER;
    const gap = row.length > 1 ? (rowWidth - widthSum) / (row.length - 1) : 0;
    let x = parentCenterX - rowWidth / 2;

    for (const child of row) {
      const width = child.width ?? AGENT_EXECUTION_W;
      placeAgent(child, x + width / 2, level);
      x += width + gap;
    }
  };

  placeChildRow(rootAgents, frameCenterX, 0);

  for (let level = 0; level < agents.length; level += 1) {
    const parentsAtLevel = agents
      .filter((agent) => levelsById.get(agent.id) === level)
      .sort((a, b) => (updatesById.get(a.id)?.x ?? a.position.x) - (updatesById.get(b.id)?.x ?? b.position.x));

    if (parentsAtLevel.length === 0) continue;

    for (const parent of parentsAtLevel) {
      const parentPosition = updatesById.get(parent.id);
      if (!parentPosition) continue;
      placeChildRow(
        childrenByParentId.get(parent.id) ?? [],
        parentPosition.x + (parent.width ?? AGENT_EXECUTION_W) / 2,
        level + 1
      );
    }
  }

  for (const agent of agentById.values()) {
    if (updatesById.has(agent.id)) continue;
    const width = agent.width ?? AGENT_EXECUTION_W;
    const y = topY + (updatesById.size + 1) * (AGENT_EXECUTION_H + AGENT_LEVEL_GAP_Y);
    updatesById.set(agent.id, { x: frameCenterX - width / 2, y });
    deepestAgentBottom = Math.max(deepestAgentBottom, y + (agent.height ?? AGENT_EXECUTION_H));
  }

  return deepestAgentBottom;
}

function layoutTraceFeeds(
  traceFeeds: GraphNode[],
  agents: GraphNode[],
  frameCenterX: number,
  nodeById: Map<string, GraphNode>,
  updatesById: Map<string, { x: number; y: number }>
): void {
  if (traceFeeds.length === 0) return;

  const agentBounds = agents.reduce(
    (bounds, agent) => {
      const position = updatesById.get(agent.id) ?? agent.position;
      return {
        minX: Math.min(bounds.minX, position.x),
        maxX: Math.max(bounds.maxX, position.x + (agent.width ?? AGENT_EXECUTION_W)),
      };
    },
    { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY }
  );
  const treeRight = Number.isFinite(agentBounds.maxX)
    ? agentBounds.maxX
    : frameCenterX + AGENT_EXECUTION_W / 2;
  let orchestratorLane = 0;

  for (const feed of traceFeeds.sort(compareTraceFeeds)) {
    const parent = feed.parentId ? nodeById.get(feed.parentId) : undefined;
    const parentPosition = parent ? updatesById.get(parent.id) ?? parent.position : undefined;
    const feedWidth = feed.width ?? TRACE_FEED_W;
    const parentWidth = parent?.width ?? AGENT_EXECUTION_W;
    const parentHeight = parent?.height ?? AGENT_EXECUTION_H;

    if (parent?.type === 'orchestrator') {
      updatesById.set(feed.id, {
        x: treeRight + TRACE_FEED_SIDE_GAP_X + orchestratorLane * (feedWidth + TRACE_FEED_COLUMN_GAP_X),
        y: (parentPosition?.y ?? 0) + parentHeight + TRACE_FEED_ROW_GAP_Y,
      });
      orchestratorLane += 1;
      continue;
    }

    const parentCenterX = parentPosition
      ? parentPosition.x + parentWidth / 2
      : frameCenterX;
    const parentBottomY = parentPosition
      ? parentPosition.y + parentHeight
      : 0;

    updatesById.set(feed.id, {
      x: parentCenterX - feedWidth / 2,
      y: parentBottomY + TRACE_FEED_ROW_GAP_Y,
    });
  }
}

function compareAgents(a: GraphNode, b: GraphNode): number {
  if (a.type === 'orchestrator' && b.type !== 'orchestrator') return -1;
  if (b.type === 'orchestrator' && a.type !== 'orchestrator') return 1;
  return a.position.x - b.position.x || a.id.localeCompare(b.id);
}

function compareTraceFeeds(a: GraphNode, b: GraphNode): number {
  const aOwner = a.data.kind === 'traceFeed' ? a.data.ownerKind : '';
  const bOwner = b.data.kind === 'traceFeed' ? b.data.ownerKind : '';
  if (aOwner === 'orchestrator' && bOwner !== 'orchestrator') return -1;
  if (bOwner === 'orchestrator' && aOwner !== 'orchestrator') return 1;
  return a.position.x - b.position.x || a.id.localeCompare(b.id);
}

function expandResponseFrames(nodes: GraphNode[]): GraphNode[] {
  const byFrameId = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (!node.containerId) continue;
    const siblings = byFrameId.get(node.containerId) ?? [];
    siblings.push(node);
    byFrameId.set(node.containerId, siblings);
  }

  const frameBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const [frameId, children] of byFrameId) {
    const minX = Math.min(...children.map((node) => node.position.x));
    const minY = Math.min(...children.map((node) => node.position.y));
    const maxX = Math.max(...children.map((node) => node.position.x + (node.width ?? 0)));
    const maxY = Math.max(...children.map((node) => node.position.y + (node.height ?? 0)));
    const width = Math.max(RESPONSE_FRAME_W, maxX - minX + RESPONSE_FRAME_PAD_X * 2);
    const height = Math.max(
      RESPONSE_FRAME_H,
      maxY - minY + RESPONSE_FRAME_PAD_TOP + RESPONSE_FRAME_PAD_BOTTOM
    );
    const centerX = (minX + maxX) / 2;
    frameBounds.set(frameId, {
      x: centerX - width / 2,
      y: minY - RESPONSE_FRAME_PAD_TOP,
      width,
      height,
    });
  }

  return nodes.map((node) => {
    const bounds = frameBounds.get(node.id);
    if (!bounds) return node;
    return {
      ...node,
      position: { x: bounds.x, y: bounds.y },
      width: bounds.width,
      height: bounds.height,
      style: { width: bounds.width, height: bounds.height },
    };
  });
}

function stackResponseFrames(nodes: GraphNode[]): GraphNode[] {
  const frames = nodes
    .filter((node) => node.category === 'responseFrame')
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id));
  if (frames.length < 2) return nodes;

  const shiftsByFrameId = new Map<string, { x: number; y: number }>();
  const targetCenterX = frames[0].position.x + (frames[0].width ?? RESPONSE_FRAME_W) / 2;
  let previousBottom = Number.NEGATIVE_INFINITY;

  for (const frame of frames) {
    const minY = previousBottom + RESPONSE_FRAME_STACK_GAP_Y;
    const shiftY = frame.position.y < minY ? minY - frame.position.y : 0;
    const shiftedY = frame.position.y + shiftY;
    const shiftX = targetCenterX - (frame.position.x + (frame.width ?? RESPONSE_FRAME_W) / 2);
    if (shiftX !== 0 || shiftY > 0) shiftsByFrameId.set(frame.id, { x: shiftX, y: shiftY });
    previousBottom = shiftedY + (frame.height ?? RESPONSE_FRAME_H);
  }

  if (shiftsByFrameId.size === 0) return nodes;

  return nodes.map((node) => {
    const shift = shiftsByFrameId.get(node.id) ?? (node.containerId ? shiftsByFrameId.get(node.containerId) : undefined);
    if (!shift) return node;

    return {
      ...node,
      position: {
        x: node.position.x + shift.x,
        y: node.position.y + shift.y,
      },
    };
  });
}
