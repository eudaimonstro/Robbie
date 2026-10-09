import { useMemo } from 'react';
import type { MeetingLogEntry } from '@robbie-bylawyer/shared/types';
import { latestDecision, VOTE_LINE } from '../utils/decisions';

/** The last vote, as its log line recorded it */
export interface VoteResult {
  /** Device and floor votes together */
  yea: number;
  nay: number;
  /** An appeal's vote sustains the chair's ruling or overturns it */
  outcome: 'CARRIED' | 'FAILED' | 'SUSTAINED' | 'OVERTURNED';
  passed: boolean;
  /** The question put, from the chair's "puts the question" line before the vote */
  motionText: string;
  timestamp: string;
  /** The two parts, when the chair entered a floor tally */
  parts: { device: { yea: number; nay: number }; floor: { yea: number; nay: number } } | null;
  /** The tally as the room reads it: "On devices 12 to 3, in the room 9 to 2: 21 to 5" */
  tally: string;
  /** A voice vote the chair declared without a count: the tally is "By voice vote" */
  declared?: 'ayes' | 'noes';
}

// The parts of a closed vote's line when the chair entered a floor tally:
// " On devices 12 to 3, in the room 9 to 2."
const PARTS = /On devices (\d+) to (\d+), in the room (\d+) to (\d+)\./;

/**
 * The most recent vote result in the meeting log, or null when there is none or the floor has
 * moved on since (another decision, a ruling, a motion that died or was withdrawn, an election
 * set aside)
 */
export function parseVoteResult(meetingLog: MeetingLogEntry[]): VoteResult | null {
  const decision = latestDecision(meetingLog);
  if (decision?.kind !== 'vote') return null;
  const index = decision.index;
  const entry = meetingLog[index];
  const match = entry.message.match(VOTE_LINE);
  if (!match) return null;

  const declared = match[3] as 'ayes' | 'noes' | undefined;
  const yea = declared ? 0 : parseInt(match[1], 10);
  const nay = declared ? 0 : parseInt(match[2], 10);
  const outcome = match[4].replace("Chair's decision ", '') as VoteResult['outcome'];

  const partsMatch = entry.message.match(PARTS);
  const parts = partsMatch
    ? {
        device: { yea: parseInt(partsMatch[1], 10), nay: parseInt(partsMatch[2], 10) },
        floor: { yea: parseInt(partsMatch[3], 10), nay: parseInt(partsMatch[4], 10) },
      }
    : null;
  const total = `${yea} to ${nay}`;
  const tally = declared
    ? 'By voice vote'
    : parts
      ? `On devices ${parts.device.yea} to ${parts.device.nay}, in the room ${parts.floor.yea} to ${parts.floor.nay}: ${total}`
      : total;

  // The question put before the vote (other entries, such as a quorum warning, may come between)
  const question = meetingLog
    .slice(0, index)
    .findLast((log) => log.message.startsWith('Chair puts the question: '));
  const motionText = question?.message.match(/Chair puts the question: "(.+)"/)?.[1] ?? '';

  return {
    yea,
    nay,
    outcome,
    passed: outcome === 'CARRIED' || outcome === 'SUSTAINED',
    motionText,
    timestamp: entry.time,
    parts,
    tally,
    ...(declared ? { declared } : {}),
  };
}

/** parseVoteResult, kept while the log is unchanged */
export function useVoteResults(meetingLog: MeetingLogEntry[]) {
  return useMemo(() => parseVoteResult(meetingLog), [meetingLog]);
}
