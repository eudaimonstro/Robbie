# Change a scheduled meeting

Status: design, 2026-10-08. Closes the known gap in `docs/mvp-roadmap.md`: "No UI to change a scheduled meeting's date, place or attachments after scheduling."

## Why

Pat schedules the annual meeting weeks ahead. Then the clubhouse is booked, the treasurer sends the budget a day late, or the board wants the pool contract before the election. Today the only way to change any of that is the API. The server already supports every change (`PUT /api/packets/{id}`, the agenda item routes, the attachment routes); only the screen is missing.

## Decisions

- **Live Meetings gets Change on each meeting not yet called to order**, for secretaries and above (the same rule as Schedule a meeting; the server still decides). A meeting called to order or adjourned has no Change: its agenda is changed in the meeting, and its record is the minutes.
- **The scheduler gets an existing-meeting mode**, not a second form. `MeetingScheduler` takes an optional `meetingCode`; with one it loads the packet (`GET /api/packets/{code}`), prefills the details (title, date and time in the viewer's time zone, place, description, presiding officer, including "nobody"), and goes on to the same agenda step with the current items and files. Creation is unchanged.
- **Saving uses the existing routes.** Going on from the details saves them with `PUT /api/packets/{id}`; an emptied place, description or date is sent as `null` and cleared; the title can't be emptied. Agenda items are added, renamed, removed and reordered, and files attached or removed, each saved as it happens (as when scheduling). Reordering gets Move up and Move down buttons beside the drag handle, so it works from the keyboard.
- **Refusals are shown, not logged.** The details, every agenda change and every attachment change show the server's message (for example "The presiding officer must be a member..." or a 403) in an alert in the form, instead of `console.error`.
- **Done reloads an open meeting's agenda automatically.** `POST /api/packets/{code}/reload-agenda` already does the right thing in every case: without a live meeting it changes nothing (`live: false`); before the call to order it replaces the live agenda with the packet's (the reducer resets only the adoption flags, which are false before the call to order anyway); after the call to order it refuses with 409 "The meeting has started; change the agenda in the meeting". So the change flow calls it once on Done and tells the secretary what happened: "The open meeting's agenda now matches." for `live: true`, the server's message for a refusal, nothing extra otherwise. The cost: an agenda the chair edited by hand in the console before the call to order is replaced by the schedule's, which is what the chair's own Reload the agenda would do; the schedule is the agenda of record.
- **Cancel the meeting** lives at the foot of the change form's details step (not on the schedule row, which already carries the code, the way in and Change, and wraps at phone width). It asks inline: "Cancel 2026 Annual Meeting? Its agenda and attached files are deleted." with Yes, cancel it and Keep it. It calls the existing `DELETE /api/packets/{id}`.
- **The server refuses to delete a meeting that has been called to order** (409, `startedAt` set). `Minutes.packet` cascades on delete, so today a secretary could delete a held meeting's minutes along with its packet. Minutes are drafted only at adjournment, after a call to order, so the call to order is the test; a separate minutes check would also refuse the integration fixture's packet, which has draft minutes without a call to order. This is the one server change, with an integration test.
- **Accessibility**: the form's heading ("Change the meeting") takes focus when the form opens; every agenda control has a name ("Title of item 2", "Move Treasurer's report up", "Remove Treasurer's report", "Details of Treasurer's report"); closing the form puts a status message on Live Meetings ("2026 Annual Meeting is changed." / "2026 Annual Meeting is canceled.").

## Out of scope, known

- A live meeting already opened keeps the title and date it was opened with; only the agenda follows the packet (via the reload). `SET_MEETING_INFO` runs only for a state saved without an organization. The place is not part of the live state at all; the minutes read it from the packet at adjournment, so a changed place reaches the minutes.
- The packet, agenda and attachment routes don't refuse changes after the call to order; the screen hides Change instead. Changing a held meeting's packet doesn't change minutes already drafted.

## Tests

- Web: the scheduler's existing-meeting mode (prefill, saving changes, clearing, nobody presiding, the refusal message, focus, Done with each reload outcome, Cancel the meeting with its confirmation); the packet builder (add, rename, remove, move, a refused change); Live Meetings (Change by role and by meeting state, the status message). The creation tests stay as they are.
- Integration: `DELETE /api/packets/{id}` answers 409 for a meeting called to order and keeps it and its minutes; the existing tests still delete one that hasn't been.
- e2e: in `annual-meeting.spec.ts`, Pat changes MAPLE1's place from Live Meetings before Dana opens the meeting, and the minutes give the new place.
