import { useMemo } from 'react';
import type { MeetingLogEntry } from '@robbie/shared/types';

/**
 * Custom hook to extract and parse the most recent vote result from meeting log
 *
 * Searches the meeting log in reverse order to find the most recent CARRIED or FAILED
 * vote result, then parses the vote counts and looks up the associated motion text.
 *
 * @param meetingLog - Array of meeting log entries
 * @returns Vote result object or null if no recent vote found:
 *   - `yea`: Number of yes votes
 *   - `nay`: Number of no votes
 *   - `outcome`: 'CARRIED' | 'FAILED'
 *   - `passed`: Boolean shorthand for outcome === 'CARRIED'
 *   - `motionText`: Text of the motion that was voted on (if found)
 *   - `timestamp`: Time when the vote was recorded
 *
 * @example
 * ```tsx
 * const voteResult = useVoteResults(state.meetingLog);
 * if (voteResult) {
 *   console.log(`Motion ${voteResult.passed ? 'passed' : 'failed'}: ${voteResult.yea}-${voteResult.nay}`);
 * }
 * ```
 */
export function useVoteResults(meetingLog: MeetingLogEntry[]) {
  return useMemo(() => {
    // Find the most recent vote result in the meeting log (search backwards)
    const voteResult = meetingLog.findLast(log => log.message.includes('CARRIED') || log.message.includes('FAILED'));

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
