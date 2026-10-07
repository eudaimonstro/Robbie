import { describe, it, expect } from 'vitest';
import { describeParsedBylaws, parseBylaws, type ParsedSection } from '../../utils/index.js';

/** A parsed section, written compactly */
function s(
  numberLabel: string | null,
  title: string | null,
  content = '',
  children: ParsedSection[] = [],
): ParsedSection {
  return { numberLabel, title, content, children };
}

const lines = (...text: string[]) => text.join('\n');

describe('parseBylaws', () => {
  it.each<[string, string, ParsedSection[]]>([
    [
      'articles with titles on their own lines, and decimal sections',
      lines(
        'Article I',
        'Name and Purpose',
        '',
        'Section 1.1 Name',
        'The name of this corporation is Maple Grove Homeowners Association, Inc.',
        '',
        'Section 1.2 Purpose',
        'The Association maintains the common areas.',
        '',
        'Article II',
        'Membership and Voting Rights',
        '',
        'Section 2.1 Membership',
        'Every owner of a lot is a member.',
      ),
      [
        s('Article I', 'Name and Purpose', '', [
          s(
            'Section 1.1',
            'Name',
            'The name of this corporation is Maple Grove Homeowners Association, Inc.',
          ),
          s('Section 1.2', 'Purpose', 'The Association maintains the common areas.'),
        ]),
        s('Article II', 'Membership and Voting Rights', '', [
          s('Section 2.1', 'Membership', 'Every owner of a lot is a member.'),
        ]),
      ],
    ],
    [
      'all caps, a title after a dash, and section titles ending in a period',
      lines(
        'ARTICLE I - NAME AND PURPOSE',
        'SECTION 1. NAME. The name of this corporation is Maple Grove.',
        'SECTION 2. PURPOSE. The Association maintains the common areas.',
        'ARTICLE II - BOARD OF DIRECTORS',
        'SECTION 1. NUMBER. The Board has five directors.',
      ),
      [
        s('Article I', 'Name and Purpose', '', [
          s('Section 1', 'Name', 'The name of this corporation is Maple Grove.'),
          s('Section 2', 'Purpose', 'The Association maintains the common areas.'),
        ]),
        s('Article II', 'Board of Directors', '', [
          s('Section 1', 'Number', 'The Board has five directors.'),
        ]),
      ],
    ],
    [
      'number words and a colon, with text right under the article',
      lines(
        'Article One: Name',
        'The name is Maple Grove.',
        'Article Two: Members',
        'Each lot has one vote.',
      ),
      [
        s('Article One', 'Name', 'The name is Maple Grove.'),
        s('Article Two', 'Members', 'Each lot has one vote.'),
      ],
    ],
    [
      'Sec. and the section sign',
      lines(
        'Article 4. Meetings',
        'Sec. 4.1 Annual Meeting. The annual meeting is held each year.',
        '\u00a7 4.2 Quorum',
        'Twenty percent of the votes is a quorum.',
      ),
      [
        s('Article 4', 'Meetings', '', [
          s('Section 4.1', 'Annual Meeting', 'The annual meeting is held each year.'),
          s('Section 4.2', 'Quorum', 'Twenty percent of the votes is a quorum.'),
        ]),
      ],
    ],
    [
      'bare decimal labels, nested by their numbers',
      lines(
        '4.1 Annual Meeting',
        'The annual meeting is held in March.',
        '4.2 Quorum',
        '4.2.1 In Person. Members present in person count.',
        '4.2.2 By Proxy. Members present by proxy count.',
        '4.3 Notice',
        'Notice is mailed ten days ahead.',
      ),
      [
        s('4.1', 'Annual Meeting', 'The annual meeting is held in March.'),
        s('4.2', 'Quorum', '', [
          s('4.2.1', 'In Person', 'Members present in person count.'),
          s('4.2.2', 'By Proxy', 'Members present by proxy count.'),
        ]),
        s('4.3', 'Notice', 'Notice is mailed ten days ahead.'),
      ],
    ],
    [
      'a sentence after a bare article heading, which is text and not a title',
      lines('ARTICLE III', 'The Board manages the affairs of the Association.'),
      [s('Article III', null, 'The Board manages the affairs of the Association.')],
    ],
    [
      'text before the first heading, as a preamble',
      lines(
        'BYLAWS OF MAPLE GROVE HOMEOWNERS ASSOCIATION, INC.',
        '',
        'Adopted March 15, 2024.',
        '',
        'Article I',
        'Name',
      ),
      [
        s(
          null,
          null,
          'BYLAWS OF MAPLE GROVE HOMEOWNERS ASSOCIATION, INC.\n\nAdopted March 15, 2024.',
        ),
        s('Article I', 'Name'),
      ],
    ],
    [
      'Markdown headings when no line has a label',
      lines(
        '# Name',
        '',
        'The club is the Garden Club.',
        '',
        '# Members',
        '',
        '## Dues',
        '',
        'Dues are $20 a year.',
        '',
        '## Meetings',
        '',
        'The club meets monthly.',
      ),
      [
        s(null, 'Name', 'The club is the Garden Club.'),
        s(null, 'Members', '', [
          s(null, 'Dues', 'Dues are $20 a year.'),
          s(null, 'Meetings', 'The club meets monthly.'),
        ]),
      ],
    ],
    [
      'Markdown headings that carry labels, as a Word document converts',
      lines(
        '## Article I - Name',
        '',
        '### Section 1.1 Name of the Association',
        '',
        'The name is Maple Grove.',
      ),
      [
        s('Article I', 'Name', '', [
          s('Section 1.1', 'Name of the Association', 'The name is Maple Grove.'),
        ]),
      ],
    ],
    [
      'paragraphs and line breaks kept, and runs of blank lines made one',
      lines(
        'Section 1 Assessments',
        'Each lot pays an annual assessment.',
        '',
        '',
        '',
        'The Board sets it each year,',
        'in the budget.   ',
      ),
      [
        s(
          'Section 1',
          'Assessments',
          'Each lot pays an annual assessment.\n\nThe Board sets it each year,\nin the budget.',
        ),
      ],
    ],
    [
      'an em dash or an en dash between the label and the title',
      lines(
        'Article III \u2014 Board of Directors',
        'Section 3.1 \u2013 Number. The Board has five directors.',
      ),
      [
        s('Article III', 'Board of Directors', '', [
          s('Section 3.1', 'Number', 'The Board has five directors.'),
        ]),
      ],
    ],
    [
      'a section that starts with a sentence, without a title',
      'Section 2.4 A member may vote by written proxy filed with the Secretary.',
      [s('Section 2.4', null, 'A member may vote by written proxy filed with the Secretary.')],
    ],
    [
      'bold labels and Windows line endings',
      '**Article I**\r\nName\r\n\r\n**Section 1.1 Name**\r\nThe name is Maple Grove.\r\n',
      [s('Article I', 'Name', '', [s('Section 1.1', 'Name', 'The name is Maple Grove.')])],
    ],
    [
      'plain text without headings, as one preamble',
      lines('We meet on Tuesdays.', 'Dues are $20.'),
      [s(null, null, 'We meet on Tuesdays.\nDues are $20.')],
    ],
    ['nothing at all', '  \n\n  ', []],
    [
      'all-caps articles over sections with a period after the number and the title',
      lines(
        'ARTICLE IV - MEETINGS OF MEMBERS',
        '',
        'SECTION 4.1. ANNUAL MEETING. THE ANNUAL MEETING OF THE MEMBERS SHALL BE HELD IN MARCH.',
        '',
        'Section 4.2. Quorum.',
        'Twenty percent of the members in good standing is a quorum.',
        '',
        'ARTICLE V - BOARD OF DIRECTORS',
        '',
        'Section 5.1. Number.',
        'The Board has five directors.',
      ),
      [
        s('Article IV', 'Meetings of Members', '', [
          s(
            'Section 4.1',
            'Annual Meeting',
            'THE ANNUAL MEETING OF THE MEMBERS SHALL BE HELD IN MARCH.',
          ),
          s('Section 4.2', 'Quorum', 'Twenty percent of the members in good standing is a quorum.'),
        ]),
        s('Article V', 'Board of Directors', '', [
          s('Section 5.1', 'Number', 'The Board has five directors.'),
        ]),
      ],
    ],
    [
      'section titles on their own line after the number, then paragraphs',
      lines(
        'Section 3',
        'Board of Directors',
        'The affairs of the Association are managed by a Board of Directors.',
        '',
        'The Board meets at least four times a year.',
        '',
        'Section 4',
        'Officers',
        'The officers are a President, a Secretary and a Treasurer.',
      ),
      [
        s(
          'Section 3',
          'Board of Directors',
          'The affairs of the Association are managed by a Board of Directors.\n\nThe Board meets at least four times a year.',
        ),
        s('Section 4', 'Officers', 'The officers are a President, a Secretary and a Treasurer.'),
      ],
    ],
    [
      'a preamble paragraph, then articles with spelled-out numbers',
      lines(
        'These bylaws govern the Riverside Garden Club, an unincorporated association of',
        'gardeners in Riverside County, and were adopted by the members on May 2, 2019.',
        '',
        'Article One: Name',
        'The name of the club is the Riverside Garden Club.',
        '',
        'Article Two: Purpose',
        'The club promotes gardening in the county.',
      ),
      [
        s(
          null,
          null,
          'These bylaws govern the Riverside Garden Club, an unincorporated association of\ngardeners in Riverside County, and were adopted by the members on May 2, 2019.',
        ),
        s('Article One', 'Name', 'The name of the club is the Riverside Garden Club.'),
        s('Article Two', 'Purpose', 'The club promotes gardening in the county.'),
      ],
    ],
  ])('reads %s', (_shape, text, expected) => {
    expect(parseBylaws(text)).toEqual(expected);
  });
});

describe('describeParsedBylaws', () => {
  it('counts articles and the sections beneath them', () => {
    const parsed = parseBylaws(
      lines(
        'Article I',
        'Name',
        'Section 1.1 Name',
        'Section 1.2 Purpose',
        'Article II',
        'Members',
        'Section 2.1 Membership',
      ),
    );
    expect(describeParsedBylaws(parsed)).toBe('2 articles, 3 sections');
  });

  it('counts sections when the top level is not articles', () => {
    const parsed = parseBylaws(lines('4.1 Annual Meeting', '4.2 Quorum', '4.2.1 In Person'));
    expect(describeParsedBylaws(parsed)).toBe('3 sections');
  });

  it('says one of a kind, and mentions a preamble', () => {
    const parsed = parseBylaws(lines('Bylaws of the Garden Club', '', 'Article I', 'Name'));
    expect(describeParsedBylaws(parsed)).toBe('1 article, and a preamble');
  });

  it('says when it found no headings', () => {
    expect(describeParsedBylaws(parseBylaws('We meet on Tuesdays.'))).toBe('No headings found');
    expect(describeParsedBylaws([])).toBe('No headings found');
  });
});
