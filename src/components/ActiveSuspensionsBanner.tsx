import type { MeetingState } from '../types';
import { getActiveSuspensions, getRuleName } from '../utils/ruleSuspensionHelper';

interface ActiveSuspensionsBannerProps {
  state: MeetingState;
}

export function ActiveSuspensionsBanner({ state }: ActiveSuspensionsBannerProps) {
  const activeSuspensions = getActiveSuspensions(state);

  if (activeSuspensions.length === 0) {
    return null;
  }

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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
