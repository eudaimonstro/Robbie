import { describe, it, expect } from 'vitest';
import { readPastedPeople } from '../bulkMembers';

describe('readPastedPeople', () => {
  it('reads a name and an email however the line gives them', () => {
    const lines = readPastedPeople(
      [
        'Carmen Diaz, carmen@example.org',
        'Ben Whitaker <Ben@Example.org>',
        'Diaz, Hector; hector@example.org',
        'Grace\tKim\tgrace@example.org',
        '"Keiko Tanaka" keiko@example.org',
        'luis@example.org',
        '',
        '   ',
      ].join('\n'),
    );
    expect(lines.map((l) => ('email' in l ? [l.line, l.name, l.email] : l))).toEqual([
      [1, 'Carmen Diaz', 'carmen@example.org'],
      [2, 'Ben Whitaker', 'ben@example.org'],
      [3, 'Diaz, Hector', 'hector@example.org'],
      [4, 'Grace Kim', 'grace@example.org'],
      [5, 'Keiko Tanaka', 'keiko@example.org'],
      [6, '', 'luis@example.org'],
    ]);
  });

  it('says what is wrong with a line, in words', () => {
    const lines = readPastedPeople(
      [
        'Name, Email',
        'a@example.org, b@example.org',
        'Pat, pat@example',
        `${'x'.repeat(101)} x@example.org`,
        'Carmen, carmen@example.org',
        'Carmen again, CARMEN@example.org',
      ].join('\r\n'),
    );
    expect(lines.map((l) => ('problem' in l ? [l.line, l.problem] : [l.line, 'ok']))).toEqual([
      [1, 'No email address on this line'],
      [2, 'Two email addresses on one line'],
      [3, "That email address isn't complete"],
      [4, 'The name is longer than 100 characters'],
      [5, 'ok'],
      [6, 'Listed already, on line 5'],
    ]);
  });
});
