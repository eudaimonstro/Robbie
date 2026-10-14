# Robbie: what it does and what it doesn't

As of 2026-10-13.

Robbie runs an HOA meeting held in a room, under Robert's Rules, and keeps the association's governing documents. The chair runs the meeting from a laptop, homeowners join on their phones' browsers, and a TV shows the room what's happening. People without a phone still count. Afterward, the secretary has draft minutes and, if the bylaws were amended, a new version of them.

## What it can do

### Setting up an association

- An owner creates the association with its number of voting members and its quorum (a percentage or a number). No meeting can open until both are set.
- A setup checklist on the home page walks a secretary through the first steps.
- People are added by email one at a time, or up to 500 at once from a pasted list. People added but never signed in still count on the meeting roster.
- Five roles: viewer, member, secretary, admin and owner. Each screen shows only what that role can do, and the server enforces the same rules.
- The board is marked by flagging members as directors.

### Governing documents

- Bylaws come in by pasting text or uploading a text, Markdown or Word file. Articles and sections are picked up from the headings and can be fixed before saving.
- Every change makes a new numbered version, and earlier versions are never edited. You can compare any two versions word by word, or see the bylaws as they stood on a given date.
- Amendments go from draft to proposed to passed or failed, and can be tabled or withdrawn. A passed amendment becomes the next version, and drafts still open carry over to it.
- You can search across the current bylaws, print them, export them as Markdown, and share a read-only public link.

### Before a meeting

- A secretary schedules a meeting of the members or of the board: date, place, presiding officer, agenda, and files attached to agenda items.
- The notice can be emailed to every member, or printed with a QR code for posting or mailing.
- A scheduled meeting can be changed or canceled.

### In the meeting

- **Joining:** homeowners join by QR code or link and sign in with a code emailed to them. There's no app to install and no password.
- **The TV:** shows the meeting code, the question, who's waiting to speak, the votes and the results.
- **Quorum:**
  - It counts members on phones, members the chair marks present, a headcount of people without an account, and the paper proxies and absentee ballots held.
  - It's shown live. Acting without a quorum asks the chair to confirm first, and the minutes note it.
- **Motions:** these work from start to finish, on every screen and in the minutes:
  - main motions and bylaw amendments
  - amendments, and amendments to an amendment
  - close debate, postpone, postpone indefinitely, refer
  - recess and adjourn
  - withdraw, point of order and appeal
  - division of the assembly and unanimous consent
- **Voting:**
  - Phones vote Yes, No or Abstain, and the chair adds the room's show of hands. The two counts are shown separately so the room can check them.
  - Votes can be by voice, counted, roll call or secret ballot.
  - Bylaw amendments use the association's own threshold, such as two thirds of the votes cast or of all members.
- **Elections:**
  - One office at a time, with one seat or several on one ballot, and nominations from phones and from the floor.
  - Phone ballots are added to the tellers' paper count. Write-ins work, ties are handled under Robert's Rules, and a winner can be elected by acclamation.
  - Nobody, the chair included, sees the phone tally while the ballot is open.
- **Board meetings:**
  - Directors vote.
  - A secretary who isn't a director runs the console without a vote.
  - Other members watch and can ask to speak.
- **Staying connected:** a phone that locks or drops out stays present for 90 seconds and can still vote when it's back.

### After the meeting

- Draft minutes are written when the meeting adjourns, from what actually happened: motions, how each was decided, rulings, elections with ballot totals, recesses, and unfinished business.
- The secretary edits them (saved automatically), publishes them, and the next meeting approves them from the console. Earlier text of published minutes is kept.
- A bylaw amendment adopted in the meeting becomes the next version of the bylaws automatically.

### Running it

- It's one server with nightly database backups and HTTPS.
- Sign-in is protected against guessing and flooding, and every deletion is logged.
- It's checked against WCAG 2.1 AA accessibility rules, and has a light and a dark look.
- A demo association with a sample annual meeting and board meeting shows all of it.

## What it can't do that people might expect

### Voting

- **No weighted votes:** it's one member, one vote. An HOA that votes by lot or unit (three lots, three votes) can't use it as is.
- **No voting before the meeting:** there are no mailed or online ballots and no proxy voting on phones. Paper proxies only count toward the quorum, and their votes are counted in the room.
- **No thresholds based on members present:** only the votes cast or all the voting members.

### Motions left out

- table, and take from the table
- reconsider, rescind, or amend something already adopted
- suspend the rules
- divide the question
- objection to consideration
- orders of the day
- fix the time to adjourn to
- limit or extend debate

The app suggests what to use instead of each.

### The meeting itself

- **In person only:** there's no video or audio, so a remote or hybrid meeting needs a separate call. Everyone also needs a working connection in the room.
- **No executive session:** use a recess and summarize it in the minutes.
- **Guests:** the chair can't remove one, or close a meeting to guests.
- **Debate:** who spoke for or against isn't kept per motion.
- **The notice is a courtesy:** it isn't the legal notice, and Robbie doesn't keep proof of delivery.

### The association

- **No committees:** a referral records the committee's name only.
- **No officer titles:** nobody is "Treasurer". Only each meeting's presiding officer and the board are recorded.
- **No recurring meetings:** each one is scheduled separately.
- **Not HOA management software:** no dues, accounting, violations, maintenance or architectural requests, and no resident directory beyond the members list.

### Documents

- A proposed amendment with more than one change can't be moved in a meeting as drafted. A member has to write the change on their phone instead.
- A version made by a meeting's vote has no adoption date, so "the bylaws as of a date" doesn't find it by the meeting's date.

### Accounts and access

- Sign-in is by emailed code only: no passwords, and no Google or Microsoft sign-in.
- It's a web app only, with no phone app.
- A person can create at most three associations.

### Not yet proven

- It hasn't run a real meeting.
- It hasn't been deployed to the production server.
- The Terms and Privacy Policy haven't had a lawyer's review.
