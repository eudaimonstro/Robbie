# Try a meeting on your own machine

`npm run demo` runs the Maple Grove HOA demo locally: the roadmap's acceptance scenario (`docs/mvp-roadmap.md`, "The acceptance scenario") with you playing everyone. It needs Docker and Node 24, and `npm install` done once.

```bash
npm run demo              # start (the first run builds, migrates and seeds; later runs keep the demo)
npm run demo -- --reset   # start over with a fresh demo
npm run demo -- --stop    # stop the server and the database (the data stays)
npm run demo -- --remove  # delete the database container and its volume
```

The app is at http://localhost:3301. Its database is the Docker container `robbie-demo-pg` (port 55433, volume `robbie-demo-pgdata`). Ctrl-C stops the server.

## Who is who

Sign in with the email, then the code **000000** (no email is sent). Give each person a separate browser profile or private window, since one window holds one sign-in.

| Person        | Email                       | Plays                                                        |
| ------------- | --------------------------- | ------------------------------------------------------------ |
| Dana Okafor   | `dana@maplegrove.example`   | The president, chairing from the laptop                      |
| Alice Brennan | `alice@maplegrove.example`  | A homeowner on a phone                                       |
| Ben Whitaker  | `ben@maplegrove.example`    | A homeowner on a phone                                       |
| Morgan Lee    | `morgan@maplegrove.example` | The TV: http://localhost:3301/meetings/MAPLE1/display        |
| Pat Lindqvist | `pat@maplegrove.example`    | The owner, keeping the schedule before and the minutes after |

Dana, Pat and Alice are the board (Settings, **Members**, the **Board member** boxes). Ray Castillo (`ray@maplegrove.example`), the treasurer, is a secretary who isn't on it.

The meeting code is **MAPLE1**. For Alice and Ben, a narrow window works, or a real phone on the same Wi-Fi: the server listens on every interface and `npm run demo` prints the machine's address. The QR code holds the address the display was opened from, so for phones open the display at `http://<that address>:3301/meetings/MAPLE1/display` and scan it.

## The meeting

**Before the call to order**

1. Morgan: open the display. It shows the meeting name, MAPLE1 and a QR code.
2. Dana: **Live Meetings**, then **Start** on 2026 Annual Meeting. The console opens.
3. Alice and Ben: **Live Meetings**, then **Join** (or the QR code, or `/meetings/MAPLE1`). Their phones say they're checked in and the meeting has not been called to order yet.
4. Dana, under **Attendance**: **Mark present** beside Carmen Diaz (she has no phone), then **Headcount** 25 and **Save the headcount**. (Harold Becker and Rosa Alvarez are on the roster as "Added, not yet signed in": Pat added them by email and they haven't signed in. **Mark present** would count them in the room by name.) The console reads "29 present of 142, quorum 29, met"; the display shows **Quorum met**.

**Business** (the console's toolbar always shows the next step)

5. Dana: **Call to order**, then **Adopt the agenda**.
6. **Call the next item: Approval of the minutes of the 2025 annual meeting**. The console, the display and the phones ask "Any corrections?". Dana: **Approve as read** (or **Approve with corrections**).
7. **Call the next item: Treasurer's report and the 2027 budget**. Attachments added to the item on the schedule open from here.
8. **Call the next item: Old business: pool resurfacing contract**.
   - Alice: type in **Motion text**, then **Move**. Ben: **Second**. The console reads "Moved by Alice Brennan, seconded by Ben Whitaker".
   - Alice and Ben: pick a position (**For**, ...), then **Ask to speak**. The display lists them under Speakers.
   - Dana: **Recognize** each in turn (the mover speaks first). On the phone: **Yield the floor**.
   - Dana: **Open the vote**. Alice and Ben: **Yes**.
   - Dana, under **In the room**: 20 yea, 3 nay, 0 abstain, then **Enter the count**, then **Close the vote**. The display stamps **Carried**: "On devices 2 to 0, in the room 20 to 3: 22 to 3".
9. **Call the next item: New business: amend Section 4.2 to lower the quorum to 15%**.
   - Alice: **Other motions**, **Amend the bylaws**, **Move**. Under **Proposed amendments** pick **Lower the quorum to 15%** (the board proposed it before the meeting): the form shows Section 4.2 as it reads now and as it would read. Then **Move**. Ben: **Second**.
   - The console, the phones and the display show the section's new text under the question; the console shows **Two thirds** required. Vote as before with 20 yea and 5 nay: carried.
   - To amend a section nobody proposed, choose **Write a change** instead: pick the section, and edit its wording, which starts from what it says now.
10. **Call the next item: Election of two directors**, both on one ballot.
    - Dana: **Open nominations for** "Director", **Seats** 2, then **Open nominations**.
    - Ben, on his phone: under **Nominate** pick Alice Brennan, then **Nominate**; Alice nominates Ben Whitaker the same way. Dana: pick Carmen Diaz and **Nominate from the floor**.
    - Dana: **Close nominations** (three nominees for two seats, so a ballot), then **Open the ballot**. Alice and Ben: mark up to two names, then **Cast my ballot** ("Ballot recorded").
    - Dana, under **Paper ballots**: the tellers' count, say 26 counted, 18 for Alice Brennan, 15 for Ben Whitaker and 12 for Carmen Diaz, then **Enter the paper ballots** and **Close the ballot**. The console says who has the vote required.
    - Dana: **Declare Alice Brennan elected**, then **Declare Ben Whitaker elected**. The display stamps **Elected** for each.
11. **Call the next item: Adjournment**, then **Adjourn**, and **Adjourn** again in the dialog. The console and the display read "Adjourned at ...".

## After

12. Pat: the bylaws (in the sidebar) now show **Version 2 (current)** with the 15% quorum. It can take a few seconds after the vote.
13. Pat: **Minutes**, then 2026 Annual Meeting (Draft). Edit the text under **Minutes text** (the preview follows), then **Publish**. Alice can now read them under **Minutes**; the 2025 minutes show as Approved.

## A board meeting

The board meets in November: **November board meeting**, code **MAPLEB**, with Dana presiding. Only the directors vote, and a majority of them (2 of 3) is the quorum.

1. Morgan: open http://localhost:3301/meetings/MAPLEB/display. It says **Board meeting** and counts **Directors**, not the room.
2. Dana: **Live Meetings**, then **Start** on November board meeting. The console's top bar says **Board meeting**; there is no headcount.
3. Alice (a director) and Ben (a member, not a director): join MAPLEB on their phones. Ben's phone says "You're observing this board meeting." and offers no motion, second or vote; the console lists him under **Also present**.
4. Dana: **Mark present** beside Pat (with Dana and Alice: "3 present of 3, quorum 2, met"), **Call to order**, **Adopt the agenda**, and call an item. Alice moves; Dana records Pat's second (**Seconded from the floor**, Pat Lindqvist); **Open the vote**; Alice votes on her phone and Dana enters Pat's hand under **In the room** (at most the directors not voting on a device). **Close the vote**, then **Adjourn**.
5. Pat: **Minutes**, November board meeting: "Minutes of the meeting of the Board of Directors", with the directors present and absent and Ben under **Also present**.

A bylaw amendment can't be moved at a board meeting: the members amend the bylaws. Ben can **Ask to speak** and ask the chair a question; Dana decides whom to recognize. Ray joins with the console but has no vote; he records what people in the room do (**Objection from the floor** after Dana asks for unanimous consent, say). With three directors, Dana votes like any director (RONR 49:21). Before a meeting, Pat can **Send notice** from Live Meetings: the demo has no email provider, so nothing is sent, and **Print the notice** gives the page to post, with its QR code.

To run it again: `npm run demo -- --reset`.
