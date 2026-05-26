import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { providerOf } from '../lib/types';
import type { SubagentNodeData } from '../lib/types';
import { fmtCost, fmtTokens, fmtDuration } from '../lib/format';
import SourceHandles, { sourceHandleCount } from './SourceHandles';

function SubagentNodeImpl(props: NodeProps) {
  const data = props.data as unknown as SubagentNodeData;
  const s = data.subagent;
  const provider = providerOf(s.model);
  const failed = s.exitCode && s.exitCode !== 0;
  return (
    <div
      className={`node node-subagent provider-${provider} ${failed ? 'exit-nonzero' : ''} ${
        props.selected ? 'selected' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <SourceHandles count={sourceHandleCount(props.data)} />
      <div className="title">{s.agent}</div>
      <div className="meta">
        {provider} · {s.turns} turn{s.turns === 1 ? '' : 's'} · {fmtDuration(s.durationMs)}
      </div>
      <div className="meta">
        {fmtTokens(s.tokens?.totalTokens)} tok · {fmtCost(s.tokens?.cost?.total)}
        {failed ? ` · exit ${s.exitCode}` : ''}
      </div>
    </div>
  );
}

export default memo(SubagentNodeImpl);
