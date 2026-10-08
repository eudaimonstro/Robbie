/**
 * The attachment fields no response carries: who uploaded it (an email, kept for a report about
 * the file) and where it is stored. Pass as `omit` wherever attachment rows are returned.
 */
export const HIDDEN_ATTACHMENT_FIELDS = { uploadedBy: true, storagePath: true } as const;
