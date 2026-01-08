import React from 'react';
import { ChevronRight } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import { DISPLAYABLE_STAGES, isLastActiveStage } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';

interface OrderOfBusinessPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const OrderOfBusinessPanel = React.memo(function OrderOfBusinessPanel({
  state,
  dispatch
}: OrderOfBusinessPanelProps) {
  if (!state.meetingActive || state.meetingStage === 'adjourned') {
    return null;
  }

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="order-of-business-heading">
      <h3 id="order-of-business-heading" className="font-semibold mb-3 text-gray-800">
        Order of Business
      </h3>
      <div className="space-y-2" role="list" aria-label="Meeting stages">
        {DISPLAYABLE_STAGES.map((item) => {
          const isCurrent = state.meetingStage === item.stage;
          const isClickable = !isCurrent;

          return (
            <button
              key={item.stage}
              type="button"
              role="listitem"
              onClick={() => {
                if (isClickable) {
                  dispatch({ type: 'SET_MEETING_STAGE', stage: item.stage, timestamp: generateTimestamp() });
                }
              }}
              disabled={isCurrent}
              className={`w-full flex items-center justify-between p-2 rounded text-left transition-colors ${
                isCurrent
                  ? 'bg-indigo-100 border-2 border-indigo-300 cursor-default'
                  : 'bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 border-2 border-transparent cursor-pointer'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className={`flex items-center gap-2 ${
                isCurrent ? 'font-semibold text-indigo-900' : 'text-gray-600'
              }`}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </span>
              {isCurrent && (
                <ChevronRight size={18} className="text-indigo-600" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => dispatch({ type: 'ADVANCE_MEETING_STAGE', timestamp: generateTimestamp() })}
        className="w-full mt-3 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLastActiveStage(state.meetingStage)}
      >
        Proceed to Next Stage
      </button>
    </section>
  );
});
