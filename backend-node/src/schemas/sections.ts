import { z } from 'zod';

export const createSectionBody = z.object({
  parent_id: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  number_label: z.string().max(100).optional(),
  numberLabel: z.string().max(100).optional(),
  title: z.string().max(500).optional(),
  content: z.string().optional(),
  annotation: z.string().max(2000).optional(),
});

export const updateSectionBody = z.object({
  parent_id: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional(),
  number_label: z.string().max(100).optional(),
  numberLabel: z.string().max(100).optional(),
  title: z.string().max(500).optional().nullable(),
  content: z.string().optional().nullable(),
  annotation: z.string().max(2000).optional().nullable(),
});

export const reorderSectionsBody = z.array(
  z.object({
    id: z.string().uuid(),
    position: z.number().int().min(0),
  }),
);
