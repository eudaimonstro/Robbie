/** A stretch of text in a comparison: in both, only in the old text, or only in the new */
export interface DiffPart {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/** Above this many token pairs the comparison gives up and shows the whole old and new text */
const MAX_PAIRS = 4_000_000;

/** Words and the whitespace between them, each a token, so whitespace is kept as written */
const tokens = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

const isSpace = (text: string) => /^\s+$/.test(text);

/**
 * The old and new text compared word by word, so that "twenty percent (20%)" becoming "fifteen
 * percent (15%)" shows just those words changed rather than two whole paragraphs. A change of
 * several words separated only by spaces reads as one: the old words, then the new.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ kind: 'same', text: before }] : [];
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > MAX_PAIRS) {
    return [
      ...(before ? [{ kind: 'removed' as const, text: before }] : []),
      ...(after ? [{ kind: 'added' as const, text: after }] : []),
    ];
  }

  // The longest common subsequence of tokens, from the end: lcs[i][j] for a[i..], b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const raw: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      raw.push({ kind: 'added', text: b[j++] });
    } else {
      raw.push({ kind: 'removed', text: a[i++] });
    }
  }

  // Runs of changes (with only spaces in common between them) become one removal and one
  // addition; unchanged text in between is kept as it is
  const parts: DiffPart[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].kind === 'same') {
      push(parts, raw[k++]);
      continue;
    }
    let removed = '';
    let added = '';
    while (k < raw.length) {
      const part = raw[k];
      if (part.kind === 'removed') removed += part.text;
      else if (part.kind === 'added') added += part.text;
      else if (isSpace(part.text) && raw[k + 1] && raw[k + 1].kind !== 'same') {
        // A space between two changes belongs to both sides
        removed += part.text;
        added += part.text;
      } else break;
      k++;
    }
    if (removed) push(parts, { kind: 'removed', text: removed });
    if (added) push(parts, { kind: 'added', text: added });
  }
  return parts;
}

/** Add a part, joined to the one before when it is of the same kind */
function push(parts: DiffPart[], part: DiffPart) {
  const last = parts[parts.length - 1];
  if (last && last.kind === part.kind) last.text += part.text;
  else parts.push({ ...part });
}
