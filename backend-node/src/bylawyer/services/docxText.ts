/**
 * A Word document as text for the bylaws parser: each heading paragraph a # line (one # per
 * heading level), every other paragraph its text, apart by a blank line. The file is read from
 * memory and never stored.
 */

import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';
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
export const DOCX_TOO_LARGE = 'That Word document is too large to read';

/**
 * What a Word document may unpack to. A .docx is a zip, and mammoth unpacks each part whole in
 * memory, so a small file that unpacks to gigabytes could exhaust it.
 */
export const DOCX_MAX_ENTRIES = 2000;
export const DOCX_MAX_UNPACKED = 50 * 1024 * 1024;
export const DOCX_MAX_DOCUMENT_XML = 20 * 1024 * 1024;

/** Thrown when a Word document would unpack to more than the limits */
export class DocxTooLargeError extends Error {
  constructor() {
    super(DOCX_TOO_LARGE);
    this.name = 'DocxTooLargeError';
  }
}

const inflateRawAsync = promisify(inflateRaw);

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const STORED = 0;
const DEFLATED = 8;
// A field at its largest means the real value is in a ZIP64 record: at least 4 GB, or 65,535 parts
const MAX_16 = 0xffff;
const MAX_32 = 0xffffffff;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  dataStart: number;
}

/**
 * The parts of a zip as its central directory declares them, read the way jszip (mammoth's zip
 * reader) reads them, without unpacking anything. Throws a plain Error for a file that isn't a
 * zip jszip would read the same way, and DocxTooLargeError for one that needs ZIP64.
 */
function zipEntries(buffer: Buffer): ZipEntry[] {
  const end = buffer.lastIndexOf(END_OF_CENTRAL_DIRECTORY);
  if (end < 0 || end + 22 > buffer.length) throw new Error('No end of central directory');
  const entryCount = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (
    buffer.readUInt16LE(end + 4) === MAX_16 ||
    entryCount === MAX_16 ||
    directorySize === MAX_32 ||
    directoryOffset === MAX_32
  ) {
    throw new DocxTooLargeError();
  }
  // jszip shifts every offset when they don't end where the directory ends (bytes put before
  // the zip); refuse such a file rather than read it differently
  if (directoryOffset + directorySize !== end) throw new Error('Misplaced central directory');

  const entries: ZipEntry[] = [];
  let at = directoryOffset;
  // Like jszip, read headers while they keep coming, whatever count the directory declares
  while (at + 46 <= buffer.length && buffer.readUInt32LE(at) === CENTRAL_HEADER) {
    if (entries.length === DOCX_MAX_ENTRIES) throw new DocxTooLargeError();
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    if (compressedSize === MAX_32 || size === MAX_32 || localOffset === MAX_32) {
      throw new DocxTooLargeError();
    }
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      throw new Error('Missing local header');
    }
    // The local header's own name and extra lengths, which may differ from the directory's
    const dataStart =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > buffer.length) throw new Error('Truncated part');
    entries.push({ name, method, compressedSize, size, dataStart });
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (entries.length === 0) throw new Error('No parts');
  return entries;
}

/**
 * Refuses a Word document that would unpack to more than the limits. First by the sizes its
 * central directory declares, before unpacking anything; then, since a declared size can lie,
 * by unpacking each compressed part with zlib capped at its declared size (mammoth can't cap
 * its own unpacking), so the real total can't pass the limits either. Throws DocxTooLargeError,
 * or a plain Error for a file that isn't a zip that can be read.
 */
export async function assertDocxUnpacksSmall(buffer: Buffer): Promise<void> {
  const entries = zipEntries(buffer);
  let total = 0;
  for (const entry of entries) {
    total += entry.size;
    if (
      total > DOCX_MAX_UNPACKED ||
      (entry.name === 'word/document.xml' && entry.size > DOCX_MAX_DOCUMENT_XML)
    ) {
      throw new DocxTooLargeError();
    }
  }
  for (const entry of entries) {
    if (entry.method === STORED) continue; // Its bytes are in the file as they are
    if (entry.method !== DEFLATED) throw new Error(`Unknown compression ${entry.method}`);
    const data = buffer.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    try {
      await inflateRawAsync(data, { maxOutputLength: Math.max(1, entry.size) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
        throw new DocxTooLargeError();
      }
      throw error;
    }
  }
}

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

/**
 * The text of a .docx. Throws DocxTooLargeError when it would unpack to more than the limits,
 * and another error when mammoth can't read the file.
 */
export async function docxToText(buffer: Buffer): Promise<string> {
  await assertDocxUnpacksSmall(buffer);
  const { value } = await mammoth.convertToHtml(
    { buffer },
    // Images aren't text: leave them out rather than inline them
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
  );
  return htmlToImportText(value);
}
