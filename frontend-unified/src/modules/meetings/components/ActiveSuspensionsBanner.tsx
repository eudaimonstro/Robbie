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
  // Chairs and admins may restore a rule (the server permits both)
  const canRestore = currentUser?.role === 'chair' || currentUser?.role === 'admin';

  if (activeSuspensions.length === 0) {
    return null;
  }

  const handleRestore = (suspensionId: number) => {
    if (dispatch) {
      dispatch({ type: 'RESTORE_RULE', suspensionId, timestamp: generateTimestamp() });
    }
  };

  return (
    <div className="bg-caution-tint border-2 border-caution rounded-lg p-4 mb-4 shadow-md">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h3 className="font-bold text-ink mb-1 text-lg">
            Active Rule Suspensions ({activeSuspensions.length})
          </h3>
          <p className="text-xs text-ink mb-3 italic">
            Parliamentary rules currently suspended - proceed with caution
          </p>
          <div className="space-y-2">
            {activeSuspensions.map((suspension) => (
              <div
                key={suspension.id}
                className="bg-surface border-2 border-caution rounded-sm p-3 text-sm shadow-xs"
              >
                <div className="font-semibold text-ink mb-1 flex items-center gap-2">
                  {getRuleName(suspension.rule)}
                  {suspension.scope === 'single-action' && (
                    <span className="ml-auto text-xs bg-gavel-tint text-ink px-2 py-1 rounded-full font-medium">
                      Single Action
                    </span>
                  )}
                  {suspension.scope === 'meeting-remainder' && (
                    <span className="ml-auto text-xs bg-caution-tint text-ink px-2 py-1 rounded-full font-medium">
                      Until Adjournment
                    </span>
                  )}
                </div>
                <div className="text-ink mb-1">
                  <span className="font-medium">Purpose:</span> {suspension.purpose}
                </div>
                <div className="text-ink mb-2">
                  <span className="font-medium">Allowed:</span> {suspension.specificAction}
                </div>
                <div className="bg-caution-tint border-l-4 border-caution p-2 text-xs">
                  <span className="font-semibold text-ink">Effect:</span>{' '}
                  <span className="text-ink">{getRuleWarning(suspension.rule)}</span>
                </div>
                {canRestore && dispatch && (
                  <button
                    onClick={() => handleRestore(suspension.id)}
                    className="mt-2 text-xs bg-ink text-paper px-3 py-1 rounded-sm hover:bg-ink/90 transition-colors"
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
