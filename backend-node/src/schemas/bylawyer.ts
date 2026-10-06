import { z } from 'zod';
import { meetingCode } from './common.js';

export const meetingCodeParam = z.object({ meetingCode });

export const linkMeetingBody = z.object({
  meetingCode,
  organizationId: z.string().uuid(),
});
