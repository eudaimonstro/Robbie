/**
 * A Word document as text for the bylaws parser: each heading paragraph a # line (one # per
 * heading level), every other paragraph its text, apart by a blank line. The file is read from
 * memory and never stored.
 */

import mammoth from 'mammoth';

/** The types a .docx arrives with: its own, or plain bytes from a browser that doesn't know it */
export const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];

/** The largest Word document read */
export const DOCX_LIMIT = '5mb';

/** The answers when there is nothing to read */
export const NO_FILE = 'No file received';
export const NOT_A_DOCX = 'That file is not a Word document Robbie can read';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(entity: string, code: string): string {
  if (code.startsWith('#')) {
    const value =
      code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    // String.fromCodePoint throws above the last code point: keep such an entity as written
    return Number.isFinite(value) && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  }
  return ENTITIES[code.toLowerCase()] ?? entity;
}

/** mammoth's HTML as the parser's text: headings as # lines, paragraphs apart, no markup */
export function htmlToImportText(html: string): string {
  return html
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_match, level: string, inner: string) => `\n\n${'#'.repeat(Number(level))} ${inner}\n\n`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(p|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text of a .docx; throws when mammoth can't read the file */
export async function docxToText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml(
    { buffer },
    // Images aren't text: leave them out rather than inline them
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
  );
  return htmlToImportText(value);
}
