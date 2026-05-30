import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MilestoneNodeData } from '../lib/types';
import { fmtDuration } from '../lib/format';
import SourceHandles, { sourceHandleCount } from './SourceHandles';

function MilestoneNodeImpl(props: NodeProps) {
  const data = props.data as unknown as MilestoneNodeData;
  const m = data.milestone;
  return (
    <div
      className={`node node-milestone milestone-${m.status} ${props.selected ? 'selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <SourceHandles count={sourceHandleCount(props.data)} />
      <div className="milestone-head">
        <span className={`milestone-chip milestone-chip-${m.status}`}>{m.status}</span>
        <span className="title">{m.title}</span>
      </div>
      <div className="meta">
        {m.kind ? `${m.kind} · ` : ''}
        {m.source}
        {m.progress ? ` · ${m.progress.completed}/${m.progress.total}` : ''}
        {m.durationMs != null ? ` · ${fmtDuration(m.durationMs)}` : ''}
      </div>
    </div>
  );
}

export default memo(MilestoneNodeImpl);
