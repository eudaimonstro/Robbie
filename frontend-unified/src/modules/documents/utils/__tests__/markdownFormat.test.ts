import { describe, it, expect } from 'vitest';
import { applyFormat } from '../markdownFormat';

describe('applyFormat', () => {
  it('wraps the selection in bold, or a word to type over when nothing is selected', () => {
    const text = 'The motion carried.';
    expect(applyFormat(text, 11, 18, 'bold')).toEqual({
      text: 'The motion **carried**.',
      start: 13,
      end: 20,
    });
    expect(applyFormat(text, 4, 4, 'bold')).toEqual({
      text: 'The **bold text**motion carried.',
      start: 6,
      end: 15,
    });
  });

  it("makes the cursor's line a heading, and a heading a line again", () => {
    const text = 'Call to order\nThe chair called the meeting to order.';
    const heading = applyFormat(text, 5, 5, 'heading');
    expect(heading.text).toBe('## Call to order\nThe chair called the meeting to order.');
    expect(heading.start).toBe(8);
    expect(applyFormat(heading.text, 8, 8, 'heading').text).toBe(text);
    // A heading of another level becomes a level-two one
    expect(applyFormat('# Minutes', 3, 3, 'heading').text).toBe('## Minutes');
  });

  it('starts each selected line with a dash, and takes the dashes off a list', () => {
    const text = 'Present:\nAlice Brennan\nBen Whitaker\n\nAbsent: none';
    const start = text.indexOf('Alice');
    const end = text.indexOf('Whitaker') + 'Whitaker'.length;
    const listed = applyFormat(text, start, end, 'list');
    expect(listed.text).toBe('Present:\n- Alice Brennan\n- Ben Whitaker\n\nAbsent: none');
    expect(listed.text.slice(listed.start, listed.end)).toBe('- Alice Brennan\n- Ben Whitaker');
    expect(applyFormat(listed.text, listed.start, listed.end, 'list').text).toBe(text);
  });
});
