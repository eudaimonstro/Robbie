import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Amendment, AmendmentPreview, PreviewSection } from '../../../../../api/client';

const api = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('../../../../../api/client', () => ({ amendments: { preview: api.preview } }));

const { AmendmentTabs } = await import('../AmendmentTabs');

function section(overrides: Partial<PreviewSection> & Pick<PreviewSection, 'id'>): PreviewSection {
  return {
    parentId: null,
    position: 0,
    numberLabel: null,
    title: null,
    content: null,
    annotation: null,
    modified: false,
    added: false,
    deleted: false,
    previous: null,
    children: [],
    ...overrides,
  };
}

const preview: AmendmentPreview = {
  amendmentId: 'a1',
  amendmentTitle: 'Lower the quorum to 15%',
  sections: [
    section({
      id: 's1',
      numberLabel: 'Article IV',
      title: 'Meetings of Members',
      children: [
        section({
          id: 's2',
          numberLabel: 'Section 4.2',
          title: 'Quorum',
          content: 'Fifteen percent of the votes is a quorum.',
          modified: true,
          previous: {
            numberLabel: 'Section 4.2',
            title: 'Quorum',
            content: 'Twenty percent of the votes is a quorum.',
          },
        }),
        section({
          id: 's3',
          numberLabel: 'Section 4.3',
          title: 'Notice',
          content: 'Notice is mailed.',
          deleted: true,
        }),
        section({
          id: 'new-c1',
          numberLabel: 'Section 4.6',
          title: 'Remote Attendance',
          content: 'Members may attend by video.',
          added: true,
        }),
      ],
    }),
  ],
};

function amendment(status: Amendment['status'], resultingVersionId: string | null = null) {
  return {
    id: 'a1',
    documentId: 'd1',
    title: 'Lower the quorum to 15%',
    description: null,
    status,
    proposedAt: null,
    decidedAt: null,
    resultingVersionId,
    createdById: null,
    createdAt: '2026-10-01T00:00:00Z',
    changes: [],
  } as Amendment;
}

function renderTabs(value: Amendment) {
  return render(
    <MemoryRouter>
      <AmendmentTabs amendment={value} changes={<p>The changes</p>} />
    </MemoryRouter>,
  );
}

describe('AmendmentTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.preview.mockResolvedValue(preview);
  });

  it("shows a draft's changes, and the document as it would read after it", async () => {
    renderTabs(amendment('draft'));
    expect(screen.getByText('The changes')).toBeTruthy();
    expect(api.preview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    const changed = await screen.findByRole('region', { name: 'Section 4.2 Quorum' });
    expect(api.preview).toHaveBeenCalledWith('a1');
    expect(within(changed).getByText('Changed')).toBeTruthy();
    expect(within(changed).getByText('Fifteen percent of the votes is a quorum.')).toBeTruthy();
    expect(within(changed).queryByText('Twenty percent of the votes is a quorum.')).toBeNull();
    fireEvent.click(within(changed).getByRole('button', { name: 'Show the old text' }));
    expect(within(changed).getByText('Twenty percent of the votes is a quorum.')).toBeTruthy();

    const removed = screen.getByRole('region', { name: 'Section 4.3 Notice' });
    expect(within(removed).getByText('Removed')).toBeTruthy();
    expect(within(removed).getByText('Notice is mailed.').closest('div')?.className).toContain(
      'line-through',
    );
    const added = screen.getByRole('region', { name: 'Section 4.6 Remote Attendance' });
    expect(within(added).getByText('Added')).toBeTruthy();
    expect(screen.queryByText('The changes')).toBeNull();
  });

  it('previews a proposed amendment too', () => {
    renderTabs(amendment('proposed'));
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeTruthy();
  });

  it('links an applied amendment to the version it produced, with no preview', () => {
    renderTabs(amendment('passed', 'v3'));
    expect(screen.queryByRole('tab')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Open the version it produced' }).getAttribute('href'),
    ).toBe('/documents/d1?version=v3');
    expect(screen.getByText('The changes')).toBeTruthy();
  });

  it("says when the preview can't be loaded", async () => {
    api.preview.mockRejectedValueOnce(new Error('HTTP 500'));
    renderTabs(amendment('draft'));
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(await screen.findByText("Couldn't load the preview.")).toBeTruthy();
  });
});
