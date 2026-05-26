import { Handle, Position } from '@xyflow/react';
import { sourceHandleId } from '../lib/flow-edges';

export function sourceHandleCount(data: unknown): number {
  const count = (data as { __sourceHandleCount?: unknown }).__sourceHandleCount;
  return typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.ceil(count) : 1;
}

export default function SourceHandles({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: Math.max(1, count) }, (_, index) => (
        <Handle
          id={sourceHandleId(index)}
          key={sourceHandleId(index)}
          position={Position.Bottom}
          style={{
            left: `${((index + 1) / (count + 1)) * 100}%`,
            opacity: 0,
          }}
          type="source"
        />
      ))}
    </>
  );
}
