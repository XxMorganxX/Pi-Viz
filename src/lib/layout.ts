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
const RESPONSE_FRAME_PAD_X = 70;
const RESPONSE_FRAME_PAD_TOP = 190;
const RESPONSE_FRAME_PAD_BOTTOM = 150;
const AGENT_LEVEL_GAP_Y = 170;
const AGENT_SIBLING_GAP_X = 150;
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
  const edges: GraphEdge[] = model.edges.map((e) => ({ ...e }));
  return { nodes: framed, edges };
}

function sizeForNode(node: GraphNode): { width: number; height: number } {
  if (node.category === 'missionGroup') return { width: MISSION_W, height: MISSION_H };
  if (node.category === 'sessionRoot') return { width: SESSION_ROOT_W, height: SESSION_ROOT_H };
  if (node.category === 'responseFrame') return { width: RESPONSE_FRAME_W, height: RESPONSE_FRAME_H };
  if (node.category === 'agentExecution') return { width: AGENT_EXECUTION_W, height: AGENT_EXECUTION_H };
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

    const agentIds = new Set(agents.map((node) => node.id));
    const levelsById = agentLevels(agents, agentIds);
    const levels = [...new Set(levelsById.values())].sort((a, b) => a - b);
    const frameCenterX = frame.position.x + (frame.width ?? RESPONSE_FRAME_W) / 2;
    const topY = frame.position.y + RESPONSE_FRAME_PAD_TOP;
    let deepestAgentBottom = topY;

    for (const level of levels) {
      const levelAgents = agents
        .filter((node) => levelsById.get(node.id) === level)
        .sort(compareAgents);
      const totalWidth =
        levelAgents.reduce((sum, node) => sum + (node.width ?? AGENT_EXECUTION_W), 0) +
        Math.max(0, levelAgents.length - 1) * AGENT_SIBLING_GAP_X;
      let x = frameCenterX - totalWidth / 2;
      const y = topY + level * (AGENT_EXECUTION_H + AGENT_LEVEL_GAP_Y);

      for (const agent of levelAgents) {
        updatesById.set(agent.id, { x, y });
        deepestAgentBottom = Math.max(deepestAgentBottom, y + (agent.height ?? AGENT_EXECUTION_H));
        x += (agent.width ?? AGENT_EXECUTION_W) + AGENT_SIBLING_GAP_X;
      }
    }

    const sideCounts = new Map<number, number>();
    const feedRowY = deepestAgentBottom + TRACE_FEED_ROW_GAP_Y;
    for (const feed of traceFeeds.sort(compareTraceFeeds)) {
      const parent = feed.parentId ? nodeById.get(feed.parentId) : undefined;
      const parentPosition = parent ? updatesById.get(parent.id) ?? parent.position : undefined;
      const side = parent?.type === 'orchestrator' ? 1 : -1;
      const lane = sideCounts.get(side) ?? 0;
      sideCounts.set(side, lane + 1);

      const parentX = parentPosition?.x ?? frameCenterX - AGENT_EXECUTION_W / 2;
      const feedWidth = feed.width ?? TRACE_FEED_W;
      const parentWidth = parent?.width ?? AGENT_EXECUTION_W;
      const x =
        side === 1
          ? parentX + parentWidth + TRACE_FEED_SIDE_GAP_X + lane * (feedWidth + TRACE_FEED_COLUMN_GAP_X)
          : parentX - feedWidth - TRACE_FEED_SIDE_GAP_X - lane * (feedWidth + TRACE_FEED_COLUMN_GAP_X);

      updatesById.set(feed.id, { x, y: feedRowY });
    }
  }

  if (updatesById.size === 0) return nodes;
  return nodes.map((node) => {
    const position = updatesById.get(node.id);
    return position ? { ...node, position } : node;
  });
}

function agentLevels(agents: GraphNode[], agentIds: Set<string>): Map<string, number> {
  const levelsById = new Map<string, number>();
  const agentById = new Map(agents.map((node) => [node.id, node]));

  const levelFor = (agent: GraphNode, visiting: Set<string>): number => {
    const cached = levelsById.get(agent.id);
    if (cached !== undefined) return cached;
    if (visiting.has(agent.id)) return 0;

    visiting.add(agent.id);
    const parent = agent.parentId && agentIds.has(agent.parentId) ? agentById.get(agent.parentId) : undefined;
    const level = parent ? levelFor(parent, visiting) + 1 : 0;
    visiting.delete(agent.id);
    levelsById.set(agent.id, level);
    return level;
  };

  for (const agent of agents) {
    levelFor(agent, new Set());
  }

  return levelsById;
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
    frameBounds.set(frameId, {
      x: minX - RESPONSE_FRAME_PAD_X,
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
