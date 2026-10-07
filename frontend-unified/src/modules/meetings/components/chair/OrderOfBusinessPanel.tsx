import React from 'react';
import {
  Bell,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  FileText,
  Megaphone,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import { DISPLAYABLE_STAGES, isLastActiveStage } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, MeetingAction, MeetingStage } from '@robbie-bylawyer/shared/types';

/** Each stage's icon (lucide, never emoji: docs/design-brief.md) */
const STAGE_ICONS: Partial<Record<MeetingStage, LucideIcon>> = {
  'call-to-order': Bell,
  'minutes-approval': FileText,
  reports: ChartColumn,
  'special-orders': Star,
  'unfinished-business': ClipboardList,
  'new-business': Sparkles,
  announcements: Megaphone,
};

/** A stage's name in sentence case, as labels are written here: "Approval of minutes" */
function sentenceCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

interface OrderOfBusinessPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const OrderOfBusinessPanel = React.memo(function OrderOfBusinessPanel({
  state,
  dispatch,
}: OrderOfBusinessPanelProps) {
  if (!state.meetingActive || state.meetingStage === 'adjourned') {
    return null;
  }

  return (
    <section className="card p-4" aria-labelledby="order-of-business-heading">
      <h3 id="order-of-business-heading" className="label-caps mb-3">
        Order of business
      </h3>
      <div className="space-y-2" role="list" aria-label="Meeting stages">
        {DISPLAYABLE_STAGES.map((item) => {
          const isCurrent = state.meetingStage === item.stage;
          const isClickable = !isCurrent;
          const Icon = STAGE_ICONS[item.stage];

          return (
            <button
              key={item.stage}
              type="button"
              role="listitem"
              onClick={() => {
                if (isClickable) {
                  dispatch({
                    type: 'SET_MEETING_STAGE',
                    stage: item.stage,
                    timestamp: generateTimestamp(),
                  });
                }
              }}
              disabled={isCurrent}
              className={`w-full flex items-center justify-between p-2 rounded text-left transition-colors ${
                isCurrent
                  ? 'bg-gavel-tint border-2 border-gavel/30 cursor-default'
                  : 'bg-surface-2 hover:bg-gavel-tint hover:border-gavel/30 border-2 border-transparent cursor-pointer'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={`flex items-center gap-2 ${
                  isCurrent ? 'font-semibold text-ink' : 'text-ink-muted'
                }`}
              >
                {Icon && <Icon size={16} aria-hidden="true" />}
                {sentenceCase(item.label)}
              </span>
              {isCurrent && <ChevronRight size={18} className="text-gavel" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => dispatch({ type: 'ADVANCE_MEETING_STAGE', timestamp: generateTimestamp() })}
        className="w-full mt-3 bg-gavel text-paper py-2 rounded-lg hover:bg-gavel-700 dark:hover:bg-gavel-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLastActiveStage(state.meetingStage)}
      >
        Proceed to the next stage
      </button>
    </section>
  );
});
