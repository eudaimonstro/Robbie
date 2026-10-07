import React from 'react';
import type { FlatSection } from './useBylawAmendmentData';

interface SectionSelectorProps {
  label: string;
  value: string;
  onChange: (id: string) => void;
  sections: FlatSection[];
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export const SectionSelector = React.memo(function SectionSelector({
  label,
  value,
  onChange,
  sections,
  placeholder = 'Select a section...',
  allowEmpty = false,
  emptyLabel = 'None',
}: SectionSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-3 border border-rule rounded-lg bg-surface text-ink"
      >
        {allowEmpty ? (
          <option value="">{emptyLabel}</option>
        ) : (
          <option value="">{placeholder}</option>
        )}
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {'  '.repeat(section.depth)}
            {section.numberLabel} {section.title}
          </option>
        ))}
      </select>
    </div>
  );
});
