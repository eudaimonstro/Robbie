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
  gavel: ['#8b2e25', '#e0604a'],
  'gavel-tint': ['#f6e6e2', '#3a1f1b'],
  carried: ['#2f6b45', '#5dbb7a'],
  'carried-tint': ['#e3efe5', '#1e3326'],
  caution: ['#b7791f', '#e0a530'],
  'caution-tint': ['#fbf0dc', '#3a2e14'],
};

describe('design tokens', () => {
  it.each(Object.entries(BRIEF))('sets %s in both palettes', (name, [day, evening]) => {
    expect(block(':root')).toContain(`--${name}: ${day};`);
    expect(block('.dark')).toContain(`--${name}: ${evening};`);
  });

  it.each(Object.keys(BRIEF))('makes %s a Tailwind color that follows the palette', (name) => {
    expect(block('@theme inline')).toContain(`--color-${name}: var(--${name});`);
  });

  it('keeps the old palette names working, on the new scales', () => {
    expect(css).toContain('--color-primary-600: var(--color-gavel-600);');
    expect(css).toContain('--color-secondary-900: var(--color-ink-900);');
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
