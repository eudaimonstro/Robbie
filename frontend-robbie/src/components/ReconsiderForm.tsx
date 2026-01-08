import { useState } from 'react';
import type { CompletedMotion } from '@robbie-bylawyer/shared/types';

interface ReconsiderFormProps {
  completedMotions: CompletedMotion[];
  currentUserId: number;
  onSubmit: (text: string, reconsideredMotionId: number) => void;
  onCancel: () => void;
}

export function ReconsiderForm({ completedMotions, currentUserId, onSubmit, onCancel }: ReconsiderFormProps) {
  // Filter to motions user can reconsider
  const reconsiderableMotions = completedMotions.filter(cm => {
    if (cm.reconsidered) return false;
    const userVote = cm.voterChoices[currentUserId];
    if (!userVote || userVote === 'abstain') return false;
    const onPrevailingSide = cm.passed ? (userVote === 'yea') : (userVote === 'nay');
    return onPrevailingSide;
  });

  const [selectedMotionId, setSelectedMotionId] = useState<number>(
    reconsiderableMotions.length > 0 ? reconsiderableMotions[0].id : 0
  );

  const handleSubmit = () => {
    const motion = reconsiderableMotions.find(m => m.id === selectedMotionId);
    if (motion) {
      const text = `I move to reconsider the vote on "${motion.text}"`;
      onSubmit(text, selectedMotionId);
    }
  };

  if (reconsiderableMotions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-gray-600">No motions available to reconsider</p>
          <p className="text-xs text-gray-500 mt-2">You must have voted on the prevailing side</p>
        </div>
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-semibold text-blue-900 mb-1">🔄 Reconsider Motion</p>
        <p className="text-xs text-blue-800">
          Select a completed motion to bring back for a new vote.
        </p>
        <p className="text-xs text-blue-700 mt-1">
          Per RONR, only voters on the prevailing side may move to reconsider.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Motion to Reconsider
        </label>
        <select
          value={selectedMotionId}
          onChange={(e) => setSelectedMotionId(Number(e.target.value))}
          className="w-full p-3 border rounded-lg bg-white"
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
          className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="flex-1 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
        >
          Submit Motion
        </button>
      </div>
    </div>
  );
}
