import { z } from 'zod';
import { meetingCode } from './common.js';

export const meetingCodeParam = z.object({ meetingCode });
