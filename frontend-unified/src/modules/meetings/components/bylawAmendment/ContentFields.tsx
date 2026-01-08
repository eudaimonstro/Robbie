import React from 'react';
import type { BylawChangeType } from '../../types';

interface ContentFieldsProps {
  changeType: BylawChangeType;
  newTitle: string;
  setNewTitle: (title: string) => void;
  newContent: string;
  setNewContent: (content: string) => void;
  newNumberLabel: string;
  setNewNumberLabel: (label: string) => void;
}

export const ContentFields = React.memo(function ContentFields({
  changeType,
  newTitle,
  setNewTitle,
  newContent,
  setNewContent,
  newNumberLabel,
  setNewNumberLabel
}: ContentFieldsProps) {
  const inputClass = "w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white placeholder-secondary-400 dark:placeholder-secondary-500";
  const labelClass = "block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1";

  return (
    <>
      {/* New Number Label - for add or renumber */}
      {(changeType === 'add' || changeType === 'renumber') && (
        <div>
          <label className={labelClass}>
            {changeType === 'add' ? 'Section Number (optional)' : 'New Section Number'}
          </label>
          <input
            type="text"
            value={newNumberLabel}
            onChange={(e) => setNewNumberLabel(e.target.value)}
            placeholder={changeType === 'add' ? 'e.g., Article V, Section 3' : 'e.g., Article VI'}
            className={inputClass}
          />
        </div>
      )}

      {/* Title - for add or modify */}
      {(changeType === 'add' || changeType === 'modify') && (
        <div>
          <label className={labelClass}>
            {changeType === 'add' ? 'Section Title' : 'New Title (optional)'}
          </label>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={changeType === 'add' ? 'Enter section title...' : 'Leave blank to keep current title'}
            className={inputClass}
          />
        </div>
      )}

      {/* Content - for add or modify */}
      {(changeType === 'add' || changeType === 'modify') && (
        <div>
          <label className={labelClass}>
            {changeType === 'add' ? 'Section Content' : 'New Content'}
          </label>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Enter the section content..."
            rows={4}
            className={`${inputClass} resize-y`}
          />
        </div>
      )}
    </>
  );
});
