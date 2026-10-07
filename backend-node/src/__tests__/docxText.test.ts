import { describe, it, expect } from 'vitest';
import { htmlToImportText } from '../bylawyer/services/docxText.js';

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
