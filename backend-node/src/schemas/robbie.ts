import { z } from 'zod';

export const syncMotionBody = z.object({
  meetingCode: z.string().min(1),
  motionId: z.number().int(),
  motionText: z.string().optional().default(''),
  passed: z.boolean(),
  timestamp: z.string().optional(),
  voteData: z
    .object({
      yeaCount: z.number().int().min(0),
      nayCount: z.number().int().min(0),
      abstainCount: z.number().int().min(0),
      voterChoices: z.record(z.string(), z.string()).optional(),
      voteRequirement: z.string().optional(),
    })
    .optional(),
  bylawAmendment: z.object({
    documentId: z.string().min(1),
    documentTitle: z.string().optional(),
    changeType: z.enum(['add', 'modify', 'delete', 'renumber']),
    targetSectionId: z.string().optional(),
    targetSectionLabel: z.string().optional(),
    newContent: z.string().optional(),
    newNumberLabel: z.string().optional(),
    newTitle: z.string().optional(),
    parentSectionId: z.string().optional(),
  }),
});

export const syncStatusParams = z.object({
  meetingCode: z.string().min(1),
  motionId: z.coerce.number().int(),
});
