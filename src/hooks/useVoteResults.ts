import { useMemo } from 'react';
import type { MeetingLogEntry } from '../types';

/**
 * Custom hook to extract and parse the most recent vote result from meeting log
 * @param meetingLog - Array of meeting log entries
 * @returns Object containing vote counts, outcome, and motion text, or null if no recent vote
 */
export function useVoteResults(meetingLog: MeetingLogEntry[]) {
  return useMemo(() => {
    // Find the most recent vote result in the meeting log
    const recentLogs = meetingLog.slice().reverse();
    const voteResult = recentLogs.find(log => log.message.includes('CARRIED') || log.message.includes('FAILED'));

    if (!voteResult) return null;

    // Parse the vote result: "Vote: Yea X, Nay Y. Motion CARRIED/FAILED."
    const match = voteResult.message.match(/Vote: Yea (\d+), Nay (\d+)\. Motion (CARRIED|FAILED)/);
    if (!match) return null;

    const yea = parseInt(match[1]);
    const nay = parseInt(match[2]);
    const outcome = match[3];
    const passed = outcome === 'CARRIED';

    // Find the motion text from logs just before the vote
    const voteIndex = meetingLog.indexOf(voteResult);
    const questionLog = voteIndex > 0 ? meetingLog[voteIndex - 1] : null;
    const motionTextMatch = questionLog?.message.match(/Chair puts the question: "(.+)"/);
    const motionText = motionTextMatch ? motionTextMatch[1] : null;

    return {
      yea,
      nay,
      outcome,
      passed,
      motionText,
      timestamp: voteResult.time
    };
  }, [meetingLog]);
}
