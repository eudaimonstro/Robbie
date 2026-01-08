import React from 'react';
import { Vote } from 'lucide-react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

interface VoteResult {
  passed: boolean;
  outcome: string;
  motionText: string;
  yea: number;
  nay: number;
  timestamp: string;
}

interface VoteResultsPanelProps {
  state: MeetingState;
  voteResults: VoteResult | null;
}

export const VoteResultsPanel = React.memo(function VoteResultsPanel({
  state,
  voteResults
}: VoteResultsPanelProps) {
  if (state.votingOpen || !voteResults) {
    return null;
  }

  return (
    <section
      className={`bg-white rounded-lg p-4 shadow border-2 ${
        voteResults.passed ? 'border-green-300' : 'border-red-300'
      }`}
      aria-labelledby="vote-results-heading"
    >
      <h3
        id="vote-results-heading"
        className={`font-semibold mb-3 flex items-center gap-2 ${
          voteResults.passed ? 'text-green-700' : 'text-red-700'
        }`}
      >
        <Vote size={18} aria-hidden="true" />
        Vote Result: {voteResults.outcome}
      </h3>

      {voteResults.motionText && (
        <p className="text-gray-800 mb-3 italic">"{voteResults.motionText}"</p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-2">
        <div
          className={`${voteResults.passed ? 'bg-green-100' : 'bg-green-50'} p-3 rounded-lg text-center`}
        >
          <p className={`text-2xl font-bold ${voteResults.passed ? 'text-green-700' : 'text-green-600'}`}>
            {voteResults.yea}
          </p>
          <p className="text-green-600 text-sm">Yea</p>
        </div>
        <div
          className={`${!voteResults.passed ? 'bg-red-100' : 'bg-red-50'} p-3 rounded-lg text-center`}
        >
          <p className={`text-2xl font-bold ${!voteResults.passed ? 'text-red-700' : 'text-red-600'}`}>
            {voteResults.nay}
          </p>
          <p className="text-red-600 text-sm">Nay</p>
        </div>
      </div>

      <p className={`text-center text-sm ${voteResults.passed ? 'text-green-600' : 'text-red-600'}`}>
        {voteResults.timestamp}
      </p>
    </section>
  );
});
