import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ThreadNodeData } from '../lib/types';
import { fmtCost, fmtTokens, fmtDuration } from '../lib/format';
import SourceHandles, { sourceHandleCount } from './SourceHandles';

function ThreadNodeImpl(props: NodeProps) {
  const data = props.data as unknown as ThreadNodeData;
  const t = data.thread;
  return (
    <div className={`node node-thread kind-${t.missionKind} ${props.selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <SourceHandles count={sourceHandleCount(props.data)} />
      <div className="title">session · {t.channelId.slice(0, 8)}…</div>
      <div className="meta">
        {t.missionKind} · {t.turnCount} turn{t.turnCount === 1 ? '' : 's'} · {fmtDuration(t.durationMs)}
      </div>
      <div className="meta">
        {t.toolCallCount} tool · {t.subagentCallCount} subagent · {fmtTokens(t.tokens?.totalTokens)} tok ·{' '}
        {fmtCost(t.tokens?.cost?.total)}
      </div>
    </div>
  );
}

export default memo(ThreadNodeImpl);
