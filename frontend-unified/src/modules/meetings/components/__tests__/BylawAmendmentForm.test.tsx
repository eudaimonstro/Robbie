import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const QUORUM =
  'The presence of members holding twenty percent (20%) of the votes constitutes a quorum.';
const FIFTEEN =
  'The presence of members holding fifteen percent (15%) of the votes constitutes a quorum.';

const api = vi.hoisted(() => ({
  organization: vi.fn(),
  documents: vi.fn(),
  sections: vi.fn(),
  amendments: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({
  bylawSync: {
    getMeetingOrganization: api.organization,
    getOrganizationDocuments: api.documents,
    getDocumentSections: api.sections,
  },
  amendments: { list: api.amendments },
}));
const toast = vi.hoisted(() => ({ showToast: () => {} }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { BylawAmendmentForm } = await import('../BylawAmendmentForm');

const section = (id: string, numberLabel: string, title: string, content: string | null) => ({
  id,
  versionId: 'v1',
  parentId: null,
  position: 0,
  numberLabel,
  title,
  content,
  annotation: null,
  children: [],
});

const change = (overrides = {}) => ({
  id: 'c1',
  amendmentId: 'a1',
  changeType: 'modify',
  targetSectionId: 's42',
  newContent: FIFTEEN,
  newNumberLabel: null,
  newTitle: null,
  position: 0,
  ...overrides,
});

const amendment = (id: string, title: string, status: string, changes: unknown[]) => ({
  id,
  documentId: 'doc',
  title,
  description: null,
  status,
  proposedAt: null,
  decidedAt: null,
  resultingVersionId: null,
  createdById: null,
  createdAt: '',
  changes,
});

describe('BylawAmendmentForm', () => {
  beforeEach(() => {
    api.organization.mockResolvedValue({
      linked: true,
      organization: { id: 'org', name: 'Maple Grove HOA' },
    });
    api.documents.mockResolvedValue([{ id: 'doc', title: 'Bylaws' }]);
    api.sections.mockResolvedValue([
      {
        ...section('a4', 'Article IV', 'Meetings', null),
        children: [section('s42', 'Section 4.2', 'Quorum', QUORUM)],
      },
    ]);
    api.amendments.mockResolvedValue([
      amendment('a1', 'Lower the quorum to 15%', 'proposed', [change()]),
      amendment('a2', 'Rewrite Article IV', 'proposed', [change(), change({ id: 'c2' })]),
      amendment('a3', 'A draft', 'draft', [change()]),
      amendment('a4', 'Written against an old version', 'proposed', [
        change({ targetSectionId: 'gone' }),
      ]),
    ]);
  });

  it('moves a proposed amendment as drafted, showing its text', async () => {
    const onSubmit = vi.fn();
    render(<BylawAmendmentForm meetingCode="MAPLE1" onSubmit={onSubmit} onCancel={() => {}} />);
    const proposed = await screen.findByRole('group', { name: 'Proposed amendments' });
    // Drafts aren't listed; one with two changes can't be moved yet
    expect(within(proposed).queryByText('A draft')).toBeNull();
    expect(within(proposed).getByRole('radio', { name: /Rewrite Article IV/ })).toHaveProperty(
      'disabled',
      true,
    );
    const old = within(proposed).getByRole('radio', { name: /Written against an old version/ });
    expect(old).toHaveProperty('disabled', true);
    expect(within(proposed).getByText("Its section isn't in the current bylaws")).toBeTruthy();
    fireEvent.click(within(proposed).getByRole('radio', { name: /Lower the quorum/ }));

    const text = screen.getByRole('region', { name: 'The text' });
    expect(text.textContent).toContain('Section 4.2 "Quorum"');
    expect(text.textContent).toContain(QUORUM);
    expect(text.textContent).toContain(FIFTEEN);
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(onSubmit).toHaveBeenCalledWith(
      'I move to amend the bylaws by modifying Section 4.2 "Quorum", as proposed in "Lower the quorum to 15%"',
      { documentId: 'doc', amendmentId: 'a1', changeType: 'modify' },
    );
  });

  it('starts a written change from the section as it reads now', async () => {
    const onSubmit = vi.fn();
    render(<BylawAmendmentForm meetingCode="MAPLE1" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Write a change' }));
    expect(screen.getByLabelText('Document')).toBeTruthy();
    await screen.findByLabelText('Section');
    const move = screen.getByRole('button', { name: 'Move' });
    expect(move).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 's42' } });
    expect(screen.getByText('Now reads')).toBeTruthy();
    const wording = screen.getByLabelText('New wording') as HTMLTextAreaElement;
    expect(wording.value).toBe(QUORUM);
    // Unchanged, there is nothing to move
    expect(move).toHaveProperty('disabled', true);

    // Near the limit, it says how much room is left
    fireEvent.change(wording, { target: { value: 'x'.repeat(9500) } });
    expect(screen.getByText('500 characters left of 10,000')).toBeTruthy();
    fireEvent.change(wording, { target: { value: FIFTEEN } });
    expect(screen.queryByText(/characters left/)).toBeNull();
    fireEvent.click(move);
    expect(onSubmit).toHaveBeenCalledWith(
      'I move to amend the bylaws by modifying Section 4.2 "Quorum"',
      { documentId: 'doc', changeType: 'modify', targetSectionId: 's42', newContent: FIFTEEN },
    );
  });

  it('adds a section under the one chosen', async () => {
    const onSubmit = vi.fn();
    render(<BylawAmendmentForm meetingCode="MAPLE1" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Write a change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Goes under'), { target: { value: 'a4' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Remote attendance' } });
    fireEvent.change(screen.getByLabelText('New wording'), {
      target: { value: 'Members may attend by video.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(onSubmit).toHaveBeenCalledWith(
      'I move to amend the bylaws by adding a new section under Article IV "Meetings": "Remote attendance"',
      {
        documentId: 'doc',
        changeType: 'add',
        parentSectionId: 'a4',
        newTitle: 'Remote attendance',
        newContent: 'Members may attend by video.',
      },
    );
  });

  it('writes a change when nothing is proposed', async () => {
    api.amendments.mockResolvedValue([]);
    render(<BylawAmendmentForm meetingCode="MAPLE1" onSubmit={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Section')).toBeTruthy());
    expect(screen.getByRole('radio', { name: 'Write a change' })).toHaveProperty('checked', true);
  });
});
