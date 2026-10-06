import { z } from 'zod';
import { dateString } from './common.js';

const changeTypeEnum = z.enum(['add', 'modify', 'delete', 'renumber']);

export const createAmendmentBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
});

export const updateAmendmentBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
});

export const createAmendmentChangeBody = z
  .object({
    change_type: changeTypeEnum.optional(),
    changeType: changeTypeEnum.optional(),
    target_section_id: z.string().uuid().optional().nullable(),
    targetSectionId: z.string().uuid().optional().nullable(),
    new_content: z.string().optional().nullable(),
    newContent: z.string().optional().nullable(),
    new_number_label: z.string().max(100).optional().nullable(),
    newNumberLabel: z.string().max(100).optional().nullable(),
    new_title: z.string().max(500).optional().nullable(),
    newTitle: z.string().max(500).optional().nullable(),
    parent_section_id: z.string().uuid().optional().nullable(),
    parentSectionId: z.string().uuid().optional().nullable(),
  })
  .refine((body) => body.change_type || body.changeType, {
    message: 'Required',
    path: ['changeType'],
  });

export const applyAmendmentQuery = z.object({
  effective_date: dateString.optional(),
});
