import React from 'react';
import type { FlatSection } from './useBylawAmendmentData';

interface SectionSelectorProps {
  /** The select's id, for its label */
  id: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
  sections: FlatSection[];
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export const SectionSelector = React.memo(function SectionSelector({
  id,
  label,
  value,
  onChange,
  sections,
  placeholder = 'Choose a section',
  allowEmpty = false,
  emptyLabel = 'None',
}: SectionSelectorProps) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
        {allowEmpty ? (
          <option value="">{emptyLabel}</option>
        ) : (
          <option value="">{placeholder}</option>
        )}
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {'\u00a0\u00a0'.repeat(section.depth)}
            {section.numberLabel} {section.title}
          </option>
        ))}
      </select>
    </div>
  );
});
