/** What the minutes editor's formatting buttons do, in Markdown underneath */
export type MarkdownFormat = 'heading' | 'bold' | 'list';

/** The text after a formatting button, and the selection to put back */
export interface Formatted {
  text: string;
  start: number;
  end: number;
}

const lineStart = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;
const lineEnd = (text: string, at: number) => {
  const end = text.indexOf('\n', at);
  return end === -1 ? text.length : end;
};

/**
 * Apply a formatting button to the selection (start to end) of the minutes text: Bold wraps it
 * in ** (a placeholder word when nothing is selected), Heading makes its line a heading (or a
 * heading back into a line), List starts each of its lines with "- " (or takes the dashes off
 * when every line has one). The secretary sees the result in the preview, not the marks.
 */
export function applyFormat(
  text: string,
  start: number,
  end: number,
  format: MarkdownFormat,
): Formatted {
  if (format === 'bold') {
    const selected = text.slice(start, end);
    const inner = selected || 'bold text';
    return {
      text: `${text.slice(0, start)}**${inner}**${text.slice(end)}`,
      start: start + 2,
      end: start + 2 + inner.length,
    };
  }

  if (format === 'heading') {
    const from = lineStart(text, start);
    const line = text.slice(from, lineEnd(text, from));
    const marks = line.match(/^#{1,6} /)?.[0] ?? '';
    // A level-two heading turns back into a line; any other line (or heading) becomes one
    const next = marks === '## ' ? '' : '## ';
    const delta = next.length - marks.length;
    return {
      text: `${text.slice(0, from)}${next}${text.slice(from + marks.length)}`,
      start: Math.max(from, start + delta),
      end: Math.max(from, end + delta),
    };
  }

  const from = lineStart(text, start);
  const to = lineEnd(text, Math.max(start, end - (end > start && text[end - 1] === '\n' ? 1 : 0)));
  const lines = text.slice(from, to).split('\n');
  const listed = lines.filter((line) => line.trim() !== '').every((line) => line.startsWith('- '));
  const block = lines
    .map((line) => (listed ? line.replace(/^- /, '') : line.trim() === '' ? line : `- ${line}`))
    .join('\n');
  return {
    text: `${text.slice(0, from)}${block}${text.slice(to)}`,
    start: from,
    end: from + block.length,
  };
}
