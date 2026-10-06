import React from 'react';
import type { FlatSection } from './useBylawAmendmentData';

interface DeletePreviewProps {
  section: FlatSection;
}

export const DeletePreview = React.memo(function DeletePreview({ section }: DeletePreviewProps) {
  return (
    <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg p-3">
      <p className="text-sm font-medium text-danger-800 dark:text-danger-300 mb-1">
        Section to be deleted:
      </p>
      <p className="text-sm text-danger-700 dark:text-danger-400">
        <strong>{section.numberLabel}</strong> {section.title}
      </p>
      {section.content && (
        <p className="text-xs text-danger-600 dark:text-danger-500 mt-1 line-clamp-2">
          {section.content}
        </p>
      )}
    </div>
  );
});
