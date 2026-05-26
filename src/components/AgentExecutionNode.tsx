import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { agentExecutionView } from '../lib/agent-execution';
import { providerOf } from '../lib/types';
import type { OrchestratorNodeData, SubagentNodeData } from '../lib/types';
import { fmtCost, fmtDuration, fmtTokens } from '../lib/format';
import SourceHandles, { sourceHandleCount } from './SourceHandles';

function AgentExecutionNodeImpl(props: NodeProps) {
  const data = props.data as unknown as OrchestratorNodeData | SubagentNodeData;
  const view = agentExecutionView(data);
  const provider = view.model ? providerOf(view.model) : 'other';
  const providerClass = view.role === 'orchestrator' ? `provider-${provider}` : '';
  const failed = view.exitCode !== undefined && view.exitCode !== 0;

  return (
    <div
      className={`node node-agent-execution role-${view.role} ${providerClass} ${failed ? 'exit-nonzero' : ''} ${
        props.selected ? 'selected' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <SourceHandles count={sourceHandleCount(props.data)} />
      <div className="title">{view.name}</div>
      <div className="meta">
        {view.role} · {provider} · {view.turns} turn{view.turns === 1 ? '' : 's'} ·{' '}
        {fmtDuration(view.durationMs)}
      </div>
      <div className="meta">
        {fmtTokens(view.tokens?.totalTokens)} tok · {fmtCost(view.tokens?.cost?.total)}
        {failed ? ` · exit ${view.exitCode}` : ''}
      </div>
    </div>
  );
}

export default memo(AgentExecutionNodeImpl);
