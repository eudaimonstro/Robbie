import { useMemo } from 'react';
import type { MeetingLogEntry } from '@robbie-bylawyer/shared/types';

/** The last vote, as its log line recorded it */
export interface VoteResult {
  /** Device and floor votes together */
  yea: number;
  nay: number;
  outcome: 'CARRIED' | 'FAILED';
  passed: boolean;
  /** The question put, from the chair's "puts the question" line before the vote */
  motionText: string;
  timestamp: string;
  /** The two parts, when the chair entered a floor tally */
  parts: { device: { yea: number; nay: number }; floor: { yea: number; nay: number } } | null;
  /** The tally as the room reads it: "On devices 12 to 3, in the room 9 to 2: 21 to 5" */
  tally: string;
}

// The reducer's line for a closed vote, "Vote: Yea 21, Nay 5. CARRIED.", with the parts after it
// when the chair entered a floor tally: " On devices 12 to 3, in the room 9 to 2."
const VOTE = /Vote: Yea (\d+), Nay (\d+)\. (CARRIED|FAILED)/;
const PARTS = /On devices (\d+) to (\d+), in the room (\d+) to (\d+)\./;
// Decisions of other kinds: once one comes after the last vote, that vote is old news
const OTHER_DECISION =
  /CARRIED by unanimous consent|^Voting closed for |^Chair declares .+ elected/;

/**
 * The most recent vote result in the meeting log, or null when there is none or something else
 * has been decided since
 */
export function parseVoteResult(meetingLog: MeetingLogEntry[]): VoteResult | null {
  const index = meetingLog.findLastIndex(
    (entry) => VOTE.test(entry.message) || OTHER_DECISION.test(entry.message),
  );
  if (index < 0) return null;
  const entry = meetingLog[index];
  const match = entry.message.match(VOTE);
  if (!match || OTHER_DECISION.test(entry.message)) return null;

  const yea = parseInt(match[1], 10);
  const nay = parseInt(match[2], 10);
  const outcome = match[3] as 'CARRIED' | 'FAILED';

  const partsMatch = entry.message.match(PARTS);
  const parts = partsMatch
    ? {
        device: { yea: parseInt(partsMatch[1], 10), nay: parseInt(partsMatch[2], 10) },
        floor: { yea: parseInt(partsMatch[3], 10), nay: parseInt(partsMatch[4], 10) },
      }
    : null;
  const total = `${yea} to ${nay}`;
  const tally = parts
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
    passed: outcome === 'CARRIED',
    motionText,
    timestamp: entry.time,
    parts,
    tally,
  };
}

/** parseVoteResult, kept while the log is unchanged */
export function useVoteResults(meetingLog: MeetingLogEntry[]) {
  return useMemo(() => parseVoteResult(meetingLog), [meetingLog]);
}
