import { describe, it, expect } from 'vitest';
import {
  amendInsertedWords,
  applyTextAmendment,
  describeTextAmendment,
  textAmendmentProblem,
} from '../../utils/index.js';

const motion = 'Resurface the pool in May for $40,000.';

describe('an amendment to the words of a motion', () => {
  it('inserts words at the end, before the closing period, or after the words given', () => {
    expect(applyTextAmendment(motion, { form: 'insert', insert: 'with heating' })).toBe(
      'Resurface the pool in May for $40,000 with heating.',
    );
    expect(
      applyTextAmendment(motion, { form: 'insert', insert: 'and the spa', after: 'pool' }),
    ).toBe('Resurface the pool and the spa in May for $40,000.');
  });

  it('strikes words, strikes and inserts, or replaces the whole text', () => {
    expect(applyTextAmendment(motion, { form: 'strike', strike: 'in May' })).toBe(
      'Resurface the pool for $40,000.',
    );
    expect(
      applyTextAmendment(motion, { form: 'strikeInsert', strike: '$40,000', insert: '$35,000' }),
    ).toBe('Resurface the pool in May for $35,000.');
    expect(applyTextAmendment(motion, { form: 'substitute', insert: '  Fill in the pool. ' })).toBe(
      'Fill in the pool.',
    );
  });

  it('says what it does in words, with the words in curly quotes', () => {
    expect(describeTextAmendment({ form: 'strikeInsert', strike: 'May', insert: 'June' })).toBe(
      'Strike “May” and insert “June”',
    );
    expect(describeTextAmendment({ form: 'insert', insert: 'now' })).toBe(
      'Insert “now” at the end',
    );
    expect(describeTextAmendment({ form: 'insert', insert: 'now', after: 'pool' })).toBe(
      'Insert “now” after “pool”',
    );
    expect(describeTextAmendment({ form: 'strike', strike: 'in May' })).toBe('Strike “in May”');
    expect(describeTextAmendment({ form: 'substitute', insert: 'Fill it in' })).toBe(
      'Replace the text with “Fill it in”',
    );
  });

  it('applies only when its words are there exactly once', () => {
    expect(textAmendmentProblem(motion, { form: 'strike', strike: 'June' })).toBe(
      '"June" is not in the words being amended',
    );
    expect(
      textAmendmentProblem('the pool and the pool deck', { form: 'strike', strike: 'pool' }),
    ).toBe('"pool" appears more than once: give more of the words around it');
    expect(
      applyTextAmendment('the pool and the pool deck', { form: 'strike', strike: 'pool' }),
    ).toBeNull();
    expect(textAmendmentProblem(motion, { form: 'strike', strike: '  ' })).toBe(
      'Give the words to strike',
    );
    expect(textAmendmentProblem(motion, { form: 'insert', insert: '' })).toBe(
      'Give the words to insert',
    );
    expect(textAmendmentProblem(motion, { form: 'substitute', insert: motion })).toBe(
      'The amendment changes nothing',
    );
    expect(textAmendmentProblem('Pave it', { form: 'strike', strike: 'Pave it' })).toBe(
      'The amendment would strike every word: vote the motion down instead',
    );
    expect(textAmendmentProblem('Pave it', { form: 'insert', insert: 'x'.repeat(500) })).toBe(
      'As amended the words would be longer than 500 characters',
    );
    expect(textAmendmentProblem(motion, { form: 'insert', insert: 'now' })).toBeNull();
  });

  it('is amended in turn by changing the words it inserts', () => {
    expect(
      amendInsertedWords(
        { form: 'strikeInsert', strike: '$40,000', insert: '$35,000' },
        { form: 'strikeInsert', strike: '35', insert: '38' },
      ),
    ).toEqual({ form: 'strikeInsert', strike: '$40,000', insert: '$38,000' });
    expect(
      amendInsertedWords({ form: 'strike', strike: 'May' }, { form: 'insert', insert: 'x' }),
    ).toBeNull();
  });
});
