/**
 * Which section of a new version is which section of the version it replaces, when the new one
 * was not copied from it (an import): the open amendments written against the old sections are
 * pointed at their matches (remapOpenAmendments).
 */

export interface SectionNode {
  id: string;
  parentId: string | null;
  position: number;
  numberLabel: string | null;
  title: string | null;
}

/** A label or title as compared: trimmed, one space between words, any case; null when empty */
const norm = (text: string | null): string | null => {
  const value = text?.trim().replace(/\s+/g, ' ').toLowerCase();
  return value ? value : null;
};

/** How many sections have each value */
function counts(sections: SectionNode[], key: (s: SectionNode) => string | null) {
  const found = new Map<string, number>();
  for (const section of sections) {
    const value = key(section);
    if (value) found.set(value, (found.get(value) ?? 0) + 1);
  }
  return found;
}

/** A section's depth in its tree: a parent is matched before its children */
function depths(sections: SectionNode[]): Map<string, number> {
  const parentOf = new Map(sections.map((s) => [s.id, s.parentId]));
  const depth = new Map<string, number>();
  const of = (id: string, seen = 0): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const parent = parentOf.get(id) ?? null;
    // A cycle can't come from a tree, but never loop on one
    const value = parent && seen < sections.length ? of(parent, seen + 1) + 1 : 0;
    depth.set(id, value);
    return value;
  };
  for (const section of sections) of(section.id);
  return depth;
}

/**
 * Match old sections to new ones (old id to new id): first by number label, then by title, each
 * only where the value names one section on both sides; then a section with neither, by its
 * position under the match of its parent (at the top, the top), when the new section there has
 * neither either. A section left unmatched is no longer in the document.
 */
export function matchSections(
  oldSections: SectionNode[],
  newSections: SectionNode[],
): Record<string, string> {
  const idMap: Record<string, string> = {};
  const taken = new Set<string>();

  const byValue = (key: (s: SectionNode) => string | null) => {
    const oldLeft = oldSections.filter((s) => !(s.id in idMap));
    const newLeft = newSections.filter((s) => !taken.has(s.id));
    const oldCounts = counts(oldLeft, key);
    const newCounts = counts(newLeft, key);
    const newOf = new Map(newLeft.map((s) => [key(s), s]));
    for (const section of oldLeft) {
      const value = key(section);
      if (!value || oldCounts.get(value) !== 1 || newCounts.get(value) !== 1) continue;
      const match = newOf.get(value)!;
      idMap[section.id] = match.id;
      taken.add(match.id);
    }
  };
  byValue((s) => norm(s.numberLabel));
  byValue((s) => norm(s.title));

  const unnamed = (s: SectionNode) => !norm(s.numberLabel) && !norm(s.title);
  const depth = depths(oldSections);
  const rest = oldSections
    .filter((s) => !(s.id in idMap) && unnamed(s))
    .sort((a, b) => depth.get(a.id)! - depth.get(b.id)!);
  for (const section of rest) {
    const parent = section.parentId ? (idMap[section.parentId] ?? undefined) : null;
    if (parent === undefined) continue;
    const match = newSections.find(
      (s) =>
        !taken.has(s.id) && s.parentId === parent && s.position === section.position && unnamed(s),
    );
    if (match) {
      idMap[section.id] = match.id;
      taken.add(match.id);
    }
  }
  return idMap;
}
