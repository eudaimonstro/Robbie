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
  voteResults,
}: VoteResultsPanelProps) {
  if (state.votingOpen || !voteResults) {
    return null;
  }

  return (
    <section
      className={`bg-surface rounded-lg p-4 shadow border-2 ${
        voteResults.passed ? 'border-carried/40' : 'border-rule'
      }`}
      aria-labelledby="vote-results-heading"
    >
      <h3
        id="vote-results-heading"
        className={`font-semibold mb-3 flex items-center gap-2 ${
          voteResults.passed ? 'text-carried' : 'text-ink'
        }`}
      >
        <Vote size={18} aria-hidden="true" />
        Vote Result: {voteResults.outcome}
      </h3>

      {voteResults.motionText && <p className="text-ink mb-3 italic">"{voteResults.motionText}"</p>}

      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="bg-carried-tint p-3 rounded-lg text-center">
          <p className="text-2xl font-bold text-carried">{voteResults.yea}</p>
          <p className="text-carried text-sm">Yea</p>
        </div>
        <div className="bg-gavel-tint p-3 rounded-lg text-center">
          <p className="text-2xl font-bold text-gavel">{voteResults.nay}</p>
          <p className="text-ink text-sm">Nay</p>
        </div>
      </div>

      <p
        className={`text-center text-sm ${voteResults.passed ? 'text-carried' : 'text-ink-muted'}`}
      >
        {voteResults.timestamp}
      </p>
    </section>
  );
});
