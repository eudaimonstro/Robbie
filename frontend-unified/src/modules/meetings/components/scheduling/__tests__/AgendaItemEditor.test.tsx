import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgendaItemEditor } from '../AgendaItemEditor';
import type { AgendaItem } from '../types';

const item: AgendaItem = {
  id: 'item-1',
  title: 'Treasurer report',
  description: null,
  presenter: null,
  estimatedMinutes: null,
  position: 0,
  attachments: [],
};

function editor(shown: AgendaItem) {
  return (
    <AgendaItemEditor
      item={shown}
      index={0}
      isFirst
      isLast
      robbieCode="MAPLE1"
      organizationId="org-1"
      packetId="packet-1"
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onMoveUp={vi.fn()}
      onMoveDown={vi.fn()}
      onAttachmentAdded={vi.fn()}
      onAttachmentRemoved={vi.fn()}
    />
  );
}

describe('AgendaItemEditor', () => {
  it('keeps text being typed in one field when another field is saved', () => {
    const { rerender } = render(editor(item));
    fireEvent.click(screen.getByRole('button', { name: 'Details of Treasurer report' }));
    const description = screen.getByLabelText(/Description/);
    fireEvent.change(description, { target: { value: 'The 2026 budget' } });

    // The title's save comes back as a new item object
    rerender(editor({ ...item, title: "Treasurer's report" }));

    expect(screen.getByDisplayValue("Treasurer's report")).toBeTruthy();
    expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe(
      'The 2026 budget',
    );
  });

  it('shows a saved value that changed', () => {
    const { rerender } = render(editor(item));
    fireEvent.click(screen.getByRole('button', { name: 'Details of Treasurer report' }));

    rerender(editor({ ...item, presenter: 'Riley' }));

    expect((screen.getByLabelText(/Presenter/) as HTMLInputElement).value).toBe('Riley');
  });
});
