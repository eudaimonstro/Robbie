import { describe, it, expect } from 'vitest';
import type { BylawAmendment } from '../../types/index.js';
import { bylawChangeView, bylawMotionText, sectionLabel } from '../../utils/bylawAmendment.js';

const QUORUM = 'Section 4.2 "Quorum"';
const modify: BylawAmendment = {
  documentId: 'doc',
  documentTitle: 'Bylaws of Maple Grove',
  changeType: 'modify',
  targetSectionId: 's42',
  targetSectionLabel: QUORUM,
  currentTitle: 'Quorum',
  currentContent: 'Twenty percent of the votes is a quorum.',
  newContent: 'Fifteen percent of the votes is a quorum.',
};

describe('sectionLabel', () => {
  it('gives the number and the title', () => {
    expect(sectionLabel({ numberLabel: 'Section 4.2', title: 'Quorum' })).toBe(QUORUM);
    expect(sectionLabel({ numberLabel: 'Article IV', title: null })).toBe('Article IV');
    expect(sectionLabel({ numberLabel: null, title: 'Preamble' })).toBe('"Preamble"');
    expect(sectionLabel({ numberLabel: null, title: null })).toBe('an untitled section');
  });
});

describe('bylawMotionText', () => {
  it('says what each kind of change does, to which section', () => {
    expect(bylawMotionText(modify)).toBe(
      'I move to amend the bylaws by modifying Section 4.2 "Quorum"',
    );
    expect(bylawMotionText({ ...modify, changeType: 'delete', newContent: undefined })).toBe(
      'I move to amend the bylaws by deleting Section 4.2 "Quorum"',
    );
    expect(bylawMotionText({ ...modify, changeType: 'renumber', newNumberLabel: '4.3' })).toBe(
      'I move to amend the bylaws by renumbering Section 4.2 "Quorum" as 4.3',
    );
    expect(
      bylawMotionText({
        documentId: 'doc',
        changeType: 'add',
        parentSectionLabel: 'Article IV "Meetings"',
        newTitle: 'Remote attendance',
        newContent: 'Members may attend by video.',
      }),
    ).toBe(
      'I move to amend the bylaws by adding a new section under Article IV "Meetings": "Remote attendance"',
    );
    expect(
      bylawMotionText({ documentId: 'doc', changeType: 'add', newTitle: 'Remote attendance' }),
    ).toBe('I move to amend the bylaws by adding a new section: "Remote attendance"');
  });

  it('names the proposed amendment it moves', () => {
    expect(bylawMotionText({ ...modify, amendmentTitle: 'Lower the quorum to 15%' })).toBe(
      'I move to amend the bylaws by modifying Section 4.2 "Quorum", as proposed in "Lower the quorum to 15%"',
    );
  });

  it("stays within a motion's length", () => {
    const long = 'x'.repeat(400);
    const text = bylawMotionText({ ...modify, targetSectionLabel: long, amendmentTitle: long });
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('bylawChangeView', () => {
  it('shows a modified section as it reads now and as it would read', () => {
    expect(bylawChangeView(modify)).toEqual({
      heading: QUORUM,
      action: 'To read',
      current: { title: 'Quorum', text: 'Twenty percent of the votes is a quorum.' },
      proposed: { title: 'Quorum', text: 'Fifteen percent of the votes is a quorum.' },
    });
    // A new title, with the text kept
    expect(
      bylawChangeView({ ...modify, newTitle: 'Quorum of members', newContent: undefined }),
    ).toMatchObject({
      proposed: { title: 'Quorum of members', text: 'Twenty percent of the votes is a quorum.' },
    });
  });

  it('shows an added section, where it goes, and its text', () => {
    expect(
      bylawChangeView({
        documentId: 'doc',
        changeType: 'add',
        parentSectionLabel: 'Article IV "Meetings"',
        newNumberLabel: 'Section 4.7',
        newTitle: 'Remote attendance',
        newContent: 'Members may attend by video.',
      }),
    ).toEqual({
      heading: 'A new section under Article IV "Meetings"',
      action: 'To add',
      current: null,
      proposed: { title: 'Section 4.7 Remote attendance', text: 'Members may attend by video.' },
    });
    expect(bylawChangeView({ documentId: 'doc', changeType: 'add', newTitle: 'T' }).heading).toBe(
      'A new section at the top level',
    );
  });

  it('shows a deleted section as it reads now', () => {
    expect(bylawChangeView({ ...modify, changeType: 'delete', newContent: undefined })).toEqual({
      heading: QUORUM,
      action: 'To strike out',
      current: { title: 'Quorum', text: 'Twenty percent of the votes is a quorum.' },
      proposed: null,
    });
  });

  it('shows a renumbered section by its new number', () => {
    expect(
      bylawChangeView({ ...modify, changeType: 'renumber', newNumberLabel: 'Section 4.3' }),
    ).toEqual({
      heading: QUORUM,
      action: 'To renumber as Section 4.3',
      current: null,
      proposed: null,
    });
  });
});
