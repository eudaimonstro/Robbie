import {
  LOG_ADOPTED_BY_CONSENT,
  LOG_CHAIR_RULED,
  LOG_MOTION_FAILED_NO_SECOND,
  LOG_MOTION_WITHDRAWN,
  logElectionSetAside,
} from '@robbie-bylawyer/shared/constants';
import type { MeetingLogEntry } from '@robbie-bylawyer/shared/types';

/** How a question left the floor, as the meeting log recorded it */
export type DecisionKind =
  'vote' | 'consent' | 'ballot' | 'declared' | 'ruling' | 'no-second' | 'withdrawn' | 'set-aside';

export interface Decision {
  kind: DecisionKind;
  /** Its entry in the log */
  index: number;
}

// The reducer's line for a closed vote: "Vote: Yea 21, Nay 5. CARRIED.", for an appeal
// "Vote: Yea 3, Nay 1. Chair's decision SUSTAINED.", and for a voice vote the chair declared
// "Voice vote: the ayes have it. CARRIED." (logVoiceVoteDeclared)
export const VOTE_LINE =
  /^(?:Vote: Yea (\d+), Nay (\d+)|Voice vote: the (ayes|noes) have it)\. (CARRIED|FAILED|Chair's decision SUSTAINED|Chair's decision OVERTURNED)/;
// An election's lines: a ballot closed ("Voting closed for Director. Results: ..."), and the
// chair's declaration ("Chair declares Carmen Diaz elected as Director.", or of several
// "Chair declares Alice Brennan and Ben Whitaker elected as Director, by acclamation.")
export const DECLARED_LINE =
  /^Chair declares (.+?)(?: \(write-in candidate\))? elected as (.+?)(?:, by acclamation)?\.$/;
const BALLOT_LINE = /^Voting closed for /;

// The set-aside line has the office in the middle: its two ends, from the function that writes it
const [SET_ASIDE_START, SET_ASIDE_END] = logElectionSetAside('\u0000').split('\u0000');
const SET_ASIDE_UNNAMED = logElectionSetAside(null);

function kindOf(message: string): DecisionKind | null {
  if (VOTE_LINE.test(message)) return 'vote';
  if (message.startsWith(LOG_ADOPTED_BY_CONSENT)) return 'consent';
  if (BALLOT_LINE.test(message)) return 'ballot';
  if (DECLARED_LINE.test(message)) return 'declared';
  if (message.startsWith(LOG_CHAIR_RULED)) return 'ruling';
  if (message === LOG_MOTION_FAILED_NO_SECOND) return 'no-second';
  if (message.endsWith(LOG_MOTION_WITHDRAWN)) return 'withdrawn';
  if (
    message === SET_ASIDE_UNNAMED ||
    (message.startsWith(SET_ASIDE_START) && message.endsWith(SET_ASIDE_END))
  ) {
    return 'set-aside';
  }
  return null;
}

/**
 * The latest thing that took a question off the floor: a vote, an adoption by unanimous consent,
 * a ballot or a declaration, a ruling of the chair, a motion that died for lack of a second, a
 * withdrawal or an election set aside. Whatever came before it is old news.
 */
export function latestDecision(log: MeetingLogEntry[]): Decision | null {
  for (let index = log.length - 1; index >= 0; index--) {
    const kind = kindOf(log[index].message);
    if (kind) return { kind, index };
  }
  return null;
}
