import { z } from 'zod';
import { dateString } from './common.js';

const docTypeEnum = z.enum(['bylaws', 'standing_rules', 'policy', 'minutes']);

export const createDocumentBody = z.object({
  title: z.string().min(1).max(500),
  doc_type: docTypeEnum.optional(),
  docType: docTypeEnum.optional(),
});

export const updateDocumentBody = z.object({
  title: z.string().min(1).max(500).optional(),
  doc_type: docTypeEnum.optional(),
  docType: docTypeEnum.optional(),
});

export const atDateQuery = z.object({
  date: dateString,
});

/** A search of the organization's bylaws: at least 2 characters */
export const searchQuery = z.object({
  q: z.string().trim().min(2, 'Search for at least 2 characters').max(200),
});
