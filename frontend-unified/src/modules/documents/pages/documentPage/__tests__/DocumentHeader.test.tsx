import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Document } from '../../../../../api/client';

vi.mock('../../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const { DocumentHeader } = await import('../DocumentHeader');

const doc = { id: 'd1', title: 'Bylaws', docType: 'bylaws', currentVersionId: null } as Document;

function renderHeader(can: { canDraft: boolean; canShare: boolean }) {
  render(
    <MemoryRouter>
      <DocumentHeader
        doc={doc}
        versions={[]}
        selectedVersion={null}
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
});
