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
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-secondary-800 dark:text-white">
        <Settings size={18} /> Meeting Settings
      </h3>
      <div className="mb-3">
        <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
          Quorum Requirement
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            value={quorumValue}
            onChange={(e) => setQuorumValue(Math.max(1, parseInt(e.target.value) || 1))}
            className="flex-1 p-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
          />
          <button
            onClick={() =>
              dispatch({ type: 'SET_QUORUM', quorum: quorumValue, timestamp: generateTimestamp() })
            }
            disabled={quorumValue === currentQuorum}
            className="bg-meeting-600 text-white px-4 rounded-lg text-sm hover:bg-meeting-700 disabled:bg-secondary-300 dark:disabled:bg-secondary-600 disabled:cursor-not-allowed"
          >
            Set
          </button>
        </div>
        <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">
          Minimum members required for quorum
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
          <p className="text-secondary-500 dark:text-secondary-400 text-sm">Required</p>
          <p className="font-semibold text-lg text-secondary-900 dark:text-white">
            {currentQuorum}
          </p>
        </div>
        <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
          <p className="text-secondary-500 dark:text-secondary-400 text-sm">Present</p>
          <p className="font-semibold text-lg text-secondary-900 dark:text-white">
            {presentCount} / {totalMembers}
          </p>
        </div>
      </div>
      <div
        className={`mt-3 p-3 rounded-lg ${
          hasQuorum
            ? 'bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300'
            : 'bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300'
        }`}
      >
        {hasQuorum ? '✓ Quorum present' : '✗ No quorum'}
      </div>
    </div>
  );
});
