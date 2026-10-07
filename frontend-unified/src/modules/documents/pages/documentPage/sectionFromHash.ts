import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { SectionTree } from '../../../../api/client';

/** The section with this id, at any depth, or null */
export function findSection(sections: SectionTree[], id: string): SectionTree | null {
  for (const section of sections) {
    if (section.id === id) return section;
    const found = findSection(section.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * A document opened at a section (#section-<id>, from the header's search): once the tree has
 * the section, select it and scroll it into view. Once per visit to the link, so a later reload
 * of the tree (after an edit) leaves the reader's own selection alone
 */
export function useSectionFromHash(
  sections: SectionTree[],
  select: (section: SectionTree) => void,
): void {
  const { hash, key } = useLocation();
  const shownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!hash.startsWith('#section-') || shownFor.current === key) return;
    const id = hash.slice('#section-'.length);
    const section = findSection(sections, id);
    if (!section) return;
    shownFor.current = key;
    select(section);
    document.getElementById(`section-${id}`)?.scrollIntoView?.({ block: 'center' });
  }, [hash, key, sections, select]);
}
