import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import {
  getActiveSuspensions,
  getRuleName,
  getRuleWarning,
  generateTimestamp,
} from '@robbie-bylawyer/shared/utils';

interface ActiveSuspensionsBannerProps {
  state: MeetingState;
  currentUser?: Member;
  dispatch?: React.Dispatch<MeetingAction>;
}

export function ActiveSuspensionsBanner({
  state,
  currentUser,
  dispatch,
}: ActiveSuspensionsBannerProps) {
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
    <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4 shadow-md">
      <div className="flex items-start gap-2">
        <span className="text-2xl animate-pulse">⚠️</span>
        <div className="flex-1">
          <h3 className="font-bold text-amber-900 mb-1 text-lg">
            ⚠️ Active Rule Suspensions ({activeSuspensions.length})
          </h3>
          <p className="text-xs text-amber-800 mb-3 italic">
            Parliamentary rules currently suspended - proceed with caution
          </p>
          <div className="space-y-2">
            {activeSuspensions.map((suspension) => (
              <div
                key={suspension.id}
                className="bg-white border-2 border-amber-400 rounded p-3 text-sm shadow-sm"
              >
                <div className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
                  <span className="text-amber-600">🔓</span>
                  {getRuleName(suspension.rule)}
                  {suspension.scope === 'single-action' && (
                    <span className="ml-auto text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                      Single Action
                    </span>
                  )}
                  {suspension.scope === 'meeting-remainder' && (
                    <span className="ml-auto text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full font-medium">
                      Until Adjournment
                    </span>
                  )}
                </div>
                <div className="text-gray-700 mb-1">
                  <span className="font-medium">Purpose:</span> {suspension.purpose}
                </div>
                <div className="text-gray-700 mb-2">
                  <span className="font-medium">Allowed:</span> {suspension.specificAction}
                </div>
                <div className="bg-amber-50 border-l-4 border-amber-500 p-2 text-xs">
                  <span className="font-semibold text-amber-900">⚠️ Effect:</span>{' '}
                  <span className="text-amber-800">{getRuleWarning(suspension.rule)}</span>
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
