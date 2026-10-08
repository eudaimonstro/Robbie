# Elections, vote thresholds and voice votes

Batch A3 of the 2026-10-08 review (meeting-rules.md I7, I11, I12, M1, M2, X1, X2), after `2026-10-08-meeting-rules-design.md`. HOA annual meetings elect several directors on one ballot, often by acclamation, count paper ballots in the room, and amend bylaws under thresholds the bylaws or state law set. A chair who hears "aye" doesn't want to invent numbers.

## Elections

**Seats.** The chair opens nominations for a position with the number of seats ("Director", 2 seats; one by default): `OPEN_NOMINATIONS { position, seats? }` (1 to 20), kept as `openSeats` until the ballot opens. While a position is in hand (nominations closed, or a ballot), nominations for another position are refused ("Finish the election for Director, or set it aside"); reopening nominations for the same position keeps its seats. Someone already elected to the position in this meeting can't be nominated for it again.

**Acclamation (RONR 46:40).** With nominations closed and no ballot open, when the remaining nominees are no more than the open seats, the chair declares them elected without a ballot: `ELECT_BY_ACCLAMATION` (clocked, presiding, refused without a quorum unless confirmed, as the ballot is). Fewer nominees than seats leaves the other seats open: the chair reopens nominations or sets the election aside. Minuted "were elected by acclamation".

**The ballot.** `START_ELECTION` opens a ballot for the open seats with the nominees not yet elected. `Election` gains `seats` (still to fill), `winners` (with the vote required on the closed ballot, highest first, awaiting the chair's declaration), `writeIns` and the paper count's parts, and `ballotTotals` beside `ballots` (each closed ballot's ballots cast, blanks and illegal ballots, and write-ins).

- A phone marks up to `seats` names (`CAST_BALLOT { candidateNames }`; `candidateName` still accepted for one): distinct, each a candidate on this ballot. A name not nominated is refused on a device; write-ins are paper only.
- Paper ballots (`SET_FLOOR_BALLOTS`): marks per candidate, write-ins by name, blank ballots and illegal (spoiled) ballots. With more than one seat the chair also enters how many paper ballots were counted (a ballot carries several marks, so the marks can't give it); each candidate's marks are at most that, and all marks at most that times the seats. RONR 45:31: blank ballots are not votes cast; illegal ballots are, though they count for nobody.
- Ballots cast = device ballots + paper ballots (illegal included, blanks not). Majority: more than half the ballots cast; two thirds: at least two thirds; plurality: the most marks. The candidates with the vote required, the most first, fill the seats; candidates tied for the last open seat are all left for the next ballot (RONR 46:32), as are those without the vote required.
- No winner: the next ballot opens at once with every remaining candidate (nobody is dropped); under plurality, a tie runs off the tied candidates only. A paper write-in who received votes is a candidate on later ballots (marked write-in).
- `DECLARE_ELECTED` names a winner of the closed ballot, and only then (refused while the ballot is open, or for anyone else). After the round's last declaration, with seats still open the election waits for the chair's "Open the next ballot" (`START_ELECTION` again: same election, same vote required, the winners left off); with none it ends.
- Officers gain `electionId`, `acclamation` and `writeIn`; the set-aside and unfinished records keep the ballots' totals.

**Screens.** The console's election card: position and seats; after nominations close, the candidates, the vote required, Open the ballot and, when it applies, Declare elected by acclamation; the paper form with write-in rows, blank and illegal ballots (and the ballot count for several seats); each winner's Declare button; Open the next ballot. Phones: one tap per name for one seat, "Choose up to 2" with check boxes and Cast my ballot for more. The display stamps ELECTED at each declaration, naming everyone elected in that election so far ("Alice Brennan and Ben Whitaker, Director") with the ballot's tally, or "By acclamation". The stamp comes from `electedOfficers`, not the log.

**Minutes.** One paragraph per election: "**Election for Director (2 seats).** Ballot 1, 27 ballots cast (1 blank ballot not counted): Alice Brennan 20, Ben Whitaker 15, Carmen Diaz 9, Dan Ortiz (write-in) 1. Alice Brennan and Ben Whitaker were elected." A later ballot gets its own line, with who it elected.

## Vote thresholds

`VoteThreshold { fraction: 'majority' | '2/3', of: 'cast' | 'members', members? }`. Of the votes cast, abstentions don't count and a tie fails (an appeal's tie sustains the chair, as before). Of all the voting members: majority is `yea * 2 > members` (72 of 142), two thirds `yea * 3 >= members * 2` (95 of 142), and the yes votes must also carry among the votes cast. `calculateVoteResult` and `canChairVoteDecide` take a threshold or the old requirement; `motionThreshold(motion)` in shared is the one place the reducer, the validator, the vote panel, the question card and the minutes read it.

**The setting.** `Organization.bylawAmendmentVote` (Prisma enum: `twoThirdsCast` default, `majorityCast`, `majorityMembers`, `twoThirdsMembers`), set by admins on a "Bylaw amendments" card in Settings beside Attendance, through `PUT /api/organizations/:id/vote-rules` (admin; its own route file, apart from the organization routes). When a bylaw amendment is moved, `prepareBylawMotion` stamps the threshold on its change (`bylawAmendment.voteRequired`, server-set like the section label), with the members counted then (the organization's eligible voters, else its voting members). The record keeps it, so a later change of the setting doesn't rewrite a decision. The question card states it plainly: "Two thirds of all 142 voting members: 95 votes needed"; the minutes: "Failed, two thirds of all 142 voting members required (95 votes), 60 to 5."

## Voice votes declared

On an open voice vote the console has "The ayes have it" and "The noes have it": `CLOSE_VOTING { declared: 'ayes' | 'noes' }`, recorded without counts and minuted "Carried by voice vote." (a counted voice vote reads "Carried by voice vote, 9 to 8."). Only for a question decided by a majority of the votes cast, and never a bylaw amendment (its record is counted; the bylaw sync also skips any declared result). RONR 29:7: any member may call for a division right after; the result stays open to it (`state.voiceVote`) until other business comes up (any action but attendance, hands, questions to the chair, settings and the server's own). `REQUEST_DIVISION` then puts back exactly what deciding changed (a snapshot of the fields `decide()` and `CLOSE_VOTING` wrote, kept on the server: `publicState` drops it) and reopens the vote as a counted vote. Phones show "Call for a division" under the result; the console records one from the floor. The log line "Voice vote: the ayes have it. CARRIED." stamps "Carried, by voice vote".

## Minutes content

- An agenda item taken up with nothing recorded whose title names a report ("Treasurer's report", "Committee reports") says "Report received." instead of "No action was taken."
- Times of decisions: not added. The minutes follow the agenda in order and record what was done (RONR 48:4); the call to order, recesses and the adjournment carry times, and a time on every vote and election is clutter in a document read for what was decided. `decidedAt` stays on each record for anyone who needs it.

## Not changed

Single-seat elections run as before (one tap per name on a phone). Main motions keep their thresholds; only bylaw amendments read the setting. Proxies and lots (the other batch). The display's quorum and attendance.
