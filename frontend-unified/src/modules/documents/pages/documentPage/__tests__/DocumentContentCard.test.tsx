import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function renderCard(props: {
  canEdit: boolean;
  selectedVersion: Version | null;
  isCurrentVersion?: boolean;
  onImport?: () => void;
}) {
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
      isCurrentVersion
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

  it('offers to import the bylaws into an empty document, and a new version later', () => {
    const onImport = vi.fn();
    renderCard({ canEdit: true, selectedVersion: null, onImport });
    fireEvent.click(screen.getByRole('button', { name: 'Import the bylaws' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Create First Version' })).toBeTruthy();

    cleanup();
    renderCard({ canEdit: true, selectedVersion: version, onImport });
    fireEvent.click(screen.getByRole('button', { name: 'Import a new version' }));
    expect(onImport).toHaveBeenCalledTimes(2);
  });

  it('offers a role below secretary no import', () => {
    renderCard({ canEdit: false, selectedVersion: null, onImport: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Import the bylaws' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import a new version' })).toBeNull();
  });

  it('keeps an earlier version as it was, and says so', () => {
    renderCard({ canEdit: true, selectedVersion: version, isCurrentVersion: false });
    expect(screen.queryByRole('button', { name: 'Add Section' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add First Section' })).toBeNull();
    expect(
      screen.getByText(
        'This is an earlier version, kept as it was. Only the current version can be changed.',
      ),
    ).toBeTruthy();
    // A new version still starts from the current one
    expect(screen.getByRole('button', { name: 'New Version' })).toBeTruthy();
  });
});
