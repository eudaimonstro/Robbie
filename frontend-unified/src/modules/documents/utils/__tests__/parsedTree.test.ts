import { describe, it, expect } from 'vitest';
import type { ParsedSection } from '@robbie-bylawyer/shared/utils';
import { canMerge, mergeIntoPrevious, renameSection } from '../parsedTree';

function s(
  numberLabel: string | null,
  title: string | null,
  content = '',
  children: ParsedSection[] = [],
): ParsedSection {
  return { numberLabel, title, content, children };
}

const tree: ParsedSection[] = [
  s('Article I', 'Name', '', [
    s('Section 1.1', 'Name', 'The name is Maple Grove.'),
    s('Section 1.2', 'Purpose', 'Gardens.'),
  ]),
  s('Article II', 'Members', 'Each lot votes.'),
];

describe('renameSection', () => {
  it("changes one section's label or title, and leaves the tree it was given alone", () => {
    const renamed = renameSection(tree, [0, 1], { title: 'Aims' });
    expect(renamed[0].children[1]).toEqual(s('Section 1.2', 'Aims', 'Gardens.'));
    expect(tree[0].children[1].title).toBe('Purpose');
    expect(renameSection(tree, [1], { numberLabel: 'Article 2' })[1].numberLabel).toBe('Article 2');
  });

  it('takes an empty label or title as none', () => {
    expect(renameSection(tree, [1], { numberLabel: '  ' })[1].numberLabel).toBeNull();
    expect(renameSection(tree, [1], { title: '' })[1].title).toBeNull();
  });
});

describe('mergeIntoPrevious', () => {
  it('puts a section back into the text of the one before it at its level', () => {
    const merged = mergeIntoPrevious(tree, [0, 1]);
    expect(merged[0].children).toEqual([
      s('Section 1.1', 'Name', 'The name is Maple Grove.\n\nSection 1.2 Purpose\n\nGardens.'),
    ]);
  });

  it('merges a top-level section into the one before it, its subsections following', () => {
    const merged = mergeIntoPrevious(tree, [1]);
    expect(merged).toEqual([
      s('Article I', 'Name', 'Article II Members\n\nEach lot votes.', tree[0].children),
    ]);
  });

  it('merges the first at its level into its parent, keeping its subsections in place', () => {
    const nested = [
      s('Article I', 'Name', 'Intro.', [
        s('1.1', 'Odd', 'Text.', [s('1.1.1', 'Deep', 'More.')]),
        s('1.2', 'Next'),
      ]),
    ];
    expect(mergeIntoPrevious(nested, [0, 0])).toEqual([
      s('Article I', 'Name', 'Intro.\n\n1.1 Odd\n\nText.', [
        s('1.1.1', 'Deep', 'More.'),
        s('1.2', 'Next'),
      ]),
    ]);
  });

  it('leaves the very first section alone', () => {
    expect(canMerge([0])).toBe(false);
    expect(canMerge([0, 0])).toBe(true);
    expect(canMerge([1])).toBe(true);
    expect(mergeIntoPrevious(tree, [0])).toBe(tree);
  });
});
