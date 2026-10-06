import { z } from 'zod';
import { dateString } from './common.js';

const meetingTypeEnum = z.enum(['regular', 'special', 'annual', 'emergency']);

export const createMeetingBody = z
  .object({
    title: z.string().min(1).max(500).default('Meeting'),
    scheduled_date: dateString.optional(),
    scheduledDate: dateString.optional(),
    meeting_type: meetingTypeEnum.optional(),
    meetingType: meetingTypeEnum.optional(),
    location: z.string().max(500).optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
  })
  .refine((body) => body.scheduled_date || body.scheduledDate, {
    message: 'Required',
    path: ['scheduledDate'],
  });

export const updateMeetingBody = z.object({
  title: z.string().min(1).max(500).optional(),
  scheduled_date: dateString.optional(),
  scheduledDate: dateString.optional(),
  meeting_type: meetingTypeEnum.optional(),
  meetingType: meetingTypeEnum.optional(),
  location: z.string().max(500).optional().nullable(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export const createVoteBody = z.object({
  amendment_id: z.string().uuid().optional(),
  amendmentId: z.string().uuid().optional(),
  yea_count: z.number().int().min(0).optional(),
  yeaCount: z.number().int().min(0).optional(),
  nay_count: z.number().int().min(0).optional(),
  nayCount: z.number().int().min(0).optional(),
  abstain_count: z.number().int().min(0).optional(),
  abstainCount: z.number().int().min(0).optional(),
  requires: z.string().optional(),
});
