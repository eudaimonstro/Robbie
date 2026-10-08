import { describe, it, expect } from 'vitest';
import { wordDiff } from '../wordDiff';

describe('wordDiff', () => {
  it('marks only the words that changed', () => {
    expect(
      wordDiff(
        'A quorum is twenty percent (20%) of the members.',
        'A quorum is fifteen percent (15%) of the members.',
      ),
    ).toEqual([
      { kind: 'same', text: 'A quorum is ' },
      { kind: 'removed', text: 'twenty' },
      { kind: 'added', text: 'fifteen' },
      { kind: 'same', text: ' percent ' },
      { kind: 'removed', text: '(20%)' },
      { kind: 'added', text: '(15%)' },
      { kind: 'same', text: ' of the members.' },
    ]);
  });

  it('reads several changed words in a row as one change', () => {
    expect(wordDiff('Dues are twenty dollars.', 'Dues are thirty-five whole dollars.')).toEqual([
      { kind: 'same', text: 'Dues are ' },
      { kind: 'removed', text: 'twenty' },
      { kind: 'added', text: 'thirty-five whole' },
      { kind: 'same', text: ' dollars.' },
    ]);
    expect(wordDiff('twenty (20%)', 'fifteen (15%)')).toEqual([
      { kind: 'removed', text: 'twenty (20%)' },
      { kind: 'added', text: 'fifteen (15%)' },
    ]);
  });

  it('handles text added to or taken from either end, and no change at all', () => {
    expect(wordDiff('The board.', 'The board meets monthly.')).toEqual([
      { kind: 'same', text: 'The ' },
      { kind: 'removed', text: 'board.' },
      { kind: 'added', text: 'board meets monthly.' },
    ]);
    expect(wordDiff('', 'New text')).toEqual([{ kind: 'added', text: 'New text' }]);
    expect(wordDiff('Old text', '')).toEqual([{ kind: 'removed', text: 'Old text' }]);
    expect(wordDiff('Same', 'Same')).toEqual([{ kind: 'same', text: 'Same' }]);
    expect(wordDiff('', '')).toEqual([]);
  });

  it('keeps every character of both texts', () => {
    const before = 'One  two\nthree four five';
    const after = 'One two\nthree 4 five six';
    const parts = wordDiff(before, after);
    const side = (kind: 'removed' | 'added') =>
      parts
        .filter((p) => p.kind === 'same' || p.kind === kind)
        .map((p) => p.text)
        .join('');
    expect(side('removed')).toBe(before);
    expect(side('added')).toBe(after);
  });
});
