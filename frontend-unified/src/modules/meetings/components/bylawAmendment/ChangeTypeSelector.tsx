import React from 'react';
import { Hash, Minus, Pencil, Plus } from 'lucide-react';
import type { BylawChangeType } from '../../types';

interface ChangeTypeSelectorProps {
  value: BylawChangeType;
  onChange: (type: BylawChangeType) => void;
}

const CHANGE_TYPES = [
  { value: 'add' as const, label: 'Add', Icon: Plus },
  { value: 'modify' as const, label: 'Modify', Icon: Pencil },
  { value: 'delete' as const, label: 'Delete', Icon: Minus },
  { value: 'renumber' as const, label: 'Renumber', Icon: Hash },
];

export const ChangeTypeSelector = React.memo(function ChangeTypeSelector({
  value,
  onChange,
}: ChangeTypeSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-2">Amendment Type</label>
      <div className="grid grid-cols-4 gap-2">
        {CHANGE_TYPES.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`p-3 rounded-lg border-2 text-center transition-colors ${
              value === opt.value
                ? 'border-gavel bg-gavel-tint text-ink'
                : 'border-rule text-ink-muted hover:border-ink-muted'
            }`}
          >
            <opt.Icon size={20} aria-hidden="true" className="mx-auto mb-1 block" />
            <span className="text-xs">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
