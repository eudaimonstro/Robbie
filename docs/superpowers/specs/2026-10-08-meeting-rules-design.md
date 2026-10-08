# Meeting rules: fewer motions, each correct end to end

Batch A2 of the 2026-10-08 review (meeting-rules.md C1-C4, I1-I6, I8, I10, I13, M3, M4, M6, M8, M9, M10; screens.md I1, I3, I8, M4, M6, M7, P1; product.md 1.8, 4.2-4.4). Elections, vote thresholds beyond a majority or two thirds of votes cast, and voice votes declared without counts are batch A3.

## Decision

Robbie offers the motions an HOA meeting uses and makes each one do what Robert's Rules (12th ed.) says, on every screen and in the minutes. The rest are hidden: not offered on any screen, refused by the server with a plain reason. Their definitions stay in `MOTIONS` (saved states and old records name them); their reducer effects go.

| Kept | What adoption does |
| --- | --- |
| Main motion, Amend the bylaws | Decided; recorded with its text as amended (bylaw amendments can't be amended, as A1 decided) |
| Adopt / amend the agenda (after an objection) | The agenda is adopted or changed; minuted |
| Amend, Amend the amendment | Rewrites the words of the motion beneath it (insert, strike, strike and insert, or replace the whole text). What is voted, stamped and minuted is the amended text |
| Close debate (previous question, two thirds) | Debate on the immediately pending question ends: no hands, no recognition, no further subsidiary motion on it |
| Postpone (to later in this meeting, or to the next meeting) | The main motion and anything adhering leave the floor. Later in this meeting: the chair takes it up again (Take up). Next meeting: recorded as postponed, listed in the minutes for the next agenda |
| Postpone indefinitely | The main motion leaves the floor, recorded as postponed indefinitely |
| Refer (to a committee or the board) | The main motion and anything adhering leave the floor, recorded as referred, with the pending amendments named |
| Recess (optional time to resume) | The meeting is in recess; the chair resumes it; pending business resumes where it was; minuted with both times |
| Adjourn | The motion carries and the chair declares the meeting adjourned (the next step, the only one in order); pending business is recorded as unfinished. With nothing pending the chair adjourns without a motion, as today |
| Withdraw | Before the question is stated (awaiting a second) the mover withdraws it at once. After, the mover asks (phone: "Withdraw my motion"; console: "The mover asks to withdraw it" for someone without a phone); the request is a question the chair puts by unanimous consent or a vote |
| Point of order | The chair rules: well taken, well taken and the motion is out of order (removed, with a record), or not well taken. In order during a vote and while a motion awaits a second |
| Appeal from the chair's ruling | Voted (yes sustains the chair; a tie sustains). Reversing an out-of-order ruling puts the motion back |
| Request for information, parliamentary inquiry, question of privilege | Questions to the chair ("Ask the chair"), answered by the chair, not minuted |
| Division of the assembly | While a voice vote is open, any member (or the chair for someone in the room) calls for a division: the vote becomes a counted vote, on devices and in the room |
| Unanimous consent | The chair asks on the pending question (the request names it). An objection (from a phone, or recorded from the floor) means the chair puts it to a vote. The request ends whenever a vote opens, a motion is made or the question changes |

Hidden: lay on the table, take from the table, reconsider, rescind, suspend the rules, divide the question, objection to consideration, call for the orders of the day, fix the time to adjourn to, limit or extend debate, and the point of information and question of privilege as motions (they are questions to the chair now).

## Precedence (one rule, shared)

`motionOutOfOrder(state, type)` in shared returns why a motion can't be made now, or null; `getValidMotions` is the offered motions it allows, and the validator calls it, so the screens and the server agree.

- Nothing is made while the meeting is not in session or after an adjournment has carried. In recess only the chair acts: Resume, or adjourn (a recess nobody returns from).
- A point of order is in order at any time in session (during a vote, while a motion awaits a second), unless one is already before the chair. While one is, nothing else is made, seconded or voted until the chair rules.
- During a vote nothing else is made. While a motion awaits a second nothing else is made.
- An appeal is in order only immediately after a ruling.
- An election holds the floor: only adjourn, recess and a point of order interrupt it.
- Main motions: only with nothing pending, and only once the agenda is adopted.
- Subsidiary motions apply to a pending motion and must outrank it (equal rank is refused: one primary amendment at a time). Amend applies to a main motion, amend the amendment to an amendment that inserts words, postpone, postpone indefinitely and refer to a main motion (with its amendments), close debate to any debatable question. Amending a recess time or a postponement is not offered (move it again instead). After debate is closed on a question, no further subsidiary motion applies to it.
- Privileged motions (recess, adjourn) outrank the pending question.

## Debate

The mover speaks first only if they claim it (are in the queue). Otherwise the chair recognizes anyone. Members can change sides. Members and guests can ask for the floor whenever the meeting is in session, nothing is being voted on and the pending question (if any) is debatable and open: during an open forum or questions on a report too. The queue ends with the agenda item and when a question is stated.

## Records and minutes

New dispositions: `postponed` (with `postponedTo`), `postponed-indefinitely`, `referred` (with `referredTo`), `out-of-order`; records carry `originalText` when amended, `pendingAmendments` when disposed of with amendments pending, and `division`. Points of order are minuted with who raised them and the ruling; inquiries and requests are not. The agenda's adoption (without objection, or on a motion) opens the proceedings. A recess is minuted with when it began and ended. A vote taken without a quorum says it has no effect unless ratified. Motions postponed to the next meeting are listed at the end, for the next agenda; motions postponed to later in the meeting and not taken up are unfinished business.

The bylaw sync acts only on bylaw amendments carried, failed or adopted by unanimous consent, not on one postponed, referred, withdrawn or ruled out of order.

## Quorum

Without a quorum the console's question area and the display say "No quorum" in caution. Open the vote asks the chair to confirm ("There is no quorum. Business done now is not valid. Open the vote anyway?"); the server refuses `OPEN_VOTING` without a quorum unless confirmed (adjourn and recess need no confirmation). The minutes record it.

## Screens

- `chairActions` returns the chair's real next step as the primary: Recognize the first waiting while debate is open (End the turn while someone speaks), Approve as read during the minutes item, the election's next step (Close nominations, Open the ballot, Close the ballot, Declare X elected), Declare the meeting adjourned after an adjournment carries, Resume during a recess. The speaker queue sits right under the question card.
- From the floor (the chair records what people without phones do): a motion of any kind in order now, with the same detail fields as the phone (amend, postpone, refer, recess, point of order), a second, an objection to unanimous consent, a mover's request to withdraw, a call for a division.
- The display stamps ELECTED when the chair declares it; before that it shows the ballot's count and who has the vote required. "Awaiting a second" is a 28px label. During a vote it says how to vote. Recess and an adjournment that carried are shown plainly.
- Phones: Yes, No, Abstain; "Object" for unanimous consent; the screen reader hears a motion awaiting your second, debate opening and "You have the floor" (with a short vibration where supported); "Withdraw my motion" for the mover; Other motions is the kept set.
- The vote timer is advisory: the chair sees it and "Time is up" at 0:00; phones and the display don't show it.
- Hidden: the proxy panels (console and phone), the console's Order of business and Committee reports panels. "Put the item to a vote" becomes "Put a question", where the chair writes the question (a report needs none).

## Not changed

The socket protocol for existing actions, the publisher, the action handler (the adjournment's minutes are still drafted on `END_MEETING`, which is why an adjournment that carries is declared by the chair in a second step), elections' rules, vote thresholds, voice votes needing a count.

## New actions

`TAKE_UP_POSTPONED { motionId }`, `RESUME_MEETING`, `REQUEST_DIVISION { requesterId, fromFloor? }`; `WITHDRAW_MOTION` gains `fromFloor`, `OBJECT_TO_CONSENT` gains `fromFloor`, `OPEN_VOTING` gains `confirmedWithoutQuorum`, `CHAIR_RULING` gains `outOfOrder`, `ASK_INQUIRY` gains the `privilege` kind, `MAKE_MOTION`/`MAKE_FLOOR_MOTION` gain `textAmendment`, `postponeTo`, `referTo`, `recessUntil`. A flag `fromFloor` marks what the chair records for someone else; the person named is never the sender (the enricher sets the sender), so it is a name field the validator checks, not an actor field. New state fields are read with a default (`state.recess ?? null`), as live meetings saved before them have none. Each new action has its reducer and validator cases, a `PERMISSIONS` entry, an `ACTOR_FIELDS` entry and a schema.
