import type { ParsedSection } from '@robbie-bylawyer/shared/utils';

/** Where a section is in the tree: its index at each level, the top level first */
export type TreePath = number[];

/** The tree with the section at `path` changed, everything else as it was */
function update(
  sections: ParsedSection[],
  path: TreePath,
  change: (section: ParsedSection) => ParsedSection,
): ParsedSection[] {
  const [index, ...rest] = path;
  return sections.map((section, i) =>
    i !== index
      ? section
      : rest.length === 0
        ? change(section)
        : { ...section, children: update(section.children, rest, change) },
  );
}

function childrenAt(sections: ParsedSection[], path: TreePath): ParsedSection[] {
  return path.reduce<ParsedSection[]>((level, index) => level[index].children, sections);
}

/** The tree with one section's label or title changed; an empty one is none */
export function renameSection(
  sections: ParsedSection[],
  path: TreePath,
  changes: { numberLabel?: string; title?: string },
): ParsedSection[] {
  const orNone = (value: string) => (value.trim() === '' ? null : value);
  return update(sections, path, (section) => ({
    ...section,
    ...(changes.numberLabel !== undefined ? { numberLabel: orNone(changes.numberLabel) } : {}),
    ...(changes.title !== undefined ? { title: orNone(changes.title) } : {}),
  }));
}

/** Whether a section has one above it to merge into: every one but the very first */
export function canMerge(path: TreePath): boolean {
  return path.length > 1 || path[0] > 0;
}

/**
 * The tree with a section merged into the one above it: the one before it at its level, or its
 * parent when it is the first. The parser took a line of text for its heading, so its heading
 * and its text go back into that section's text, and its subsections follow it there.
 */
export function mergeIntoPrevious(sections: ParsedSection[], path: TreePath): ParsedSection[] {
  if (!canMerge(path)) return sections;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const siblings = childrenAt(sections, parentPath);
  const merged = siblings[index];
  const heading = [merged.numberLabel, merged.title].filter(Boolean).join(' ');
  const text = [heading, merged.content].filter(Boolean).join('\n\n');
  const withText = (content: string) => [content, text].filter(Boolean).join('\n\n');

  if (index === 0) {
    // The first at its level: into its parent, its subsections where it was
    return update(sections, parentPath, (parent) => ({
      ...parent,
      content: withText(parent.content),
      children: [...merged.children, ...parent.children.slice(1)],
    }));
  }

  const level = siblings
    .map((section, i) =>
      i === index - 1
        ? {
            ...section,
            content: withText(section.content),
            children: [...section.children, ...merged.children],
          }
        : section,
    )
    .filter((_, i) => i !== index);
  return parentPath.length === 0
    ? level
    : update(sections, parentPath, (parent) => ({ ...parent, children: level }));
}
