import { describe, it, expect } from 'vitest';
import { crc32 } from 'node:zlib';
import JSZip from 'jszip';
import {
  DOCX_MAX_DOCUMENT_XML,
  DOCX_MAX_ENTRIES,
  DocxTooLargeError,
  assertDocxUnpacksSmall,
  htmlToImportText,
} from '../bylawyer/services/docxText.js';
import { makeDocx } from '../__integration__/docx.js';

describe('htmlToImportText', () => {
  it('keeps headings as # lines and paragraphs apart, without other markup', () => {
    const html =
      '<h1>Article I</h1><p>Name and Purpose</p><h2>Section 1.1</h2>' +
      '<p>The name is <strong>Maple Grove</strong>.</p>';
    expect(htmlToImportText(html)).toBe(
      '# Article I\n\nName and Purpose\n\n## Section 1.1\n\nThe name is Maple Grove.',
    );
  });

  it('decodes entities and keeps line breaks', () => {
    expect(htmlToImportText('<p>Dues &amp; fees&nbsp;are &#36;20<br />a year</p>')).toBe(
      'Dues & fees are $20\na year',
    );
  });

  it('puts list items on their own lines', () => {
    expect(htmlToImportText('<ul><li>One</li><li>Two</li></ul>')).toBe('One\nTwo');
  });

  it('turns nothing into nothing', () => {
    expect(htmlToImportText('')).toBe('');
  });
});

describe('assertDocxUnpacksSmall', () => {
  const MB = 1024 * 1024;
  const zipOf = (parts: Record<string, string>) => {
    const zip = new JSZip();
    // Without folder entries, so the first header is the first part's
    for (const [name, text] of Object.entries(parts))
      zip.file(name, text, { createFolders: false });
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  };

  it('lets a Word document through, stored or compressed', async () => {
    const paragraphs = [{ text: 'Article I', heading: 1 as const }, { text: 'The name is A.' }];
    await expect(assertDocxUnpacksSmall(await makeDocx(paragraphs))).resolves.toBeUndefined();
    await expect(
      assertDocxUnpacksSmall(await makeDocx(paragraphs, { deflate: true })),
    ).resolves.toBeUndefined();
  });

  it('refuses a document.xml declared over 20 MB', async () => {
    const zip = await zipOf({ 'word/document.xml': 'a'.repeat(DOCX_MAX_DOCUMENT_XML + 1) });
    await expect(assertDocxUnpacksSmall(zip)).rejects.toBeInstanceOf(DocxTooLargeError);
  }, 30_000);

  it('refuses parts declared over 50 MB in all', async () => {
    const part = 'b'.repeat(18 * MB);
    const zip = await zipOf({ 'word/a.xml': part, 'word/b.xml': part, 'word/c.xml': part });
    await expect(assertDocxUnpacksSmall(zip)).rejects.toBeInstanceOf(DocxTooLargeError);
  }, 30_000);

  it('refuses more than 2,000 parts', async () => {
    const parts = Object.fromEntries(
      Array.from({ length: DOCX_MAX_ENTRIES + 1 }, (_, i) => [`word/part${i}.xml`, 'x']),
    );
    await expect(assertDocxUnpacksSmall(await zipOf(parts))).rejects.toBeInstanceOf(
      DocxTooLargeError,
    );
  });

  it('refuses a part that unpacks larger than it declares', async () => {
    const zip = await zipOf({ 'word/document.xml': 'c'.repeat(MB) });
    // Declare 100 bytes in both the local header and the central directory
    zip.writeUInt32LE(100, zip.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) + 22);
    zip.writeUInt32LE(100, zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);
    await expect(assertDocxUnpacksSmall(zip)).rejects.toBeInstanceOf(DocxTooLargeError);
  });

  const END = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const LOCAL = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const CENTRAL = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const small = () => zipOf({ 'word/document.xml': '<w:document/>' });

  for (const [field, offset] of [
    ['the disk that holds the directory', 6],
    ['the count of parts on this disk', 8],
  ] as const) {
    it(`refuses a zip whose end record sends jszip to ZIP64 by ${field}`, async () => {
      const zip = await small();
      zip.writeUInt16LE(0xffff, zip.lastIndexOf(END) + offset);
      await expect(assertDocxUnpacksSmall(zip)).rejects.toBeInstanceOf(DocxTooLargeError);
    });
  }

  it('lets through a zip whose part data holds the ZIP64 signatures', async () => {
    // Bytes that can occur by chance inside compressed data; here in a stored part, verbatim
    const zip = new JSZip();
    const data = Buffer.from([0x50, 0x4b, 0x06, 0x06, 0x20, 0x50, 0x4b, 0x06, 0x07]);
    zip.file('word/document.xml', '<w:document/>', { createFolders: false });
    zip.file('word/media/blob.bin', data, { createFolders: false });
    const stored = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    expect(stored.includes(data)).toBe(true);
    await expect(assertDocxUnpacksSmall(stored)).resolves.toBeUndefined();
  });

  it('refuses a zip with a ZIP64 locator right before its end record', async () => {
    const zip = await small();
    const end = zip.lastIndexOf(END);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    const patched = Buffer.concat([zip.subarray(0, end), locator, zip.subarray(end)]);
    await expect(assertDocxUnpacksSmall(patched)).rejects.toBeInstanceOf(DocxTooLargeError);
  });

  it('refuses a part named differently in its local header and the directory', async () => {
    // jszip unpacks the part by its local name, word/document.xml; the directory calls it
    // word/documenT.xml, which the 20 MB limit for document.xml would not have applied to
    const zip = await zipOf({ 'word/document.xml': 'd'.repeat(DOCX_MAX_DOCUMENT_XML + 1) });
    zip.write('T', zip.indexOf(CENTRAL) + 46 + 'word/documen'.length);
    expect(zip.toString('utf8', 30, 30 + 17)).toBe('word/document.xml');
    await expect(assertDocxUnpacksSmall(zip)).rejects.toThrow();
  }, 30_000);

  it('refuses a part that an extra field names, as jszip would read it', async () => {
    // Named word/other.xml in both headers, and word/document.xml in a Unicode path extra
    // field in the directory, which jszip reads instead
    const zip = await zipOf({ 'word/other.xml': 'f'.repeat(DOCX_MAX_DOCUMENT_XML + 1) });
    const central = zip.indexOf(CENTRAL);
    const nameEnd = central + 46 + zip.readUInt16LE(central + 28);
    const unicodeName = Buffer.from('word/document.xml');
    const field = Buffer.alloc(9);
    field.writeUInt16LE(0x7075, 0);
    field.writeUInt16LE(5 + unicodeName.length, 2);
    field.writeUInt8(1, 4);
    field.writeUInt32LE(crc32(Buffer.from('word/other.xml')), 5);
    const extra = Buffer.concat([field, unicodeName]);
    zip.writeUInt16LE(zip.readUInt16LE(central + 30) + extra.length, central + 30);
    const end = zip.lastIndexOf(END);
    zip.writeUInt32LE(zip.readUInt32LE(end + 12) + extra.length, end + 12);
    const named = Buffer.concat([zip.subarray(0, nameEnd), extra, zip.subarray(nameEnd)]);
    expect(Object.keys((await JSZip.loadAsync(named)).files)).toEqual(['word/document.xml']);
    await expect(assertDocxUnpacksSmall(named)).rejects.toThrow();
  }, 30_000);

  it('counts a stored part by the bytes it occupies, whatever size it declares', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', 'e'.repeat(DOCX_MAX_DOCUMENT_XML + 1), { createFolders: false });
    const stored = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    stored.writeUInt32LE(100, stored.indexOf(LOCAL) + 22);
    stored.writeUInt32LE(100, stored.indexOf(CENTRAL) + 24);
    await expect(assertDocxUnpacksSmall(stored)).rejects.toBeInstanceOf(DocxTooLargeError);
  }, 30_000);

  it('refuses a file that is not a zip as unreadable, not as too large', async () => {
    const error = await assertDocxUnpacksSmall(Buffer.from('Not a zip')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DocxTooLargeError);
  });
});
