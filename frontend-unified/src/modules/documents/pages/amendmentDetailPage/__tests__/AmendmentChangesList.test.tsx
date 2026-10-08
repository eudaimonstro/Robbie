import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AmendmentChange, SectionTree } from '../../../../../api/client';
import { AmendmentChangesList } from '../AmendmentChangesList';

const tree = [
  { id: 's1', numberLabel: '1', title: 'Name', content: '', children: [] },
] as unknown as SectionTree[];

const change = (targetSectionId: string, targetLabel: string | null): AmendmentChange =>
  ({
    id: `c-${targetSectionId}`,
    amendmentId: 'a1',
    changeType: 'modify',
    targetSectionId,
    targetLabel,
    newContent: 'New text.',
    newNumberLabel: null,
    newTitle: null,
    position: 0,
  }) as AmendmentChange;

describe('AmendmentChangesList', () => {
  it("says which of an open amendment's sections are no longer in the bylaws", () => {
    render(
      <AmendmentChangesList
        changes={[change('s1', null), change('gone', '9 "Gone"')]}
        sectionTree={tree}
        canEdit
        open
        onAddChange={vi.fn()}
        onDeleteChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /9 "Gone" is no longer in the bylaws, so this change can't apply as written\. Delete it and add it again/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText(/no longer in the bylaws/)).toHaveLength(1);
  });

  it("says nothing of a decided amendment's sections", () => {
    render(
      <AmendmentChangesList
        changes={[change('gone', '9 "Gone"')]}
        sectionTree={tree}
        canEdit={false}
        onAddChange={vi.fn()}
        onDeleteChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no longer in the bylaws/)).toBeNull();
  });
});
