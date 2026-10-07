import React from 'react';
import { Settings } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';

interface MeetingSettingsPanelProps {
  quorumValue: number;
  setQuorumValue: (quorum: number) => void;
  currentQuorum: number;
  presentCount: number;
  totalMembers: number;
  hasQuorum: boolean;
  dispatch: React.Dispatch<MeetingAction>;
}

export const MeetingSettingsPanel = React.memo(function MeetingSettingsPanel({
  quorumValue,
  setQuorumValue,
  currentQuorum,
  presentCount,
  totalMembers,
  hasQuorum,
  dispatch,
}: MeetingSettingsPanelProps) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-ink">
        <Settings size={18} /> Meeting Settings
      </h3>
      <div className="mb-3">
        <label className="block text-sm font-medium text-ink mb-1">Quorum Requirement</label>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            value={quorumValue}
            onChange={(e) => setQuorumValue(Math.max(1, parseInt(e.target.value) || 1))}
            className="flex-1 p-2 border border-rule rounded-lg bg-surface text-ink"
          />
          <button
            onClick={() =>
              dispatch({ type: 'SET_QUORUM', quorum: quorumValue, timestamp: generateTimestamp() })
            }
            disabled={quorumValue === currentQuorum}
            className="bg-gavel text-paper px-4 rounded-lg text-sm hover:bg-gavel/90 disabled:bg-rule disabled:cursor-not-allowed"
          >
            Set
          </button>
        </div>
        <p className="text-xs text-ink-muted mt-1">Minimum members required for quorum</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-surface-2 rounded-lg">
          <p className="text-ink-muted text-sm">Required</p>
          <p className="font-semibold text-lg text-ink">{currentQuorum}</p>
        </div>
        <div className="p-3 bg-surface-2 rounded-lg">
          <p className="text-ink-muted text-sm">Present</p>
          <p className="font-semibold text-lg text-ink">
            {presentCount} / {totalMembers}
          </p>
        </div>
      </div>
      <div
        className={`mt-3 p-3 rounded-lg ${
          hasQuorum ? 'bg-carried-tint text-carried' : 'bg-caution-tint text-caution-ink'
        }`}
      >
        {hasQuorum ? '✓ Quorum present' : '✗ No quorum'}
      </div>
    </div>
  );
});
