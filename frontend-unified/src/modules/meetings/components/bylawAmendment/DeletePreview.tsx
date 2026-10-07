import React from 'react';
import type { FlatSection } from './useBylawAmendmentData';

interface DeletePreviewProps {
  section: FlatSection;
}

export const DeletePreview = React.memo(function DeletePreview({ section }: DeletePreviewProps) {
  return (
    <div className="bg-gavel-tint border border-gavel/30 rounded-lg p-3">
      <p className="text-sm font-medium text-ink mb-1">Section to be deleted:</p>
      <p className="text-sm text-ink">
        <strong>{section.numberLabel}</strong> {section.title}
      </p>
      {section.content && (
        <p className="text-xs text-ink-muted mt-1 line-clamp-2">{section.content}</p>
      )}
    </div>
  );
});
