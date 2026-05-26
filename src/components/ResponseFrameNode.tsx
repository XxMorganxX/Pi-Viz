import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ResponseFrameNodeData } from '../lib/types';
import { fmtCost, fmtDuration, fmtTokens } from '../lib/format';
import SourceHandles, { sourceHandleCount } from './SourceHandles';

function ResponseFrameNodeImpl(props: NodeProps) {
  const data = props.data as unknown as ResponseFrameNodeData;
  const { turn, promptPreview, assistantPreview } = data;
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  const [expandedAssistant, setExpandedAssistant] = useState(false);
  const promptText = promptPreview || 'No user prompt preview recorded.';
  const assistantText = assistantPreview || 'No final response preview recorded.';

  return (
    <div
      className={[
        'node-response-frame',
        props.selected ? 'selected' : '',
        expandedAssistant ? 'assistant-expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle type="target" position={Position.Top} />
      <SourceHandles count={sourceHandleCount(props.data)} />
      <div className="response-frame-header">
        <span className="response-frame-label">Prompt {turn.index}</span>
        <button
          type="button"
          className={`response-frame-preview nodrag ${expandedPrompt ? 'expanded' : ''}`}
          aria-expanded={expandedPrompt}
          title={expandedPrompt ? 'Collapse prompt preview' : 'Expand prompt preview'}
          onClick={(event) => {
            event.stopPropagation();
            setExpandedPrompt((expanded) => !expanded);
          }}
        >
          <strong>{promptText}</strong>
        </button>
      </div>
      <div className="response-frame-body" />
      <div className={`response-frame-footer ${expandedAssistant ? 'assistant-expanded' : ''}`}>
        <span className="response-frame-label">Assistant response</span>
        <button
          type="button"
          className={`response-frame-preview nodrag ${expandedAssistant ? 'expanded' : ''}`}
          aria-expanded={expandedAssistant}
          title={expandedAssistant ? 'Collapse response preview' : 'Expand response preview'}
          onClick={(event) => {
            event.stopPropagation();
            setExpandedAssistant((expanded) => !expanded);
          }}
        >
          <strong>{assistantText}</strong>
        </button>
        <em>
          {fmtDuration(turn.durationMs)} · {turn.toolCalls} tool · {turn.subagentCalls} subagent ·{' '}
          {fmtTokens(turn.tokens.totalTokens)} tok · {fmtCost(turn.tokens.cost.total)}
        </em>
      </div>
    </div>
  );
}

export default memo(ResponseFrameNodeImpl);
