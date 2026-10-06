export interface SectionRef {
  id: string;
  versionId: string;
  parentId: string | null;
}

/**
 * Check a requested parent for a section, before creating or moving it. The parent must exist,
 * belong to the same version, and not be the section itself or one of its descendants: a cycle
 * hides the subtree from the tree and makes every walk up the ancestors loop forever.
 *
 * @returns a message describing the problem, or null when the parent is acceptable
 */
export async function findParentProblem(
  request: { versionId: string; sectionId?: string; parentId: string | null },
  findSection: (id: string) => Promise<SectionRef | null>,
): Promise<string | null> {
  if (!request.parentId) return null;

  const parent = await findSection(request.parentId);
  if (!parent) return 'Parent section not found';
  if (parent.versionId !== request.versionId) {
    return 'Parent section must be in the same version';
  }

  // Walk up from the parent; reaching the section means it would become its own ancestor
  const seen = new Set<string>();
  let current: SectionRef | null = parent;
  while (current) {
    if (current.id === request.sectionId) return 'A section cannot be its own ancestor';
    if (seen.has(current.id)) return 'Parent section is part of a cycle';
    seen.add(current.id);
    current = current.parentId ? await findSection(current.parentId) : null;
  }
  return null;
}
