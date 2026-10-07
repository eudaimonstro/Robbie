import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentContentCard } from '../DocumentContentCard';
import type { Version } from '../../../../../api/client';

const version: Version = {
  id: 'v1',
  documentId: 'd1',
  versionNumber: 1,
  effectiveDate: null,
  adoptedAt: null,
  notes: null,
  createdAt: '2026-10-01T00:00:00Z',
};

function renderCard(props: { canEdit: boolean; selectedVersion: Version | null }) {
  render(
    <DocumentContentCard
      sectionTree={[]}
      selectedSection={null}
      onSelectSection={vi.fn()}
      onEditSection={vi.fn()}
      onDeleteSection={vi.fn()}
      onAddChild={vi.fn()}
      onReorder={vi.fn()}
      onAddSection={vi.fn()}
      onCreateVersion={vi.fn()}
      {...props}
    />,
  );
}

describe('DocumentContentCard', () => {
  it('disables Add Section until the document has a version', () => {
    renderCard({ canEdit: true, selectedVersion: null });

    // A section needs a version to belong to; saving one without it did nothing
    expect(screen.getByRole('button', { name: 'Add Section' })).toHaveProperty('disabled', true);
  });

  it('shows a role below secretary no way to change the document', () => {
    renderCard({ canEdit: false, selectedVersion: version });

    expect(screen.queryByRole('button', { name: 'Add Section' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Version' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add First Section' })).toBeNull();
    expect(screen.getByText('This document has no sections yet.')).toBeTruthy();
  });
});
