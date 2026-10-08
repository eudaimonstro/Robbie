import { describe, it, expect } from 'vitest';
import { redactUrl } from '../middleware/logger.js';

describe('redactUrl', () => {
  it("hides a share link's token in the API's URLs", () => {
    expect(redactUrl('/api/share/abc123DEF_-x')).toBe('/api/share/[token]');
    expect(redactUrl('/api/share/abc123/versions/9f1c')).toBe('/api/share/[token]/versions/9f1c');
    expect(redactUrl('/api/share/abc123/search?q=quorum')).toBe(
      '/api/share/[token]/search?q=quorum',
    );
  });

  it("hides it in the web app's share pages, the printable one too", () => {
    expect(redactUrl('/share/abc123')).toBe('/share/[token]');
    expect(redactUrl('/share/abc123/print')).toBe('/share/[token]/print');
    expect(redactUrl('/share/abc123?x=1')).toBe('/share/[token]?x=1');
  });

  it('leaves every other URL alone', () => {
    expect(redactUrl('/api/documents/42/share')).toBe('/api/documents/42/share');
    expect(redactUrl('/api/documents/42/share/regenerate')).toBe(
      '/api/documents/42/share/regenerate',
    );
    expect(redactUrl('/meetings/ABC123')).toBe('/meetings/ABC123');
    expect(redactUrl('/share')).toBe('/share');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
