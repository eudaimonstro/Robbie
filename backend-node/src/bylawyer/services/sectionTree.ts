import type { SectionNode, SharedSectionNode } from '@robbie-bylawyer/shared/types';
import type { Section } from '../../generated/prisma/client.js';

/** What a flat list needs to be nested: each item's id, its parent's and its place among them */
interface Nestable {
  id: string;
  parentId: string | null;
  position: number;
}

/**
 * Nest a flat list of sections under their parents, each level in position order, from the top
 * (parentId null). An item whose parent isn't in the list is left out. The children are grouped
 * once, so a version of 2,000 sections takes one pass, not one per section.
 */
export function nestSections<T extends Nestable, N>(
  items: readonly T[],
  toNode: (item: T, children: N[]) => N,
): N[] {
  const byParent = new Map<string | null, T[]>();
  for (const item of items) {
    const siblings = byParent.get(item.parentId);
    if (siblings) siblings.push(item);
    else byParent.set(item.parentId, [item]);
  }
  const level = (parentId: string | null): N[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => toNode(item, level(item.id)));
  return level(null);
}

/** The fields of a section every tree shows */
function sectionFields(section: Section) {
  return {
    id: section.id,
    versionId: section.versionId,
    parentId: section.parentId,
    position: section.position,
    numberLabel: section.numberLabel,
    title: section.title,
    content: section.content,
  };
}

/** A version's sections as a tree, with their annotations, for the organization's members */
export function buildSectionTree(sections: readonly Section[]): SectionNode[] {
  return nestSections<Section, SectionNode>(sections, (section, children) => ({
    ...sectionFields(section),
    annotation: section.annotation,
    children,
  }));
}

/**
 * A version's sections as a tree for a share link: annotations are the organization's own
 * commentary, so the public never sees them
 */
export function buildSharedSectionTree(sections: readonly Section[]): SharedSectionNode[] {
  return nestSections<Section, SharedSectionNode>(sections, (section, children) => ({
    ...sectionFields(section),
    children,
  }));
}
