import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SectionTree as SectionTreeType } from '../../../../api/client';

const { default: SectionTree } = await import('../SectionTree');

const section = (
  id: string,
  numberLabel: string,
  title: string,
  children: SectionTreeType[] = [],
) =>
  ({
    id,
    numberLabel,
    title,
    content: `The text of ${numberLabel}.`,
    annotation: null,
    children,
  }) as unknown as SectionTreeType;

const tree = [
  section('a1', 'Article I', 'Name and Purpose', [section('s11', 'Section 1.1', 'Name')]),
  section('a2', 'Article II', 'Members'),
];

describe('SectionTree', () => {
  it('names each expand and collapse button by its section, and says whether it is open', () => {
    render(<SectionTree sections={tree} />);

    const toggle = screen.getByRole('button', { name: 'Collapse Article I Name and Purpose' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('The text of Section 1.1.')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expand Article I Name and Purpose');
    expect(screen.queryByText('The text of Section 1.1.')).toBeNull();
  });

  it("names a section's buttons by the section, for a secretary", () => {
    const onEditSection = vi.fn();
    render(<SectionTree sections={tree} editable onEditSection={onEditSection} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Article II Members' }));
    expect(onEditSection).toHaveBeenCalledWith(tree[1]);
    expect(screen.getByRole('button', { name: 'Delete Section 1.1 Name' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Add a section under Article I Name and Purpose' }),
    ).toBeTruthy();
  });
});
