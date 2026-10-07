import { z } from 'zod';

/**
 * An attachment goes on a packet or on an agenda item. Naming both would let the rule check one
 * while the attachment is also written to the other, so a request with both is refused.
 */
export const NOT_BOTH_PARENTS = 'Give a packetId or an agendaItemId, not both';

export const linkDocumentBody = z
  .object({
    documentId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
    packetId: z.string().uuid().optional(),
    agendaItemId: z.string().uuid().optional(),
    displayName: z.string().max(500).optional(),
    description: z.string().max(2000).optional(),
  })
  .refine((body) => !(body.packetId && body.agendaItemId), {
    message: NOT_BOTH_PARENTS,
    path: ['agendaItemId'],
  });

export const updateAttachmentBody = z.object({
  displayName: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  position: z.number().int().min(0).optional(),
});

export const reorderAttachmentsBody = z.object({
  attachmentIds: z.array(z.string().uuid()).min(1),
});
