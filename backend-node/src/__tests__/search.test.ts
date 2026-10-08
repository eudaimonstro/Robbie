import { describe, it, expect } from 'vitest';
import { snippetAround } from '../bylawyer/services/search.js';

describe('snippetAround', () => {
  it('gives a short text whole, on one line', () => {
    expect(snippetAround('The name\nis A.', 'name')).toBe('The name is A.');
  });

  it('cuts a long text around the first match, marking the cuts', () => {
    const text = `${'a '.repeat(100)}Quorum is twenty percent.${' b'.repeat(100)}`;
    const snippet = snippetAround(text, 'quorum');
    expect(snippet).toMatch(/^\.\.\.(a )+Quorum is twenty percent\.( b)+\.\.\.$/);
    expect(snippet.length).toBeLessThanOrEqual(132);
  });

  it('finds a query with its spaces collapsed as the text has them', () => {
    const text = `${'a '.repeat(100)}The quorum\n\n   is ten.${' b'.repeat(100)}`;
    expect(snippetAround(text, 'quorum   is')).toMatch(
      /^\.\.\.(a )+The quorum is ten\.( b)+\.\.\.$/,
    );
    expect(snippetAround(text, 'quorum\nis')).toContain('The quorum is ten.');
  });

  it('gives the start of the text when the match is in the label or title', () => {
    expect(snippetAround('x'.repeat(200), 'quorum')).toBe(`${'x'.repeat(120)}...`);
    expect(snippetAround('', 'quorum')).toBe('');
  });
});
