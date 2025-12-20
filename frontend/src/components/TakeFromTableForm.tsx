import { useState } from 'react';
import type { Motion } from '@robbie/shared/types';

interface TakeFromTableFormProps {
  tabledMotions: Motion[];
  onSubmit: (text: string, tabledMotionId: number) => void;
  onCancel: () => void;
}

export function TakeFromTableForm({ tabledMotions, onSubmit, onCancel }: TakeFromTableFormProps) {
  const [selectedMotionId, setSelectedMotionId] = useState<number>(
    tabledMotions.length > 0 ? tabledMotions[0].id : 0
  );

  const handleSubmit = () => {
    const motion = tabledMotions.find(m => m.id === selectedMotionId);
    if (motion) {
      const text = `I move to take from the table the motion relating to "${motion.text}"`;
      onSubmit(text, selectedMotionId);
    }
  };

  if (tabledMotions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-gray-600">No tabled motions available</p>
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
        <p className="text-sm font-semibold text-blue-900 mb-1">📋 Tabled Motions</p>
        <p className="text-xs text-blue-800">
          Select a tabled motion to bring back for consideration.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Motion to Restore
        </label>
        <select
          value={selectedMotionId}
          onChange={(e) => setSelectedMotionId(Number(e.target.value))}
          className="w-full p-3 border rounded-lg bg-white"
        >
          {tabledMotions.map((motion) => (
            <option key={motion.id} value={motion.id}>
              {motion.name}: "{motion.text}"
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
