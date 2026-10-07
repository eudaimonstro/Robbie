import { describe, it, expect } from 'vitest';
import css from '../index.css?raw';

/** The declarations of the rule with this selector, at the start of a line */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('\n}', start));
}

// docs/design-brief.md, "Color": the day session and the evening session
const BRIEF: Record<string, [string, string]> = {
  paper: ['#f7f3ec', '#15130f'],
  surface: ['#fffdf9', '#1f1c17'],
  'surface-2': ['#f1ebe1', '#282420'],
  ink: ['#1c1a17', '#f3eee6'],
  'ink-muted': ['#5b564e', '#a8a094'],
  rule: ['#e4ddd1', '#332e27'],
  gavel: ['#8b2e25', '#e46a55'],
  'gavel-tint': ['#f6e6e2', '#3a1f1b'],
  carried: ['#2f6b45', '#5dbb7a'],
  'carried-tint': ['#e3efe5', '#1e3326'],
  caution: ['#b7791f', '#e0a530'],
  'caution-tint': ['#fbf0dc', '#3a2e14'],
};

/** A token's value in a rule's block: "--gavel: #8b2e25;" */
function value(selector: string, name: string): string {
  const match = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(block(selector));
  expect(match, `--${name} in ${selector}`).not.toBeNull();
  return match![1];
}

/** WCAG 2 contrast ratio of two #rrggbb colors */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Text on the backgrounds it sits on, in both palettes
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['ink', 'surface-2'],
  ['ink', 'gavel-tint'],
  ['ink', 'carried-tint'],
  ['ink', 'caution-tint'],
  ['ink-muted', 'paper'],
  ['ink-muted', 'surface'],
  ['ink-muted', 'surface-2'],
  ['ink-muted', 'gavel-tint'],
  ['gavel', 'paper'],
  ['gavel', 'surface'],
  ['gavel', 'surface-2'],
  ['gavel', 'gavel-tint'],
  ['carried', 'paper'],
  ['carried', 'surface'],
  ['carried', 'surface-2'],
  ['carried', 'carried-tint'],
  ['caution-ink', 'paper'],
  ['caution-ink', 'surface'],
  ['caution-ink', 'caution-tint'],
  // A primary button's label, and a success button's
  ['paper', 'gavel'],
  ['paper', 'carried'],
];

// Hover and active fills from the fixed scales, under the button's paper-colored label
const STATES: { palette: ':root' | '.dark'; utility: string; fill: string }[] = [
  { palette: ':root', utility: 'hover:bg-gavel-700', fill: 'gavel-700' },
  { palette: ':root', utility: 'active:bg-gavel-800', fill: 'gavel-800' },
  { palette: '.dark', utility: 'dark:hover:bg-gavel-300', fill: 'gavel-300' },
  { palette: '.dark', utility: 'dark:active:bg-gavel-200', fill: 'gavel-200' },
  { palette: ':root', utility: 'hover:bg-carried-700', fill: 'carried-700' },
  { palette: '.dark', utility: 'dark:hover:bg-carried-300', fill: 'carried-300' },
];

describe('contrast', () => {
  it.each(TEXT_PAIRS.flatMap(([text, on]) => [':root', '.dark'].map((p) => [text, on, p])))(
    '%s on %s is at least 4.5:1 (%s)',
    (text, on, palette) => {
      expect(contrast(value(palette, text), value(palette, on))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(STATES)(
    "keeps a button's label at 4.5:1 or more with $utility",
    ({ palette, utility, fill }) => {
      const utilities = `${block('@utility btn-primary')}${block('@utility btn-success')}`;
      expect(utilities).toContain(utility);
      const shade = new RegExp(`--color-${fill}: (#[0-9a-f]{6});`).exec(css)![1];
      expect(contrast(value(palette, 'paper'), shade)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('fades no button fill toward the page on hover or press', () => {
    expect(css).not.toMatch(/(hover|active):bg-(gavel|carried)\/\d+/);
  });
});

describe('design tokens', () => {
  it.each(Object.entries(BRIEF))('sets %s in both palettes', (name, [day, evening]) => {
    expect(block(':root')).toContain(`--${name}: ${day};`);
    expect(block('.dark')).toContain(`--${name}: ${evening};`);
  });

  it.each(Object.keys(BRIEF))('makes %s a Tailwind color that follows the palette', (name) => {
    expect(block('@theme inline')).toContain(`--color-${name}: var(--${name});`);
  });

  it('defines none of the old palette names: the app uses the tokens', () => {
    for (const name of ['primary', 'secondary', 'accent', 'success', 'danger']) {
      expect(css).not.toContain(`--color-${name}-`);
    }
  });

  it('sets the two typefaces', () => {
    expect(css).toContain("--font-heading: 'Fraunces Variable', Georgia, serif;");
    expect(css).toContain("--font-body: 'Public Sans', system-ui, sans-serif;");
  });

  it("switches Tailwind's own palette off, and the old meeting palette is gone", () => {
    expect(css).toContain('--color-*: initial;');
    expect(css).not.toContain('--color-meeting-');
  });
});
