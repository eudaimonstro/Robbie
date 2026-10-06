import { z } from 'zod';
import { robbieCode } from './packets.js';

export const meetingCodeParam = z.object({ meetingCode: robbieCode });

export const linkMeetingBody = z.object({
  meetingCode: robbieCode,
  organizationId: z.string().uuid(),
});
