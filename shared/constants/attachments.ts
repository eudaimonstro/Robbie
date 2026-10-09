/**
 * The kinds of file a meeting's packet and agenda items take, by MIME type: each one's label and
 * the extension it is stored with. The web checks a file before sending it; the server decides.
 */
export const ATTACHMENT_TYPES: Readonly<Record<string, { label: string; extension: string }>> = {
  'application/pdf': { label: 'PDF', extension: '.pdf' },
  'application/msword': { label: 'DOC', extension: '.doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    label: 'DOCX',
    extension: '.docx',
  },
  'text/plain': { label: 'TXT', extension: '.txt' },
  'text/rtf': { label: 'RTF', extension: '.rtf' },
  'application/rtf': { label: 'RTF', extension: '.rtf' },
};

/** The largest file a meeting can have attached: 10 MB */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
