/**
 * The longest text the meeting takes in what people send: the server refuses an action over
 * any of these (backend-node/src/socket/actionSchemas.ts), and the forms stop at them
 */

/** A motion's words, as moved */
export const MAX_MOTION_TEXT_LENGTH = 500;

/** A bylaw section's text, current or proposed, in a bylaw amendment motion */
export const MAX_BYLAW_TEXT_LENGTH = 10_000;

/** A bylaw section's title, in a bylaw amendment motion */
export const MAX_BYLAW_TITLE_LENGTH = 300;

/** A bylaw section's number ("Section 4.2"), in a bylaw amendment motion */
export const MAX_BYLAW_LABEL_LENGTH = 100;

/** An agenda item's title, as the schedule takes it */
export const MAX_AGENDA_TITLE_LENGTH = 500;

/** An office an election is for, a committee */
export const MAX_POSITION_LENGTH = 200;

/** A person's name: a nominee's, a mover's or seconder's from the floor */
export const MAX_NAME_LENGTH = 100;
