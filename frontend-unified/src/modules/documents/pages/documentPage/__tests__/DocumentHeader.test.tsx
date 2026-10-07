import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Document, Version } from '../../../../../api/client';

vi.mock('../../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const { DocumentHeader } = await import('../DocumentHeader');

const doc = { id: 'd1', title: 'Bylaws', docType: 'bylaws', currentVersionId: null } as Document;

const version = { id: 'v1', versionNumber: 1, effectiveDate: null } as Version;

function renderHeader(can: { canDraft: boolean; canShare: boolean }, versions: Version[] = []) {
  render(
    <MemoryRouter>
      <DocumentHeader
        doc={doc}
        versions={versions}
        selectedVersion={versions[0] ?? null}
        organizationName="Maple Grove HOA"
        onVersionChange={vi.fn()}
        onProposeAmendment={vi.fn()}
        onShare={vi.fn()}
        {...can}
      />
    </MemoryRouter>,
  );
}

describe('DocumentHeader', () => {
  it('shows a viewer neither Share nor Propose Amendment', () => {
    renderHeader({ canDraft: false, canShare: false });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Propose Amendment' })).toBeNull();
  });

  it('lets a member draft an amendment, and only an admin share', () => {
    renderHeader({ canDraft: true, canShare: false });
    expect(screen.getByRole('button', { name: 'Propose Amendment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('offers no version picker, export or compare before the first version', () => {
    renderHeader({ canDraft: true, canShare: true });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull();
    // The rest of the header is still there
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Propose Amendment' })).toBeTruthy();
  });

  it('offers the version picker, export and compare once a version exists', () => {
    renderHeader({ canDraft: false, canShare: false }, [version]);
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Version 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compare' })).toBeTruthy();
  });
});
