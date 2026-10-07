import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

interface MotionStackPanelProps {
  state: MeetingState;
}

export const MotionStackPanel = React.memo(function MotionStackPanel({
  state,
}: MotionStackPanelProps) {
  if (state.motionStack.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface rounded-lg p-4 shadow-sm" aria-labelledby="motion-stack-heading">
      <h3 id="motion-stack-heading" className="font-semibold mb-3 text-ink">
        Motion Stack
      </h3>
      <ul className="space-y-2" role="list" aria-label="Stacked motions">
        {[...state.motionStack].reverse().map((m, i) => (
          <li
            key={m.id}
            className={`text-sm p-3 rounded-lg ${
              i === 0 ? 'bg-gavel-tint border-2 border-rule' : 'bg-surface-2'
            }`}
          >
            <div className="flex items-center gap-2">
              {i === 0 && <ChevronRight size={16} className="text-gavel" aria-hidden="true" />}
              <span className="font-medium">{m.name}</span>
            </div>
            <p className="text-ink-muted ml-6">"{m.text}"</p>
          </li>
        ))}
      </ul>
    </section>
  );
});
