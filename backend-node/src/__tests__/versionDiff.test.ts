import { describe, it, expect } from 'vitest';
import { diffSections, type DiffSection } from '../bylawyer/services/versionDiff.js';

// Sections are copied into each version with new IDs, so the two versions share no IDs
const section = (
  id: string,
  parentId: string | null,
  numberLabel: string | null,
  title: string | null,
  content: string,
  position = 0,
): DiffSection => ({ id, parentId, numberLabel, title, content, position });

const v1 = [
  section('a1', null, 'Article I', 'Name', ''),
  section('a1s1', 'a1', 'Section 1', 'Name', 'The Old Society', 0),
  section('a2', null, 'Article II', 'Members', '', 1),
  section('a2s1', 'a2', 'Section 1', 'Eligibility', 'Anyone', 0),
  section('pre', null, null, null, 'Preamble text', 2),
];

describe('diffSections', () => {
  it('reports no changes between identical versions', () => {
    const v2 = v1.map((s) => ({
      ...s,
      id: `${s.id}-v2`,
      parentId: s.parentId && `${s.parentId}-v2`,
    }));
    expect(diffSections(v1, v2)).toEqual([]);
  });

  it('tells apart sections with the same label under different parents', () => {
    const v2 = v1.map((s) => ({
      ...s,
      id: `${s.id}-v2`,
      parentId: s.parentId && `${s.parentId}-v2`,
      content: s.id === 'a2s1' ? 'Members in good standing' : s.content,
    }));
    const changes = diffSections(v1, v2);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: 'modify',
      oldContent: 'Anyone',
      newContent: 'Members in good standing',
    });
  });

  it('reports a renumbered section as one change, not a delete and an add', () => {
    const v2 = v1.map((s) => ({
      ...s,
      id: `${s.id}-v2`,
      parentId: s.parentId && `${s.parentId}-v2`,
      numberLabel: s.id === 'a2s1' ? 'Section 2' : s.numberLabel,
    }));
    const changes = diffSections(v1, v2);
    expect(changes).toEqual([
      expect.objectContaining({
        type: 'modify',
        oldNumberLabel: 'Section 1',
        newNumberLabel: 'Section 2',
      }),
    ]);
  });

  it('reports added and deleted sections', () => {
    const v2 = [
      ...v1
        .filter((s) => s.id !== 'pre')
        .map((s) => ({ ...s, id: `${s.id}-v2`, parentId: s.parentId && `${s.parentId}-v2` })),
      section('a3', null, 'Article III', 'Officers', 'A president', 3),
    ];
    const changes = diffSections(v1, v2);
    expect(changes.map((c) => c.type).sort()).toEqual(['add', 'delete']);
  });
});
