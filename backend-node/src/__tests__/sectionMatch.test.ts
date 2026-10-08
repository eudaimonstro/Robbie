import { describe, it, expect } from 'vitest';
import { matchSections, type SectionNode } from '../bylawyer/services/sectionMatch.js';

const node = (
  id: string,
  numberLabel: string | null,
  title: string | null,
  position = 0,
  parentId: string | null = null,
): SectionNode => ({ id, parentId, position, numberLabel, title });

describe('matchSections', () => {
  it('matches by number label, in any case and spacing, then by title', () => {
    const old = [node('a', 'Section 4.2', 'Quorum'), node('b', '5', 'Officers', 1)];
    const imported = [node('x', 'section  4.2', 'Meetings'), node('y', 'Article V', 'officers', 1)];
    expect(matchSections(old, imported)).toEqual({ a: 'x', b: 'y' });
  });

  it('leaves a label or title that names more than one section on either side', () => {
    const old = [node('a', '1', 'General'), node('b', '2', 'General', 1)];
    const imported = [node('x', 'I', 'General'), node('y', 'II', 'Other', 1)];
    expect(matchSections(old, imported)).toEqual({});
  });

  it('matches an unnamed section by its position under the match of its parent', () => {
    const old = [
      node('a', 'Article I', null),
      node('a1', null, null, 0, 'a'),
      node('a2', null, null, 1, 'a'),
      node('top', null, null, 1),
    ];
    const imported = [
      node('x', 'Article I', null),
      node('x1', null, null, 0, 'x'),
      node('x2', null, 'Named now', 1, 'x'),
      node('t', null, null, 1),
    ];
    expect(matchSections(old, imported)).toEqual({ a: 'x', a1: 'x1', top: 't' });
  });

  it('leaves the children of an unmatched section unmatched by position', () => {
    const old = [node('a', 'Gone', null), node('a1', null, null, 0, 'a')];
    const imported = [node('x', 'New', null), node('x1', null, null, 0, 'x')];
    expect(matchSections(old, imported)).toEqual({});
  });
});
