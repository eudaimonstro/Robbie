import { useState } from 'react';
import type { CompletedMotion } from '@robbie-bylawyer/shared/types';

interface ReconsiderFormProps {
  completedMotions: CompletedMotion[];
  currentUserId: number;
  onSubmit: (text: string, reconsideredMotionId: number) => void;
  onCancel: () => void;
}

export function ReconsiderForm({
  completedMotions,
  currentUserId,
  onSubmit,
  onCancel,
}: ReconsiderFormProps) {
  // Filter to motions user can reconsider
  const reconsiderableMotions = completedMotions.filter((cm) => {
    if (cm.reconsidered) return false;
    const userVote = cm.voterChoices[currentUserId];
    if (!userVote || userVote === 'abstain') return false;
    const onPrevailingSide = cm.passed ? userVote === 'yea' : userVote === 'nay';
    return onPrevailingSide;
  });

  const [selectedMotionId, setSelectedMotionId] = useState<number>(
    reconsiderableMotions.length > 0 ? reconsiderableMotions[0].id : 0,
  );

  const handleSubmit = () => {
    const motion = reconsiderableMotions.find((m) => m.id === selectedMotionId);
    if (motion) {
      const text = `I move to reconsider the vote on "${motion.text}"`;
      onSubmit(text, selectedMotionId);
    }
  };

  if (reconsiderableMotions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-surface-2 border border-rule rounded-lg text-center">
          <p className="text-ink-muted">No motions available to reconsider</p>
          <p className="text-xs text-ink-muted mt-2">You must have voted on the prevailing side</p>
        </div>
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-lg border border-rule text-ink hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-gavel-tint border border-rule rounded-lg">
        <p className="text-sm font-semibold text-ink mb-1">Reconsider Motion</p>
        <p className="text-xs text-ink">Select a completed motion to bring back for a new vote.</p>
        <p className="text-xs text-ink mt-1">
          Per RONR, only voters on the prevailing side may move to reconsider.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-2">
          Select Motion to Reconsider
        </label>
        <select
          value={selectedMotionId}
          onChange={(e) => setSelectedMotionId(Number(e.target.value))}
          className="w-full p-3 border rounded-lg bg-surface"
        >
          {reconsiderableMotions.map((motion) => (
            <option key={motion.id} value={motion.id}>
              {motion.name}: "{motion.text}" ({motion.passed ? 'PASSED' : 'FAILED'})
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-lg border border-rule text-ink hover:bg-surface-2"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="flex-1 py-3 rounded-lg bg-gavel text-paper hover:bg-gavel-700 dark:hover:bg-gavel-300 font-medium"
        >
          Submit Motion
        </button>
      </div>
    </div>
  );
}
