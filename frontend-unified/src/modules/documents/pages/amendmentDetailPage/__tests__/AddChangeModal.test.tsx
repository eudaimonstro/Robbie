import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddChangeModal } from '../AmendmentModals';
import type { SectionTree } from '../../../../../api/client';

const sectionTree = [
  { id: 'a1', numberLabel: 'Article I', title: 'Name', content: '', children: [] },
] as unknown as SectionTree[];

function renderModal() {
  const onSubmit = vi.fn(async () => {});
  render(
    <AddChangeModal isOpen onClose={() => {}} onSubmit={onSubmit} sectionTree={sectionTree} />,
  );
  return onSubmit;
}

const changeType = () => screen.getByLabelText('Change Type');

describe('AddChangeModal', () => {
  it('does not carry a target chosen for another change type into an add', async () => {
    const onSubmit = renderModal();
    fireEvent.change(screen.getByLabelText('Target Section'), { target: { value: 'a1' } });
    fireEvent.change(changeType(), { target: { value: 'add' } });
    fireEvent.change(screen.getByLabelText('Section Title'), { target: { value: 'Dues' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Change' }));

    // The target of an add is its parent; a leftover target would nest the new section
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'add', targetSectionId: undefined }),
      ),
    );
  });

  it('adds under the chosen parent section', async () => {
    const onSubmit = renderModal();
    fireEvent.change(changeType(), { target: { value: 'add' } });
    fireEvent.change(screen.getByLabelText('Add Under'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Change' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ targetSectionId: 'a1' })),
    );
  });

  it('sends only the target for a delete', async () => {
    const onSubmit = renderModal();
    fireEvent.change(screen.getByLabelText('Section Title'), { target: { value: 'Typed first' } });
    fireEvent.change(changeType(), { target: { value: 'delete' } });
    fireEvent.change(screen.getByLabelText('Target Section'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Change' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ changeType: 'delete', targetSectionId: 'a1' }),
    );
  });
});
