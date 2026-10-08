import { z } from 'zod';

/** The longest minutes, in characters of Markdown */
export const MAX_MINUTES_LENGTH = 200_000;

export const updateMinutesBody = z.object({
  body: z.string().max(MAX_MINUTES_LENGTH),
});
