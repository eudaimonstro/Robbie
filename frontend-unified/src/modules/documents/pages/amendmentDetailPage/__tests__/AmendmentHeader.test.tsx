import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Amendment, Document } from '../../../../../api/client';
import { AmendmentHeader } from '../AmendmentHeader';

const doc = { id: 'd1', title: 'Bylaws' } as Document;
const amendment = (status: Amendment['status']) =>
  ({
    id: 'a1',
    documentId: 'd1',
    title: 'Lower the quorum to 15%',
    status,
    changes: [{ id: 'c1' }],
    resultingVersionId: null,
    createdById: 7,
  }) as unknown as Amendment;

function renderHeader(a: Amendment, can: { canDecide: boolean; canEditDraft: boolean }) {
  render(
    <MemoryRouter>
      <AmendmentHeader
        amendment={a}
        document={doc}
        organizationName="Maple Grove HOA"
        onEdit={vi.fn()}
        onPropose={vi.fn()}
        onWithdraw={vi.fn()}
        onPass={vi.fn()}
        onFail={vi.fn()}
        onApply={vi.fn()}
        {...can}
      />
    </MemoryRouter>,
  );
}

describe('AmendmentHeader', () => {
  it('lets a member edit their own draft but not propose or withdraw it', () => {
    renderHeader(amendment('draft'), { canDecide: false, canEditDraft: true });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Propose' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('shows a viewer no actions', () => {
    renderHeader(amendment('proposed'), { canDecide: false, canEditDraft: false });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('lets a secretary decide a proposed amendment', () => {
    renderHeader(amendment('proposed'), { canDecide: true, canEditDraft: false });
    expect(screen.getByRole('button', { name: 'Mark passed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark failed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy();
  });
});
