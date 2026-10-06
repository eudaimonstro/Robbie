import { z } from 'zod';

export const createAgendaItemBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  presenter: z.string().max(200).optional(),
});

export const updateAgendaItemBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  presenter: z.string().max(200).optional().nullable(),
  position: z.number().int().min(0).optional(),
});

export const reorderAgendaItemsBody = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

export const bulkCreateAgendaItemsBody = z.object({
  packetId: z.string().uuid(),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        description: z.string().max(2000).optional(),
        estimatedMinutes: z.number().int().positive().optional(),
        presenter: z.string().max(200).optional(),
      }),
    )
    .min(1),
});
