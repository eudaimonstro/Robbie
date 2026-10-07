import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { SectionTree } from '../../../../../api/client';
import { findSection, useSectionFromHash } from '../sectionFromHash';

const node = (id: string, children: SectionTree[] = []) =>
  ({ id, numberLabel: id, title: null, content: null, children }) as unknown as SectionTree;
const tree = [node('a1', [node('s1'), node('s2', [node('s3')])]), node('a2')];

const at = (path: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

describe('findSection', () => {
  it('finds a section at any depth, or nothing', () => {
    expect(findSection(tree, 's3')?.id).toBe('s3');
    expect(findSection(tree, 'a2')?.id).toBe('a2');
    expect(findSection(tree, 'nope')).toBeNull();
  });
});

describe('useSectionFromHash', () => {
  it('selects the section the link names once the tree has it', () => {
    const select = vi.fn();
    const { rerender } = renderHook(({ sections }) => useSectionFromHash(sections, select), {
      initialProps: { sections: [] as SectionTree[] },
      wrapper: at('/documents/d1#section-s3'),
    });
    expect(select).not.toHaveBeenCalled();
    rerender({ sections: tree });
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 's3' }));

    // A reload of the tree (after an edit) leaves the reader's selection alone
    rerender({ sections: [...tree] });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a section in the link', () => {
    const select = vi.fn();
    renderHook(() => useSectionFromHash(tree, select), { wrapper: at('/documents/d1') });
    expect(select).not.toHaveBeenCalled();
  });
});
