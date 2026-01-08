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
  emptyLabel = 'None'
}: SectionSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
      >
        {allowEmpty ? (
          <option value="">{emptyLabel}</option>
        ) : (
          <option value="">{placeholder}</option>
        )}
        {sections.map(section => (
          <option key={section.id} value={section.id}>
            {'  '.repeat(section.depth)}{section.number_label} {section.title}
          </option>
        ))}
      </select>
    </div>
  );
});
