import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SectionEditor from '../SectionEditor';
import type { SectionTree } from '../../../../api/client';

const section = {
  id: 's1',
  numberLabel: 'Section 1',
  title: 'Name',
  content: 'The name is the Society.',
  annotation: 'Adopted 2020',
  children: [],
} as unknown as SectionTree;

describe('SectionEditor', () => {
  it('clears a field the user empties', async () => {
    const onSave = vi.fn(async () => {});
    render(
      <SectionEditor isOpen onClose={() => {}} onSave={onSave} section={section} mode="edit" />,
    );

    fireEvent.change(screen.getByDisplayValue('Adopted 2020'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // Omitting the field would leave the old annotation in place
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ annotation: null })),
    );
  });
});
