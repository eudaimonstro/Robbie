import React from 'react';
import { CATEGORY_INFO } from '@robbie-bylawyer/shared/constants';
import type { MotionDefinition } from '../../types';
import { HelpTooltip } from '../HelpTooltip';

interface MotionSelectorProps {
  selectedMotion: string;
  setSelectedMotion: (m: string) => void;
  selectedMotionDef: MotionDefinition | undefined;
  motionText: string;
  setMotionText: (t: string) => void;
  groupedMotions: Record<string, Array<MotionDefinition & { key: string }>>;
  onSubmit: () => void;
}

const SPECIAL_MOTIONS = [
  'amendAgenda',
  'bylawAmendment',
  'suspendRules',
  'takeFromTable',
  'reconsider',
];

export const MotionSelector = React.memo(function MotionSelector({
  selectedMotion,
  setSelectedMotion,
  selectedMotionDef,
  motionText,
  setMotionText,
  groupedMotions,
  onSubmit,
}: MotionSelectorProps) {
  const isSpecialMotion = SPECIAL_MOTIONS.includes(selectedMotion);
  const needsText = !isSpecialMotion && !motionText.trim() && !selectedMotionDef?.phrase;

  const getButtonLabel = () => {
    switch (selectedMotion) {
      case 'amendAgenda':
        return 'Configure Amendment...';
      case 'bylawAmendment':
        return 'Configure Bylaw Amendment...';
      case 'suspendRules':
        return 'Configure Suspension...';
      case 'takeFromTable':
        return 'Select Tabled Motion...';
      case 'reconsider':
        return 'Select Motion to Reconsider...';
      default:
        return 'Submit Motion';
    }
  };

  return (
    <>
      <select
        value={selectedMotion}
        onChange={(e) => setSelectedMotion(e.target.value)}
        className="w-full min-h-[48px] p-3 border border-secondary-300 dark:border-secondary-600 rounded-xl mb-3 bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white text-base"
        aria-label="Select motion type"
      >
        {Object.entries(groupedMotions).map(([cat, motions]) => (
          <optgroup
            key={cat}
            label={`${CATEGORY_INFO[cat as keyof typeof CATEGORY_INFO].label} Motions`}
          >
            {motions.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {selectedMotionDef && (
        <div className="bg-secondary-50 dark:bg-secondary-700/50 rounded-lg p-3 mb-3 text-sm">
          <div className="flex items-start gap-2">
            <HelpTooltip motion={selectedMotionDef} />
            <div>
              <p className="text-secondary-700 dark:text-secondary-300">{selectedMotionDef.help}</p>
              <p className="text-secondary-500 dark:text-secondary-400 italic mt-1">
                "{selectedMotionDef.phrase}"
              </p>
            </div>
          </div>
        </div>
      )}

      {!isSpecialMotion && (
        <div className="mb-3">
          <input
            type="text"
            placeholder={selectedMotionDef?.phrase || 'I move that...'}
            value={motionText}
            onChange={(e) => setMotionText(e.target.value.slice(0, 500))}
            maxLength={500}
            className="w-full min-h-[48px] p-3 border border-secondary-300 dark:border-secondary-600 rounded-xl bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white text-base"
            aria-label="Motion text"
            aria-describedby="motion-char-count"
          />
          <div
            id="motion-char-count"
            className="text-xs text-secondary-500 dark:text-secondary-400 text-right mt-1"
          >
            {motionText.length}/500
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={needsText}
        className="w-full min-h-[48px] bg-meeting-600 text-white py-3 rounded-xl hover:bg-meeting-700 disabled:bg-secondary-300 dark:disabled:bg-secondary-700 disabled:cursor-not-allowed font-medium touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-meeting-400 focus:ring-offset-2"
      >
        {getButtonLabel()}
      </button>
    </>
  );
});
