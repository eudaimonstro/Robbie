import React from 'react';
import type { BylawChangeType } from '../../types';

interface ChangeTypeSelectorProps {
  value: BylawChangeType;
  onChange: (type: BylawChangeType) => void;
}

const CHANGE_TYPES = [
  { value: 'add' as const, label: 'Add', icon: '+' },
  { value: 'modify' as const, label: 'Modify', icon: '✎' },
  { value: 'delete' as const, label: 'Delete', icon: '−' },
  { value: 'renumber' as const, label: 'Renumber', icon: '#' },
];

export const ChangeTypeSelector = React.memo(function ChangeTypeSelector({
  value,
  onChange,
}: ChangeTypeSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
        Amendment Type
      </label>
      <div className="grid grid-cols-4 gap-2">
        {CHANGE_TYPES.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`p-3 rounded-lg border-2 text-center transition-colors ${
              value === opt.value
                ? 'border-meeting-500 bg-meeting-50 dark:bg-meeting-900/30 text-meeting-700 dark:text-meeting-300'
                : 'border-secondary-200 dark:border-secondary-600 text-secondary-600 dark:text-secondary-400 hover:border-secondary-300 dark:hover:border-secondary-500'
            }`}
          >
            <span className="text-xl block">{opt.icon}</span>
            <span className="text-xs">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
