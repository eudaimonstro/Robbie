# Undo the chair's last step

Status: built (2026-10-13). Asked for after a run of the demo: the chair clicked **Objection to the agenda** by mistake and couldn't get back to **Adopt the agenda**.

## Why

Most of the console's buttons act the moment they are clicked: **No second** kills a motion, **Call the next item** moves on, **Objection to the agenda** leaves only Adjourn and a motion from the floor. A chair running a meeting from a laptop, talking to the room at the same time, will click the wrong one. Robert's Rules has remedies for a wrong decision (a division, a point of order, reconsideration), but none for a mis-click, and using them for one puts a clerical slip before the meeting.

An objector taking back an objection to the agenda is a real event of its own (`WITHDRAW_AGENDA_OBJECTION`, #59): undo is for the button the chair didn't mean.

## Decisions

- **One step, the chair's, until the meeting moves on.** The console shows **Undo: _step_** at the end of the toolbar while the chair's last step can be taken back (`UNDO_LAST_STEP`, presiding only). Undoing is not a step, so it never redoes, and there is one level.
- **Every action has a rule** (`UNDO_RULES` in `shared/reducer/undo.ts`, exhaustive over the action union):
  - _step_: the console's own business (opening and closing a vote, recognizing, rulings, the agenda, consent, nominations and ballots, declaring and setting aside, resuming), and what the chair records for the room (a motion, a second, an objection, a nomination, a withdrawal, a division, from the floor).
  - _keeps_: what goes on around the business: votes and ballots, hands, presence and the room's count, settings, the server's bookkeeping. The step stays undoable through them.
  - _ends_: everything else. A member's own business on their phone is never the chair's to erase, and what reaches outside the meeting's state can't be taken back: the call to order and adjournment (the packet's times, the minutes' draft), approving the previous minutes, a role change, changing the agenda before the meeting, and a bylaw amendment decided (the server applies it to the bylaws).
- **What undo puts back.** The reducer keeps, with the step, the fields it changed as they were before (a shallow comparison) and the fields it added. Undo restores them, except the log, who is here (`members`, `attendedIds`) and the hands: hands raised since stay up after the ones the step took down, as with a division. Votes cast in a vote opened by mistake go with it.
- **The record.** An undone step leaves nothing in the minutes (they are written from records, which undo restores). The log keeps the step and adds "The chair undid _step_", so the phones and the TV don't see business vanish silently.
- **Secrecy.** What undo would put back can hold a ballot's choices or an open election's count: it stays on the server (`publicState`), and clients receive only the step's type.

## Out of scope

Undoing more than one step, a member undoing their own action (they withdraw a motion, or change their vote while it is open), and undoing anything in the _ends_ list.
