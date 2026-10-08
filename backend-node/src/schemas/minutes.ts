import { z } from 'zod';

/** The longest minutes, in characters of Markdown */
export const MAX_MINUTES_LENGTH = 200_000;

export const updateMinutesBody = z.object({
  body: z.string().max(MAX_MINUTES_LENGTH),
});

/** A revision of one meeting's minutes */
export const revisionParams = z.object({ id: z.string().uuid(), revisionId: z.string().uuid() });
