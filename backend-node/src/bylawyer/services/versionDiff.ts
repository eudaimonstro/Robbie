export interface DiffSection {
  id: string;
  parentId: string | null;
  position: number;
  numberLabel: string | null;
  title: string | null;
  content: string | null;
}

export interface SectionChange {
  type: 'add' | 'delete' | 'modify';
  sectionId: string;
  oldNumberLabel?: string | null;
  newNumberLabel?: string | null;
  oldTitle?: string | null;
  newTitle?: string | null;
  oldContent?: string | null;
  newContent?: string | null;
}

/**
 * Compare the sections of two versions. Each version has its own copy of every section (with
 * new IDs), so sections are matched by where they sit:
 * 1. by path: the labels of the section and its ancestors (the title where there is no label),
 *    so "Section 1" under Article I is not confused with "Section 1" under Article II;
 * 2. then, under the same parent, by title, so a renumbered section is one change rather than
 *    a deletion and an addition.
 * Sections left over were added or deleted.
 */
export function diffSections(
  oldSections: readonly DiffSection[],
  newSections: readonly DiffSection[],
): SectionChange[] {
  const oldMatches = matchSections(oldSections, newSections);
  const changes: SectionChange[] = [];

  for (const [oldSection, newSection] of oldMatches) {
    if (
      oldSection.content !== newSection.content ||
      oldSection.title !== newSection.title ||
      oldSection.numberLabel !== newSection.numberLabel
    ) {
      changes.push({
        type: 'modify',
        sectionId: newSection.id,
        oldNumberLabel: oldSection.numberLabel,
        newNumberLabel: newSection.numberLabel,
        oldTitle: oldSection.title,
        newTitle: newSection.title,
        oldContent: oldSection.content,
        newContent: newSection.content,
      });
    }
  }

  const matchedOld = new Set([...oldMatches.keys()].map((s) => s.id));
  const matchedNew = new Set([...oldMatches.values()].map((s) => s.id));
  for (const s of oldSections) {
    if (!matchedOld.has(s.id)) {
      changes.push({
        type: 'delete',
        sectionId: s.id,
        oldNumberLabel: s.numberLabel,
        oldTitle: s.title,
        oldContent: s.content,
      });
    }
  }
  for (const s of newSections) {
    if (!matchedNew.has(s.id)) {
      changes.push({
        type: 'add',
        sectionId: s.id,
        newNumberLabel: s.numberLabel,
        newTitle: s.title,
        newContent: s.content,
      });
    }
  }
  return changes;
}

function matchSections(
  oldSections: readonly DiffSection[],
  newSections: readonly DiffSection[],
): Map<DiffSection, DiffSection> {
  const matches = new Map<DiffSection, DiffSection>();
  const taken = new Set<string>();
  const oldPaths = pathsOf(oldSections);
  const newPaths = pathsOf(newSections);

  // Pair sections sharing a key, in position order (so duplicates pair up one to one)
  const pairBy = (key: (s: DiffSection, paths: Map<string, string>) => string | null) => {
    const waiting = new Map<string, DiffSection[]>();
    for (const s of [...newSections].sort((a, b) => a.position - b.position)) {
      const k = key(s, newPaths);
      if (k === null || taken.has(s.id)) continue;
      waiting.set(k, [...(waiting.get(k) ?? []), s]);
    }
    for (const s of [...oldSections].sort((a, b) => a.position - b.position)) {
      if (matches.has(s)) continue;
      const k = key(s, oldPaths);
      const candidate = k === null ? undefined : waiting.get(k)?.shift();
      if (candidate) {
        matches.set(s, candidate);
        taken.add(candidate.id);
      }
    }
  };

  pairBy((s, paths) => paths.get(s.id) ?? null);
  pairBy((s, paths) =>
    s.title ? `${s.parentId ? paths.get(s.parentId) : ''}\u0000${s.title}` : null,
  );
  return matches;
}

/** Each section's path: its ancestors' names and its own, where a name is the label or title */
function pathsOf(sections: readonly DiffSection[]): Map<string, string> {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const paths = new Map<string, string>();
  const pathOf = (s: DiffSection, seen = new Set<string>()): string => {
    const known = paths.get(s.id);
    if (known !== undefined) return known;
    const name = s.numberLabel || s.title || `#${s.position}`;
    const parent = s.parentId ? byId.get(s.parentId) : undefined;
    // Guard against a cycle in the data
    const path =
      parent && !seen.has(parent.id) ? `${pathOf(parent, seen.add(s.id))}\u0000${name}` : name;
    paths.set(s.id, path);
    return path;
  };
  sections.forEach((s) => pathOf(s));
  return paths;
}
