import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { MissionNodeData } from '../lib/types';
import { fmtCost, fmtDuration, fmtTokens, shortMissionTitle } from '../lib/format';
import SourceHandles, { sourceHandleCount } from './SourceHandles';

function MissionNodeImpl(props: NodeProps) {
  const data = props.data as unknown as MissionNodeData;
  const { mission } = data;
  return (
    <div className={`node-mission kind-${mission.kind}`}>
      <SourceHandles count={sourceHandleCount(props.data)} />
      <div className="title">{shortMissionTitle(mission.title || mission.id)}</div>
      <div className="meta">
        {mission.kind} · {mission.threadCount} thread{mission.threadCount === 1 ? '' : 's'} ·{' '}
        {fmtTokens(mission.tokens?.totalTokens)} tok · {fmtCost(mission.tokens?.cost?.total)} ·{' '}
        {fmtDuration(mission.durationMs)}
      </div>
    </div>
  );
}

export default memo(MissionNodeImpl);
