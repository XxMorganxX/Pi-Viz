import type { Node } from '@xyflow/react';

export interface StoredNodeLayout {
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export type StoredLayout = Record<string, StoredNodeLayout>;

interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function layoutStorageKey(topologyKey: string): string {
  return `agent-viz:layout:${topologyKey}`;
}

export function captureNodeLayout(nodes: Array<Pick<Node, 'id' | 'position' | 'width' | 'height'>>): StoredLayout {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        position: { x: node.position.x, y: node.position.y },
        ...(numeric(node.width) !== undefined ? { width: numeric(node.width) } : {}),
        ...(numeric(node.height) !== undefined ? { height: numeric(node.height) } : {}),
      },
    ])
  );
}

export function applySavedNodeLayout<T extends Pick<Node, 'id' | 'position' | 'width' | 'height'>>(
  nodes: T[],
  saved: StoredLayout | null
): T[] {
  if (!saved) return nodes;

  return nodes.map((node) => {
    const stored = saved[node.id];
    if (!stored || !validPosition(stored.position)) return node;

    return {
      ...node,
      position: stored.position,
      ...(stored.width !== undefined ? { width: stored.width } : {}),
      ...(stored.height !== undefined ? { height: stored.height } : {}),
      style: {
        ...(node as { style?: object }).style,
        ...(stored.width !== undefined ? { width: stored.width } : {}),
        ...(stored.height !== undefined ? { height: stored.height } : {}),
      },
    };
  });
}

export function readSavedNodeLayout(storage: LayoutStorage | undefined, key: string): StoredLayout | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return validStoredLayout(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSavedNodeLayout(storage: LayoutStorage | undefined, key: string, layout: StoredLayout): void {
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(layout));
  } catch {
    storage.removeItem(key);
  }
}

function validStoredLayout(value: unknown): value is StoredLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const layout = entry as Partial<StoredNodeLayout>;
    return (
      validPosition(layout.position) &&
      (layout.width === undefined || Number.isFinite(layout.width)) &&
      (layout.height === undefined || Number.isFinite(layout.height))
    );
  });
}

function validPosition(position: unknown): position is { x: number; y: number } {
  return (
    !!position &&
    typeof position === 'object' &&
    Number.isFinite((position as { x?: unknown }).x) &&
    Number.isFinite((position as { y?: unknown }).y)
  );
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
