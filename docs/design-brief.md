# Robbie design brief

Adopted 2026-10-06 for MVP Phase B and everything after. This is the one visual language for the whole app: the documents side, the live meeting screens and the sign-in pages. New screens are built on it; existing screens move onto it as they are touched.

## The idea: the clerk's ledger

Robbie runs meetings of ordinary associations, often in a clubhouse at night, often when people disagree. The interface should feel like a well-kept minute book: paper, ink, a rubber stamp for decisions, and one authoritative voice for "the question before the assembly". Calm, legible from the back of the room, and nothing that looks like a software dashboard.

Three things people should remember:

1. **The question card.** Whatever is pending (a motion, an amendment, an election) is always shown the same way, in the serif, large, with "moved by" and "seconded by" under it. It is the center of the chair console, the top of the phone view, and the whole display.
2. **The stamp.** When a vote closes, the result lands as a stamp: CARRIED or FAILED (or ELECTED), rotated a few degrees, with the tally beneath it. It is the only piece of theater in the app.
3. **Attendance you can read from the door.** Present, quorum, met or not, as three large numbers wherever attendance matters.

## Typography

Two typefaces, self-hosted through `@fontsource` packages (no third-party font requests):

- **Fraunces** (variable, optical size axis): headings, the question card, results, the display view. Use the `SOFT` axis lightly (around 50) for warmth at large sizes. Weights 500 to 700.
- **Public Sans**: all UI text, forms, tables, labels. It is the US Web Design System typeface: civic and plain. Weights 400, 500, 600. Use `font-variant-numeric: tabular-nums` for counts, timers and codes; the meeting code is Public Sans 600 with 0.12em tracking, not a monospace.

Scale (rem): 0.75 (labels), 0.875 (secondary text), 1 (body), 1.125, 1.375 (card titles), 1.75 (page titles), 2.5 (the question on a laptop). Display view at 1080p: the question 72px, secondary lines 40px, attendance numbers 96px, labels 28px. Line height 1.2 for the serif at large sizes, 1.5 for body.

Labels (badges, section headers like "Attendance") are Public Sans 600, 0.75rem, uppercase, 0.08em tracking, muted ink.

## Color

Tokens replace the current `primary`, `secondary`, `accent` and `meeting` palettes in `frontend-unified/src/styles/index.css`. The names below are the new tokens; `primary-*` is remapped to `gavel-*` and `secondary-*` to `ink-*` so existing utility classes keep working while screens migrate.

| Token          | Light (day session) | Dark (evening session) | Use                                                   |
| -------------- | ------------------- | ---------------------- | ----------------------------------------------------- |
| `paper`        | `#F7F3EC`           | `#15130F`              | page background                                       |
| `surface`      | `#FFFDF9`           | `#1F1C17`              | cards, panels                                         |
| `surface-2`    | `#F1EBE1`           | `#282420`              | sidebar, inset areas                                  |
| `ink`          | `#1C1A17`           | `#F3EEE6`              | text                                                  |
| `ink-muted`    | `#5B564E`           | `#A8A094`              | secondary text, labels                                |
| `rule`         | `#E4DDD1`           | `#332E27`              | borders, dividers                                     |
| `gavel`        | `#8B2E25`           | `#E0604A`              | primary actions, the current item marker, focus rings |
| `gavel-tint`   | `#F6E6E2`           | `#3A1F1B`              | selected and hover backgrounds                        |
| `carried`      | `#2F6B45`           | `#5DBB7A`              | carried, elected, present, connected                  |
| `carried-tint` | `#E3EFE5`           | `#1E3326`              |                                                       |
| `caution`      | `#B7791F`           | `#E0A530`              | no quorum, timers running out, pending second         |
| `caution-tint` | `#FBF0DC`           | `#3A2E14`              |                                                       |

Failed results are not red. They are ink on paper with the word FAILED; the stamp carries the meaning. Red is reserved for the gavel (actions and the pending question) and for destructive confirmations.

Contrast: every text and background pair above meets 4.5:1; large display text meets 7:1. Focus rings are 2px `gavel` with a 2px paper offset.

The sidebar is `surface-2` with `ink` text and a `gavel` left bar on the active item, not a blue block.

## Surfaces and components

- **Cards**: `surface` on `paper`, a 1px `rule` border, 12px radius, no drop shadow. Panels inside the console use a 2px top rule in `gavel` only for the question card.
- **Buttons**: primary is filled `gavel` with paper text; secondary is a 1px `ink` outline; ghost is text in `gavel`. Height 40px on laptops, 56px on phones for the primary vote and second buttons. Radius 8px. No gradients.
- **Text links**: `gavel`, underlined on hover (`hover:underline`).
- **Badges**: label style above, in a `tint` background: role badges (Chair, Admin, Member, Guest), status badges (Draft, Proposed, Adopted), presence (Present, Marked present, Absent).
- **The question card**: a `surface` card with a 2px `gavel` top rule, the kind of question as a label ("Main motion", "Amendment", "Election for Director"), the text in Fraunces 2.5rem (laptop) or 1.5rem (phone), then "Moved by Alice Brennan, seconded by Ben Whitaker" in Public Sans muted, then the vote required ("Majority", "Two thirds").
- **The stamp**: a bordered box (3px `carried` or `ink`), Fraunces 700 uppercase, rotated -4 degrees, `transform: scale(1.2)` to `scale(1)` with a 180ms ease-out and a 60ms opacity fade, over the tally line ("On devices 12 to 3, in the room 9 to 2: 21 to 5"). On the display it fills a third of the screen.
- **Attendance block**: three numbers in Fraunces (present, needed, eligible) with labels beneath, and a `carried` or `caution` line of text ("Quorum met", "Need 4 more").
- **Timers**: a 2px progress line in `caution` under the speaker's name, with the remaining time in tabular numerals.
- **Empty states**: one line of Public Sans in muted ink and one action, no illustration.

## Motion

- One orchestrated reveal when a screen mounts: panels fade and rise 8px with 40ms stagger, 240ms ease-out. Nothing else animates on load.
- The stamp (above) and the vote-in-progress counts (a 1.6s pulse on the numbers) are the only continuous animations.
- State changes that arrive over the socket (a new motion, a vote opening) crossfade the question card over 200ms; they never slide or bounce.
- `prefers-reduced-motion` turns all of it off except the crossfade.

## The three screens

**Chair console** (laptop, 1280px and up). A 12-column grid under a 56px top bar. Top bar: meeting title (Fraunces), the stage as a label, elapsed time, the attendance summary as a chip ("38 present, quorum 29, met"), and two buttons: Display and Join info. Columns 1 to 8, "Now": the current agenda item (one line with its attachments as links), the question card with a toolbar of the actions that are in order right now (never a wall of every button), the vote panel (device counts, the floor tally fields, Close), the speaker queue with Recognize and Yield. Columns 9 to 12: the attendance panel (block plus the roster list with Mark present and Mark absent, and the headcount field), the agenda (Call and Complete), nominations and elections, and a "More" disclosure for proxies, settings and the log. The chair script line sits under the question card in muted ink and can be hidden.

**Phone view** (360px and up). A single column. A sticky header with the meeting title and the current item. The question card. Then exactly one action block for the moment: three 56px vote buttons; or Second; or Raise hand with For, Against and Neutral; or Nominate; or the ballot. Below: the queue, the agenda, and the last result. Guests see a Guest badge in the header and no action block except Request the floor and Ask the chair. Bottom safe-area padding on iOS.

**Display view** (1080p and 4K, always the dark palette). Full-bleed paper-grain background (an SVG noise overlay at 4% opacity over `paper`). Before the meeting: the organization and meeting title, then a two-column block: the join link and code on the left with the QR on the right (QR on a white tile, 360px), and the attendance block beneath. In session: the question card fills the center at 72px with the agenda item above it in muted ink; a left rail shows the speaker queue when there is debate, with the recognized speaker and the timer; a bottom band shows attendance and the vote in progress (votes received, floor tally); the stamp takes over the center when a result lands and stays until the next question. Adjourned: "Adjourned at 8:42 PM", the count of items decided, and where to find the minutes. Nothing on the display is interactive.

## Rules of the road for implementers

- No raw Tailwind palette classes (`gray-`, `blue-`, `indigo-`, `green-`); use the tokens. The ESLint rule `tailwindcss/no-custom-classname` is not used, so this is checked in review and by a grep in CI (`scripts/check-palette.sh`, added in Phase B).
- No emoji as icons; lucide only, 16px in text, 20px in buttons, 32px on the display.
- Every screen works in both palettes; test dark mode on the display, which is dark-only.
- Keep the voice: labels are nouns ("Attendance", "Agenda"), buttons are verbs ("Call to order", "Open the vote", "Mark present"), results are declarations ("Carried", "Failed", "Elected"). Robert's Rules terms are used as they are in the book: "the question", "second", "yield", "recognize".
