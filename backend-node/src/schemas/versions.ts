import { z } from 'zod';
import { MAX_SECTION_DEPTH } from '@robbie-bylawyer/shared/utils';
import { dateString } from './common.js';

export const createVersionBody = z.object({
  effective_date: dateString.optional().nullable(),
  effectiveDate: dateString.optional().nullable(),
  adopted_at: dateString.optional().nullable(),
  adoptedAt: dateString.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateVersionBody = z.object({
  effective_date: dateString.optional().nullable(),
  effectiveDate: dateString.optional().nullable(),
  adopted_at: dateString.optional().nullable(),
  adoptedAt: dateString.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const diffParams = z.object({
  id: z.string().uuid(),
  otherId: z.string().uuid(),
});

/** A section as the import sends it: what the parser found, after the secretary's fixes */
export interface ImportedSection {
  numberLabel: string | null;
  title: string | null;
  content: string;
  children: ImportedSection[];
}

/** At most this many sections in one import, and this many levels (as deep as the parser nests) */
export const MAX_IMPORTED_SECTIONS = 2000;
export const MAX_IMPORT_DEPTH = MAX_SECTION_DEPTH;
/** The longest text of one section */
export const MAX_SECTION_CONTENT = 100_000;

/** The answer when the parser found no headings in a text too long to be one section */
export const NO_HEADINGS =
  'The text has no headings Robbie recognizes; add Article or Section headings';

/**
 * Whether a body is a text the parser found no headings in (all of it one untitled section, the
 * preamble), too long to be one section: its answer is NO_HEADINGS rather than a limit
 */
export function isLongTextWithoutHeadings(body: unknown): boolean {
  const sections = (body as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections) || sections.length !== 1) return false;
  const only = sections[0] as Partial<ImportedSection> | null;
  return (
    !!only &&
    only.numberLabel == null &&
    only.title == null &&
    (!Array.isArray(only.children) || only.children.length === 0) &&
    typeof only.content === 'string' &&
    only.content.length > MAX_SECTION_CONTENT
  );
}

const importedSection: z.ZodType<ImportedSection> = z.lazy(() =>
  z.object({
    numberLabel: z.string().max(100).nullable(),
    title: z.string().max(500).nullable(),
    content: z.string().max(MAX_SECTION_CONTENT),
    children: z.array(importedSection),
  }),
);

/**
 * Whether a body's section tree stays within the limits. It walks the raw body without
 * recursion and before the recursive schema reads it, so a tree nested thousands of levels
 * deep is refused rather than overflowing the stack.
 */
function withinImportLimits(body: unknown): boolean {
  const sections = (body as { sections?: unknown } | null)?.sections;
  // Not a list: the schema says what is wrong with it
  if (!Array.isArray(sections)) return true;
  let count = 0;
  const pending: Array<{ nodes: unknown[]; depth: number }> = [{ nodes: sections, depth: 1 }];
  for (let next = pending.pop(); next; next = pending.pop()) {
    if (next.nodes.length > 0 && next.depth > MAX_IMPORT_DEPTH) return false;
    for (const node of next.nodes) {
      count += 1;
      if (count > MAX_IMPORTED_SECTIONS) return false;
      const children = (node as { children?: unknown } | null)?.children;
      if (Array.isArray(children)) pending.push({ nodes: children, depth: next.depth + 1 });
    }
  }
  return true;
}

export const importVersionBody = z
  .unknown()
  .refine(withinImportLimits, {
    message: `At most ${MAX_IMPORTED_SECTIONS} sections, ${MAX_IMPORT_DEPTH} levels deep`,
    path: ['sections'],
  })
  .pipe(
    z.object({
      effectiveDate: dateString.optional().nullable(),
      notes: z.string().max(5000).optional().nullable(),
      sections: z.array(importedSection).min(1),
    }),
  );

export type ImportVersionBody = z.infer<typeof importVersionBody>;
