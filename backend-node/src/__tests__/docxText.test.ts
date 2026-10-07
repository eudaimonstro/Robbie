import { describe, it, expect } from 'vitest';
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

  it('refuses a file that is not a zip as unreadable, not as too large', async () => {
    const error = await assertDocxUnpacksSmall(Buffer.from('Not a zip')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DocxTooLargeError);
  });
});
