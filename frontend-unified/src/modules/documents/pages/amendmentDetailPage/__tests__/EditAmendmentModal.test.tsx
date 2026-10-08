import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditAmendmentModal } from '../AmendmentModals';

const props = {
  onClose: () => {},
  initialTitle: 'Old title',
  initialDescription: 'Old description',
};

describe('EditAmendmentModal', () => {
  it('saves an edited title', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<EditAmendmentModal {...props} isOpen onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });
    expect(screen.getByLabelText('Title')).toHaveProperty('value', 'New title');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('New title', 'Old description'));
  });

  it('starts from the saved values each time it opens', () => {
    const { rerender } = render(
      <EditAmendmentModal {...props} isOpen onSubmit={vi.fn(async () => {})} />,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Abandoned edit' } });

    rerender(<EditAmendmentModal {...props} isOpen={false} onSubmit={vi.fn(async () => {})} />);
    rerender(<EditAmendmentModal {...props} isOpen onSubmit={vi.fn(async () => {})} />);

    expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Old title');
  });
});
