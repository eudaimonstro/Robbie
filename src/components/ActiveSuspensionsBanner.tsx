import type { MeetingState, MeetingAction, Member } from '../types';
import { getActiveSuspensions, getRuleName } from '../utils/ruleSuspensionHelper';
import { generateTimestamp } from '../utils/idGenerators';

interface ActiveSuspensionsBannerProps {
  state: MeetingState;
  currentUser?: Member;
  dispatch?: React.Dispatch<MeetingAction>;
}

export function ActiveSuspensionsBanner({ state, currentUser, dispatch }: ActiveSuspensionsBannerProps) {
  const activeSuspensions = getActiveSuspensions(state);
  const isChair = currentUser?.role === 'chair';

  if (activeSuspensions.length === 0) {
    return null;
  }

  const handleRestore = (suspensionId: number) => {
    if (dispatch) {
      dispatch({ type: 'RESTORE_RULE', suspensionId, timestamp: generateTimestamp() });
    }
  };

  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-2">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1">
          <h3 className="font-bold text-amber-900 mb-2">
            Active Rule Suspensions
          </h3>
          <div className="space-y-2">
            {activeSuspensions.map((suspension) => (
              <div
                key={suspension.id}
                className="bg-white border border-amber-300 rounded p-3 text-sm"
              >
                <div className="font-semibold text-amber-900 mb-1">
                  {getRuleName(suspension.rule)}
                  {suspension.scope === 'single-action' && (
                    <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
                      Single Action
                    </span>
                  )}
                  {suspension.scope === 'meeting-remainder' && (
                    <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
                      Until Adjournment
                    </span>
                  )}
                </div>
                <div className="text-gray-700">
                  <span className="font-medium">Purpose:</span> {suspension.purpose}
                </div>
                <div className="text-gray-700">
                  <span className="font-medium">Allowed:</span> {suspension.specificAction}
                </div>
                {isChair && dispatch && (
                  <button
                    onClick={() => handleRestore(suspension.id)}
                    className="mt-2 text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors"
                  >
                    Restore Rule
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
