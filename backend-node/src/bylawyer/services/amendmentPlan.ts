export interface PlannedChange {
  id: string;
  changeType: 'add' | 'modify' | 'delete' | 'renumber';
  targetSectionId: string | null;
}

export interface AmendmentPlan {
  /** Problems that stop the amendment from applying to the current version */
  conflicts: string[];
  /** Changes to leave out because an earlier change deletes their section */
  skip: Set<string>;
}

/**
 * Check an amendment's changes, in order, against the sections of the document's current
 * version before anything is written.
 *
 * A change to a section that is not in the current version (the amendment was drafted against
 * an older version, and another amendment has replaced it since) is a conflict: applying it
 * would silently do nothing, or add a section at the root. A change to a section that an
 * earlier change deletes (with its subsections) is skipped, as the preview does; adding under
 * one is a conflict, since the new section would have nowhere to go.
 */
export function planAmendment(
  sections: Array<{ id: string; parentId: string | null }>,
  changes: PlannedChange[],
): AmendmentPlan {
  const inVersion = new Set(sections.map((s) => s.id));
  const deleted = new Set<string>();
  const conflicts: string[] = [];
  const skip = new Set<string>();

  const deleteWithDescendants = (id: string) => {
    deleted.add(id);
    for (const s of sections) {
      if (s.parentId === id && !deleted.has(s.id)) deleteWithDescendants(s.id);
    }
  };

  changes.forEach((change, index) => {
    const label = `Change ${index + 1} (${change.changeType})`;
    const target = change.targetSectionId;

    if (change.changeType === 'add') {
      // For an add, the target is the parent; none means the root
      if (!target) return;
      if (!inVersion.has(target)) {
        conflicts.push(`${label} adds under a section that is not in the current version`);
      } else if (deleted.has(target)) {
        conflicts.push(`${label} adds under a section that an earlier change deletes`);
      }
      return;
    }

    if (!target) {
      conflicts.push(`${label} has no target section`);
    } else if (!inVersion.has(target)) {
      conflicts.push(`${label} targets a section that is not in the current version`);
    } else if (deleted.has(target)) {
      skip.add(change.id);
    } else if (change.changeType === 'delete') {
      deleteWithDescendants(target);
    }
  });

  return { conflicts, skip };
}
