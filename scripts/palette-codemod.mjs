#!/usr/bin/env node
/**
 * Moves web files off raw Tailwind palette classes onto the design tokens
 * (docs/design-brief.md). A one-off for MVP Phase B; deleted once no file needs it.
 *
 * Usage: node scripts/palette-codemod.mjs <file>...
 *
 * 1. Light and dark pairs of the compatibility palettes become one token that flips with the
 *    theme ("text-secondary-900 dark:text-white" -> "text-ink").
 * 2. Every raw palette class (gray, indigo, green, amber, red, blue, purple, orange), the old
 *    meeting palette, and white and black become a token, keeping their variant prefixes
 *    (hover:, focus:, disabled:...). A dark: variant of the meeting palette is dropped: the
 *    token already flips.
 * 3. Emoji used as icons are removed; the words next to them carry the meaning.
 *
 * A class with no mapping is left alone and reported; the command then exits with 1.
 */
import fs from 'node:fs';

const PAIRS = [
  // No gradients (docs/design-brief.md)
  ['bg-linear-to-r from-meeting-700 to-meeting-800', 'bg-gavel'],
  ['text-secondary-900 dark:text-white', 'text-ink'],
  ['hover:text-secondary-900 dark:hover:text-white', 'hover:text-ink'],
  ['text-secondary-800 dark:text-secondary-200', 'text-ink'],
  ['text-secondary-700 dark:text-secondary-200', 'text-ink'],
  ['text-secondary-700 dark:text-secondary-300', 'text-ink'],
  ['text-secondary-600 dark:text-secondary-400', 'text-ink-muted'],
  ['text-secondary-500 dark:text-secondary-400', 'text-ink-muted'],
  ['border-secondary-200 dark:border-secondary-700', 'border-rule'],
  ['border-secondary-300 dark:border-secondary-600', 'border-rule'],
  ['divide-secondary-100 dark:divide-secondary-700', 'divide-rule'],
  ['hover:bg-secondary-50 dark:hover:bg-secondary-800/50', 'hover:bg-surface-2'],
  ['hover:bg-secondary-50 dark:hover:bg-secondary-700', 'hover:bg-surface-2'],
  ['hover:bg-secondary-50 dark:hover:bg-secondary-600', 'hover:bg-surface-2'],
  ['hover:bg-secondary-100 dark:hover:bg-secondary-700', 'hover:bg-surface-2'],
  ['hover:bg-secondary-200 dark:hover:bg-secondary-700', 'hover:bg-rule'],
  ['bg-white dark:bg-secondary-800', 'bg-surface'],
  ['bg-white dark:bg-secondary-700', 'bg-surface'],
  ['bg-white dark:bg-secondary-900', 'bg-surface'],
  ['bg-white/80 dark:bg-secondary-900/80', 'bg-paper/80'],
  ['bg-secondary-50 dark:bg-secondary-900', 'bg-paper'],
  ['bg-secondary-50 dark:bg-secondary-800/50', 'bg-surface-2'],
  ['bg-secondary-50 dark:bg-secondary-800', 'bg-surface-2'],
  ['bg-secondary-100 dark:bg-secondary-800', 'bg-surface-2'],
  ['bg-secondary-100 dark:bg-secondary-700', 'bg-surface-2'],
  ['text-primary-600 dark:text-primary-400', 'text-gavel'],
  ['text-danger-600 dark:text-danger-400', 'text-gavel'],
  ['bg-primary-50 dark:bg-primary-900/20', 'bg-gavel-tint'],
  ['bg-primary-50 dark:bg-primary-900/30', 'bg-gavel-tint'],
  ['bg-primary-100 dark:bg-primary-900/30', 'bg-gavel-tint'],
  ['bg-success-100 dark:bg-success-900/30', 'bg-carried-tint'],
  ['bg-accent-100 dark:bg-accent-900/30', 'bg-caution-tint'],
  ['bg-danger-100 dark:bg-danger-900/30', 'bg-gavel-tint'],
  ['bg-danger-50 dark:bg-danger-900/20', 'bg-gavel-tint'],
  // Page titles (after the pair that makes their color text-ink)
  ['text-2xl font-heading font-bold text-ink', 'page-title'],
];

// Compatibility classes, as whole class tokens with their variant prefix, that would read wrong
// in the evening palette: light-only text colors, and fills under white text (white text becomes
// paper, which flips, so the fill must flip too). Applied after PAIRS. An empty replacement
// drops the class.
const TOKENS = {
  'text-primary-600': 'text-gavel',
  'text-primary-700': 'text-gavel',
  'hover:text-primary-600': 'hover:text-gavel',
  'hover:text-primary-700': 'hover:text-gavel',
  'group-hover:text-primary-600': 'group-hover:text-gavel',
  'text-danger-500': 'text-gavel',
  'text-danger-600': 'text-gavel',
  'text-danger-700': 'text-gavel',
  'text-success-600': 'text-carried',
  'text-success-700': 'text-carried',
  'text-accent-600': 'text-caution-ink',
  'text-accent-700': 'text-caution-ink',
  'text-secondary-400': 'text-ink-muted',
  'text-secondary-500': 'text-ink-muted',
  'hover:text-secondary-600': 'hover:text-ink',
  'hover:text-secondary-700': 'hover:text-ink',
  'bg-primary-600': 'bg-gavel',
  'bg-primary-700': 'bg-gavel/90',
  'hover:bg-primary-700': 'hover:bg-gavel/90',
  'focus:bg-primary-600': 'focus:bg-gavel',
  'bg-success-500': 'bg-carried',
  'bg-success-600': 'bg-carried',
  'hover:bg-success-600': 'hover:bg-carried/90',
  'hover:bg-success-700': 'hover:bg-carried/90',
  'bg-accent-500': 'bg-gavel',
  'bg-accent-600': 'bg-gavel',
  'hover:bg-accent-600': 'hover:bg-gavel/90',
  'hover:bg-accent-700': 'hover:bg-gavel/90',
  'bg-danger-500': 'bg-gavel',
  'hover:bg-danger-600': 'hover:bg-gavel/90',
  'bg-secondary-600': 'bg-ink',
  'hover:bg-secondary-700': 'hover:bg-ink/90',
  'disabled:bg-secondary-300': 'disabled:bg-rule',
  'dark:disabled:bg-secondary-600': '',
  'dark:disabled:bg-secondary-700': '',
};

// Raw palette class (without variant prefix) -> token class
const SINGLES = {
  // Neutrals
  'text-gray-900': 'text-ink',
  'text-gray-800': 'text-ink',
  'text-gray-700': 'text-ink',
  'text-gray-600': 'text-ink-muted',
  'text-gray-500': 'text-ink-muted',
  'text-gray-400': 'text-ink-muted',
  'bg-gray-50': 'bg-surface-2',
  'bg-gray-100': 'bg-surface-2',
  'bg-gray-200': 'bg-rule',
  'bg-gray-300': 'bg-rule',
  'bg-gray-400': 'bg-ink-muted',
  'bg-gray-500': 'bg-ink-muted',
  'bg-gray-600': 'bg-ink',
  'bg-gray-700': 'bg-ink/90',
  'border-gray-200': 'border-rule',
  'border-gray-300': 'border-rule',
  'border-gray-400': 'border-ink-muted',
  'ring-gray-400': 'ring-ink-muted',
  'ring-gray-500': 'ring-gavel',
  // Actions and the current item: the gavel
  'bg-indigo-500': 'bg-gavel',
  'bg-indigo-600': 'bg-gavel',
  'bg-indigo-700': 'bg-gavel/90',
  'bg-indigo-800': 'bg-gavel/80',
  'bg-blue-500': 'bg-gavel',
  'bg-blue-600': 'bg-gavel',
  'bg-blue-700': 'bg-gavel/90',
  'bg-red-500': 'bg-gavel',
  'bg-red-600': 'bg-gavel',
  'bg-red-700': 'bg-gavel/90',
  'bg-red-800': 'bg-gavel/80',
  'bg-amber-500': 'bg-gavel',
  'bg-amber-600': 'bg-gavel',
  'bg-amber-700': 'bg-gavel/90',
  'bg-indigo-50': 'bg-gavel-tint',
  'bg-indigo-100': 'bg-gavel-tint',
  'bg-blue-50': 'bg-gavel-tint',
  'bg-blue-100': 'bg-gavel-tint',
  'bg-purple-50': 'bg-gavel-tint',
  'bg-red-50': 'bg-gavel-tint',
  'bg-red-100': 'bg-gavel-tint',
  'bg-red-200': 'bg-gavel-tint',
  'text-indigo-400': 'text-gavel',
  'text-indigo-500': 'text-gavel',
  'text-indigo-600': 'text-gavel',
  'text-indigo-700': 'text-gavel',
  'text-indigo-800': 'text-ink',
  'text-indigo-900': 'text-ink',
  'text-blue-500': 'text-gavel',
  'text-blue-600': 'text-gavel',
  'text-blue-700': 'text-ink',
  'text-blue-800': 'text-ink',
  'text-blue-900': 'text-ink',
  'text-purple-600': 'text-gavel',
  'text-purple-700': 'text-ink',
  'text-purple-800': 'text-ink',
  'text-red-400': 'text-gavel',
  'text-red-600': 'text-gavel',
  'text-red-700': 'text-gavel',
  'text-red-800': 'text-ink',
  'border-indigo-200': 'border-rule',
  'border-indigo-300': 'border-rule',
  'border-indigo-400': 'border-gavel',
  'border-indigo-500': 'border-gavel',
  'border-indigo-600': 'border-gavel',
  'border-blue-200': 'border-rule',
  'border-blue-300': 'border-rule',
  'border-purple-300': 'border-rule',
  'border-red-200': 'border-gavel/30',
  'border-red-300': 'border-gavel/30',
  'border-red-400': 'border-gavel',
  'border-red-600': 'border-gavel',
  'ring-indigo-500': 'ring-gavel',
  'ring-blue-400': 'ring-gavel',
  'ring-red-300': 'ring-gavel/30',
  'ring-red-500': 'ring-gavel',
  'ring-amber-500': 'ring-gavel',
  'ring-green-500': 'ring-gavel',
  // Carried, elected, present
  'bg-green-50': 'bg-carried-tint',
  'bg-green-100': 'bg-carried-tint',
  'bg-green-500': 'bg-carried',
  'bg-green-600': 'bg-carried',
  'bg-green-700': 'bg-carried/90',
  'bg-green-800': 'bg-carried/80',
  'text-green-600': 'text-carried',
  'text-green-700': 'text-carried',
  'text-green-800': 'text-ink',
  'text-green-900': 'text-ink',
  'border-green-200': 'border-carried/40',
  'border-green-300': 'border-carried/40',
  'border-green-400': 'border-carried',
  'border-green-600': 'border-carried',
  'ring-green-300': 'ring-carried/40',
  // Caution: no quorum, time running out, a pending second
  'bg-amber-50': 'bg-caution-tint',
  'bg-amber-100': 'bg-caution-tint',
  'bg-orange-100': 'bg-caution-tint',
  'text-amber-600': 'text-caution-ink',
  'text-amber-700': 'text-caution-ink',
  'text-amber-800': 'text-ink',
  'text-amber-900': 'text-ink',
  'text-orange-800': 'text-ink',
  'border-amber-200': 'border-caution/40',
  'border-amber-300': 'border-caution/40',
  'border-amber-400': 'border-caution',
  'border-amber-500': 'border-caution',
  // The old meeting palette
  'bg-meeting-50': 'bg-gavel-tint',
  'bg-meeting-100': 'bg-gavel-tint',
  'bg-meeting-600': 'bg-gavel',
  'bg-meeting-600/80': 'bg-gavel/80',
  'bg-meeting-700': 'bg-gavel/90',
  'text-meeting-200': 'text-paper/80',
  'text-meeting-500': 'text-gavel',
  'text-meeting-600': 'text-gavel',
  'text-meeting-700': 'text-gavel',
  'text-meeting-800': 'text-ink',
  'text-meeting-900': 'text-ink',
  'border-meeting-200': 'border-gavel/30',
  'border-meeting-300': 'border-gavel/30',
  'border-meeting-500': 'border-gavel',
  'border-meeting-600': 'border-gavel',
  'ring-meeting-400': 'ring-gavel',
  'ring-meeting-500': 'ring-gavel',
  'from-meeting-700': 'from-gavel',
  'to-meeting-800': 'to-gavel',
  // White and black
  'bg-white': 'bg-surface',
  'bg-white/20': 'bg-paper/20',
  'bg-white/30': 'bg-paper/30',
  'bg-white/80': 'bg-paper/80',
  'text-white': 'text-paper',
  'text-white/80': 'text-paper/80',
  'bg-black/50': 'bg-ink-900/50',
  'bg-black/70': 'bg-ink-900/70',
};

// Under dark:, a token already flips, so white text is ink and a white background is surface
const DARK_SINGLES = { 'text-white': 'text-ink', 'bg-white': 'bg-surface' };

const CLASS =
  /(?<![\w-])((?:[a-z-]+:)*)((?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|decoration|placeholder|shadow)(?:-[trblxy])?-(?:(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|meeting)-\d{2,3}|white|black)(?:\/\d+)?)(?![\w-])/g;

// Emoji used as icons (the ranges scripts/check-palette.sh rejects): one in a span of its own
// goes with the span, and one before a word goes with the space after it
const PICTOGRAPH =
  '[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{26FF}\\u{2705}\\u{270B}\\u{23F0}-\\u{23FA}]\\u{FE0F}?';
const EMOJI = new RegExp(`<span[^>]*>\\s*${PICTOGRAPH}\\s*</span>\\s*|${PICTOGRAPH} ?`, 'gu');

// Stands in for a dropped class until its space is taken out (a private-use character)
const DROP = '\uE000';

let unmapped = 0;
for (const file of process.argv.slice(2)) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of PAIRS) text = text.split(from).join(to);
  for (const [from, to] of Object.entries(TOKENS)) {
    const token = new RegExp(`(?<![^\\s"'\`])${from.replace(/[/]/g, '\\/')}(?![^\\s"'\`])`, 'g');
    text = text.replace(token, to || DROP);
  }
  text = text.replace(CLASS, (match, prefix, base) => {
    if (prefix.includes('dark:')) {
      if (base.includes('-meeting-')) return DROP;
      if (DARK_SINGLES[base]) return prefix + DARK_SINGLES[base];
    }
    if (SINGLES[base]) return prefix + SINGLES[base];
    console.error(`${file}: no mapping for ${match}`);
    unmapped++;
    return match;
  });
  // A dropped class takes one space with it
  text = text.replace(new RegExp(` ?${DROP} ?`, 'g'), (m) =>
    m.startsWith(' ') && m.endsWith(' ') ? ' ' : '',
  );
  text = text.replace(EMOJI, '');
  fs.writeFileSync(file, text);
}
process.exitCode = unmapped > 0 ? 1 : 0;
