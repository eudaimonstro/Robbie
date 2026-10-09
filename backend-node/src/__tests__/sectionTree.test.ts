import { describe, expect, it } from 'vitest';
import type { Section } from '../generated/prisma/client.js';
import {
  buildSectionTree,
  buildSharedSectionTree,
  nestSections,
} from '../bylawyer/services/sectionTree.js';

const section = (id: string, parentId: string | null, position: number): Section => ({
  id,
  versionId: 'v1',
  parentId,
  position,
  numberLabel: id.toUpperCase(),
  title: `Title ${id}`,
  content: `Content ${id}`,
  annotation: `Note on ${id}`,
});

// Out of order on purpose: the tree puts each level in position order
const sections = [
  section('b', null, 1),
  section('a2', 'a', 1),
  section('a', null, 0),
  section('a1', 'a', 0),
  section('a1x', 'a1', 0),
  section('orphan', 'gone', 0),
];

const ids = (nodes: { id: string; children: unknown[] }[]): unknown =>
  nodes.map((n) => (n.children.length ? [n.id, ids(n.children as typeof nodes)] : n.id));

describe('buildSectionTree', () => {
  it('nests sections under their parents in position order, leaving out orphans', () => {
    expect(ids(buildSectionTree(sections))).toEqual([['a', [['a1', ['a1x']], 'a2']], 'b']);
  });

  it('gives each section its fields and its annotation', () => {
    const [a] = buildSectionTree(sections);
    expect(a.children[0].children[0]).toEqual({
      id: 'a1x',
      versionId: 'v1',
      parentId: 'a1',
      position: 0,
      numberLabel: 'A1X',
      title: 'Title a1x',
      content: 'Content a1x',
      annotation: 'Note on a1x',
      children: [],
    });
  });

  it('is empty for a version without sections', () => {
    expect(buildSectionTree([])).toEqual([]);
  });
});

describe('buildSharedSectionTree', () => {
  it('leaves out every annotation, at every level', () => {
    const tree = buildSharedSectionTree(sections);
    expect(ids(tree)).toEqual(ids(buildSectionTree(sections)));
    expect(JSON.stringify(tree)).not.toContain('annotation');
    expect(JSON.stringify(tree)).not.toContain('Note on');
  });
});

describe('nestSections', () => {
  it('nests any items with an id, a parent and a position', () => {
    const tree = nestSections(
      [
        { id: 'x', parentId: null, position: 0, added: true },
        { id: 'y', parentId: 'x', position: 0, added: false },
      ],
      (item, children: { id: string; added: boolean; children: unknown[] }[]) => ({
        id: item.id,
        added: item.added,
        children,
      }),
    );
    expect(tree).toEqual([
      { id: 'x', added: true, children: [{ id: 'y', added: false, children: [] }] },
    ]);
  });
});
