/**
 * Bylaws as text to a section tree, the same way whatever the source: pasted text, a .txt or
 * .md file, or a Word document the server turned into text with its headings as # lines. Pure:
 * the import screen runs it again whenever the text changes.
 */

/**
 * The deepest a section nests (an article is level 1): a heading deeper than this stays a line
 * of the text of the section above it, so whatever the text, its sections can be saved
 */
export const MAX_SECTION_DEPTH = 6;

/** A section found in the text, before it is saved */
export interface ParsedSection {
  numberLabel: string | null;
  title: string | null;
  content: string;
  children: ParsedSection[];
}

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

// Between a label and a title on its line: a period, a colon, a hyphen, an en dash or an em dash
const SEPARATOR = String.raw`(?:[.:\-\u2013\u2014]\s*)?`;

const ARTICLE = new RegExp(
  String.raw`^article\s+([ivxlcdm]+|\d+|${NUMBER_WORDS.join('|')})\b\.?\s*${SEPARATOR}(.*)$`,
  'i',
);
const SECTION = new RegExp(
  String.raw`^(?:section|sec\.?|\u00a7)\s*(\d+(?:\.\d+)*)\.?\s*${SEPARATOR}(.*)$`,
  'i',
);
// Two or more parts, so a numbered list ("1. The Board...") stays text
const DECIMAL = /^(\d+(?:\.\d+)+)\.?\s+(\S.*)$/;
const MARKDOWN = /^(#{1,6})\s+(.+)$/;

// Lower case in a title, unless first
const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

type Heading =
  | { kind: 'article'; label: string; rest: string }
  | { kind: 'section'; label: string; key: string; rest: string }
  | { kind: 'markdown'; level: number; text: string };

/** A line's text without surrounding bold marks */
function unwrap(text: string): string {
  return text.replace(/^(\*\*|__)(.+)\1$/, '$2').trim();
}

/** An article's number as the label writes it: IV, 4 or Four */
function numeral(value: string): string {
  if (/^\d+$/.test(value)) return value;
  const word = value.toLowerCase();
  if (NUMBER_WORDS.includes(word)) return word.charAt(0).toUpperCase() + word.slice(1);
  return value.toUpperCase();
}

/** An article or section heading, with or without # marks, or null */
function labeledHeading(line: string): Heading | null {
  const markdown = MARKDOWN.exec(line);
  const text = unwrap(markdown ? markdown[2] : line);
  const article = ARTICLE.exec(text);
  if (article)
    return { kind: 'article', label: `Article ${numeral(article[1])}`, rest: article[2] };
  const section = SECTION.exec(text);
  if (section) {
    return { kind: 'section', label: `Section ${section[1]}`, key: section[1], rest: section[2] };
  }
  const decimal = DECIMAL.exec(text);
  if (decimal) return { kind: 'section', label: decimal[1], key: decimal[1], rest: decimal[2] };
  return null;
}

/** A Markdown heading, or null */
function markdownHeading(line: string): Heading | null {
  const markdown = MARKDOWN.exec(line);
  return markdown
    ? { kind: 'markdown', level: markdown[1].length, text: unwrap(markdown[2]) }
    : null;
}

/**
 * Whether text reads like a title: at most 10 words and 80 characters, the first word and every
 * word longer than three letters capitalized ("Name and Purpose", "RULES OF ORDER")
 */
function isTitleLike(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 10 || text.length > 80) return false;
  return words.every(
    (word, index) => (index > 0 && word.length <= 3) || /^[A-Z0-9("'\u201c]/.test(word),
  );
}

/** A title without a closing period or colon, and in title case if it was all capitals */
function tidyTitle(text: string): string {
  const title = text.trim().replace(/[.:]$/, '').trim();
  if (/[a-z]/.test(title) || !/[A-Z]/.test(title)) return title;
  return title
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

/** The rest of a heading's line: a title, a title and the start of the content, or content */
function splitTitle(rest: string): { title: string | null; content: string } {
  const text = rest.trim();
  if (!text) return { title: null, content: '' };
  const sentence = /^([^.]+)\.\s+(\S[\s\S]*)$/.exec(text);
  if (sentence && isTitleLike(sentence[1])) {
    return { title: tidyTitle(sentence[1]), content: sentence[2] };
  }
  const whole = text.replace(/[.:]$/, '');
  if (isTitleLike(whole)) return { title: tidyTitle(whole), content: '' };
  return { title: null, content: text };
}

/** Lines as content: trailing spaces gone, runs of blank lines made one, trimmed */
function tidyContent(contentLines: string[]): string {
  return contentLines
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function newSection(numberLabel: string | null, title: string | null): ParsedSection {
  return { numberLabel, title, content: '', children: [] };
}

/** The sections of a bylaws text (see the rules in the plan's Task 2 and the tests) */
export function parseBylaws(text: string): ParsedSection[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // Labels, wherever they appear, decide the structure; # headings only without them
  const labeled = lines.some((line) => labeledHeading(line.trim()) !== null);
  const headingOf = labeled ? labeledHeading : markdownHeading;

  const roots: ParsedSection[] = [];
  const bodies = new Map<ParsedSection, string[]>();
  const preamble: string[] = [];
  let current: ParsedSection | null = null;
  let awaitingTitle: ParsedSection | null = null;
  // Labeled structure: the open article, and the open sections with their decimal keys
  let article: ParsedSection | null = null;
  const openSections: Array<{ node: ParsedSection; key: string }> = [];
  // Markdown structure: the open headings with their levels
  const openLevels: Array<{ node: ParsedSection; level: number }> = [];

  for (const raw of lines) {
    const line = raw.trim();

    // A heading with nothing after its label takes the next line as its title, if it is one
    if (awaitingTitle) {
      if (!line) continue;
      const titleLine = unwrap(line);
      if (!headingOf(line) && !/[.;,]$/.test(titleLine) && isTitleLike(titleLine)) {
        awaitingTitle.title = tidyTitle(titleLine);
        awaitingTitle = null;
        continue;
      }
      awaitingTitle = null;
    }

    const heading = headingOf(line);
    if (!heading) {
      // In a labeled text, a # line without a label is text: keep its words, not its marks
      const plain = labeled ? (MARKDOWN.exec(line)?.[2] ?? raw.trimEnd()) : raw.trimEnd();
      if (current) bodies.get(current)!.push(plain);
      else preamble.push(plain);
      continue;
    }

    // Deeper than sections nest: a line of the text of the section it falls in
    const depth =
      heading.kind === 'markdown'
        ? openLevels.filter((open) => open.level < heading.level).length + 1
        : heading.kind === 'article'
          ? 1
          : openSections.filter((open) => heading.key.startsWith(`${open.key}.`)).length +
            (article ? 1 : 0) +
            1;
    if (depth > MAX_SECTION_DEPTH) {
      const plain = MARKDOWN.exec(line)?.[2] ?? raw.trimEnd();
      if (current) bodies.get(current)!.push(plain);
      else preamble.push(plain);
      continue;
    }

    if (heading.kind === 'markdown') {
      const node = newSection(null, tidyTitle(heading.text));
      bodies.set(node, []);
      while (openLevels.length > 0 && openLevels[openLevels.length - 1].level >= heading.level) {
        openLevels.pop();
      }
      const parent = openLevels[openLevels.length - 1]?.node;
      (parent ? parent.children : roots).push(node);
      openLevels.push({ node, level: heading.level });
      current = node;
      continue;
    }

    const { title, content } = splitTitle(heading.rest);
    const node = newSection(heading.label, title);
    bodies.set(node, content ? [content] : []);
    if (heading.kind === 'article') {
      roots.push(node);
      article = node;
      openSections.length = 0;
    } else {
      // A decimal label nests under the open section whose label is its prefix
      while (
        openSections.length > 0 &&
        !heading.key.startsWith(`${openSections[openSections.length - 1].key}.`)
      ) {
        openSections.pop();
      }
      const parent = openSections[openSections.length - 1]?.node ?? article;
      (parent ? parent.children : roots).push(node);
      openSections.push({ node, key: heading.key });
    }
    current = node;
    if (!title && !content) awaitingTitle = node;
  }

  const finish = (node: ParsedSection) => {
    node.content = tidyContent(bodies.get(node) ?? []);
    node.children.forEach(finish);
  };
  roots.forEach(finish);
  const intro = tidyContent(preamble);
  return intro ? [{ ...newSection(null, null), content: intro }, ...roots] : roots;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function countAll(sections: ParsedSection[]): number {
  return sections.reduce((sum, section) => sum + 1 + countAll(section.children), 0);
}

/**
 * What the parser found, for the review screen: "6 articles, 23 sections" when the top level is
 * articles (the sections are everything beneath them), otherwise "5 sections"; ", and a
 * preamble" when the text has one
 */
export function describeParsedBylaws(sections: ParsedSection[]): string {
  const preamble =
    sections.length > 0 && sections[0].numberLabel === null && sections[0].title === null;
  const top = preamble ? sections.slice(1) : sections;
  if (top.length === 0) return 'No headings found';
  const nested = top.reduce((sum, section) => sum + countAll(section.children), 0);
  const articles = top.filter((section) => /^article\b/i.test(section.numberLabel ?? '')).length;
  const found =
    articles === top.length
      ? [plural(articles, 'article'), ...(nested > 0 ? [plural(nested, 'section')] : [])].join(', ')
      : plural(top.length + nested, 'section');
  return preamble ? `${found}, and a preamble` : found;
}
