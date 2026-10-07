#!/usr/bin/env bash
# Fails when a web source file uses a raw Tailwind palette class (gray-, blue-, indigo-, ...),
# white or black, the retired meeting- palette, or an emoji as an icon, outside the allowlist.
# The design tokens in frontend-unified/src/styles/index.css replace them (docs/design-brief.md).
# The shared package's constants, reducer and utils are scanned too: their text (log lines,
# labels) reaches the screens, the meeting log and the minutes, so it carries no emoji either.
#
# The allowlist (scripts/palette-allowlist.txt) names files still waiting to move onto the
# tokens. It only shrinks: a listed file that no longer needs it fails the check too.
#
# Usage: bash scripts/check-palette.sh (npm run lint runs it)
set -euo pipefail
cd "$(dirname "$0")/.."

export LC_ALL=C.UTF-8
SRC=frontend-unified/src
# Not shared/dist (built) or the tests
SHARED=(shared/constants shared/reducer shared/utils)
ALLOWLIST=scripts/palette-allowlist.txt

PALETTE='(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|decoration|placeholder|shadow)(?:-[trblxy])?-(?:(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|meeting)-\d{2,3}|white|black)(?:/\d+)?(?![\w-])'
# Any pictograph (Unicode's Extended_Pictographic: the emoji blocks, the dingbats and the symbols
# such as U+2B50, U+2728, U+2696 and U+23F0, and arrows like U+2195), and the emoji variation
# selector U+FE0F. The copyright, registered and trademark signs are pictographic too, but text.
EMOJI='(?![\x{A9}\x{AE}\x{2122}])\p{Extended_Pictographic}|\x{FE0F}'

offending=$(grep -rlP "$PALETTE|$EMOJI" "$SRC" "${SHARED[@]}" --include='*.ts' --include='*.tsx' --include='*.css' \
  --exclude-dir=__tests__ | sort || true)
allowed=$(grep -v '^\s*\(#.*\)\?$' "$ALLOWLIST" | sort || true)

status=0
new=$(comm -23 <(printf '%s\n' "$offending" | sed '/^$/d') <(printf '%s\n' "$allowed" | sed '/^$/d'))
if [ -n "$new" ]; then
  echo "Raw palette classes or emoji icons (use the tokens in $SRC/styles/index.css):"
  for file in $new; do
    grep -noP "$PALETTE|$EMOJI" "$file" | sed "s|^|  $file:|"
  done
  status=1
fi
clean=$(comm -13 <(printf '%s\n' "$offending" | sed '/^$/d') <(printf '%s\n' "$allowed" | sed '/^$/d'))
if [ -n "$clean" ]; then
  echo "These files no longer need the allowlist; remove them from $ALLOWLIST:"
  printf '  %s\n' $clean
  status=1
fi
count=$(printf '%s\n' "$allowed" | sed '/^$/d' | wc -l)
if [ "$status" -eq 0 ]; then
  echo "Palette check passed ($count files on the allowlist)."
fi
exit $status
