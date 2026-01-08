import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

interface MotionStackPanelProps {
  state: MeetingState;
}

export const MotionStackPanel = React.memo(function MotionStackPanel({
  state
}: MotionStackPanelProps) {
  if (state.motionStack.length === 0) {
    return null;
  }

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="motion-stack-heading">
      <h3 id="motion-stack-heading" className="font-semibold mb-3 text-gray-800">
        Motion Stack
      </h3>
      <ul className="space-y-2" role="list" aria-label="Stacked motions">
        {[...state.motionStack].reverse().map((m, i) => (
          <li
            key={m.id}
            className={`text-sm p-3 rounded-lg ${
              i === 0 ? 'bg-indigo-100 border-2 border-indigo-300' : 'bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              {i === 0 && <ChevronRight size={16} className="text-indigo-600" aria-hidden="true" />}
              <span className="font-medium">{m.name}</span>
            </div>
            <p className="text-gray-600 ml-6">"{m.text}"</p>
          </li>
        ))}
      </ul>
    </section>
  );
});
