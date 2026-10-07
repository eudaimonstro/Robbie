/**
 * Centralized log message factory functions
 * Ensures consistency and makes log messages easier to maintain
 */

// Meeting lifecycle
export const LOG_MEETING_CALLED_TO_ORDER = 'Meeting called to order.';
export const LOG_MEETING_ADJOURNED = 'Meeting adjourned.';

// Motion workflow
export function logMotionMade(mover: string, text: string, motionName: string): string {
  return `${mover} moves: "${text}" (${motionName}). Awaiting second.`;
}

export function logMotionSeconded(seconder: string): string {
  return `${seconder} seconds the motion.`;
}

// Business from the floor, recorded by the chair
export function logFloorMotionMade(mover: string, text: string, motionName: string): string {
  return `${mover} moves from the floor: "${text}" (${motionName}). Awaiting second.`;
}

export function logQuestionPut(text: string, motionName: string): string {
  return `The chair puts the question: "${text}" (${motionName}).`;
}

export const LOG_SECONDED_FROM_FLOOR = 'Seconded from the floor.';

export function logSecondedFromFloor(seconder: string | null): string {
  return seconder ? `${seconder} seconds the motion from the floor.` : LOG_SECONDED_FROM_FLOOR;
}

export function logFloorNomination(nomineeName: string, position: string): string {
  return `Nominated from the floor: ${nomineeName} for ${position}.`;
}

export const LOG_MOTION_FAILED_NO_SECOND = 'Motion fails for lack of a second.';

export function logMotionWithdrawn(mover: string): string {
  return `${mover}'s motion is withdrawn.`;
}

export function logMotionModified(mover: string, newText: string): string {
  return `${mover} modifies motion to: "${newText}"`;
}

// Voting
export function logRollCallVote(memberName: string, vote: 'yea' | 'nay' | 'abstain'): string {
  const voteText = vote.charAt(0).toUpperCase() + vote.slice(1);
  return `[ROLL CALL] ${memberName}: ${voteText}`;
}

export function logVoteResult(yea: number, nay: number, resultText: string): string {
  return `Vote: Yea ${yea}, Nay ${nay}. ${resultText}.`;
}

export function logVoteResultWithExtras(
  yea: number,
  nay: number,
  resultText: string,
  suspensionLog: string,
  restoredLog: string,
  objectionLog: string,
  reconsideredLog: string,
): string {
  return `Vote: Yea ${yea}, Nay ${nay}. ${resultText}.${suspensionLog}${restoredLog}${objectionLog}${reconsideredLog}`;
}

// Speaker management
export function logSpeakerRecognized(name: string): string {
  return `Chair recognizes ${name}.`;
}

export function logSpeakerYields(name: string | undefined): string {
  return `${name} yields the floor.`;
}

// Agenda
export const LOG_AGENDA_ADOPTED = 'Agenda adopted by unanimous consent.';
export const LOG_AGENDA_OBJECTION = 'Objection raised to agenda.';

export function logAgendaItemCalled(title: string | undefined): string {
  return `Chair calls: "${title}"`;
}

export function logAgendaItemCompleted(title: string | undefined): string {
  return `Completed: "${title}"`;
}

// Unanimous consent
export const LOG_UNANIMOUS_CONSENT_REQUESTED = 'Chair: "Is there any objection?"';

export function logUnanimousConsentObjection(objector: string): string {
  return `${objector} objects. Motion requires a vote.`;
}

export function logUnanimousConsentPassed(
  suspensionLog: string,
  restoredLog: string,
  objectionLog: string,
): string {
  return `Motion CARRIED by unanimous consent.${suspensionLog}${restoredLog}${objectionLog}`;
}

// Committee reports
export function logCommitteeReportPresented(
  committee: string,
  presenter: string,
  hasRecommendations: boolean,
): string {
  return `${committee} report presented by ${presenter}.${hasRecommendations ? ' Recommendations made.' : ''}`;
}

// Rule suspension
export function logRuleSuspended(rule: string, purpose: string): string {
  return `[RULE SUSPENDED] ${rule}: ${purpose}`;
}

// Minutes
export const LOG_MINUTES_APPROVED = 'Minutes from previous meeting approved.';

// Nominations
export function logNominationsOpened(position: string): string {
  return `Chair: Nominations are now open for ${position}.`;
}

export function logNomination(nominatedBy: string, nomineeName: string, position: string): string {
  return `${nominatedBy} nominates ${nomineeName} for ${position}.`;
}

export function logNominationDeclined(nomineeName: string, position: string): string {
  return `${nomineeName} declines nomination for ${position}.`;
}

export function logNominationsClosed(position: string | null): string {
  return `Chair: Nominations for ${position} are now closed.`;
}

// Elections
export function logElectionVotingOpen(position: string, candidateCount: number): string {
  return `Chair: Voting is now open for ${position}. ${candidateCount} candidate(s).`;
}

export function logElectionClosed(
  position: string,
  resultsText: string,
  winner: string | null,
): string {
  const winnerMsg = winner ? `${winner} elected.` : 'No candidate elected (majority not reached).';
  return `Voting closed for ${position}. Results: ${resultsText}. ${winnerMsg}`;
}

export function logElected(candidateName: string, position: string): string {
  return `Chair declares ${candidateName} elected as ${position}.`;
}

export function logElectionSetAside(position: string): string {
  return `The election for ${position} was set aside.`;
}

// Inquiries
export function logInquiryRaised(
  askedBy: string,
  inquiryTypeLabel: string,
  question: string,
): string {
  return `${askedBy} raises ${inquiryTypeLabel}: "${question}"`;
}

export function logInquiryAnswered(inquiryTypeLabel: string, answer: string): string {
  return `Chair answers ${inquiryTypeLabel}: "${answer}"`;
}

// Member management
export function logMemberJoined(name: string): string {
  return `${name} has joined the meeting.`;
}

export function logMemberPresenceChanged(name: string, present: boolean): string {
  return present ? `${name} is now present.` : `${name} has left the meeting.`;
}

export function logMemberMarkedPresent(name: string): string {
  return `${name} marked present.`;
}

export function logHeadcountSet(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'} present without an account.`;
}

export function logMemberRenamed(oldName: string, newName: string, renamedBy: string): string {
  return renamedBy === oldName
    ? `${oldName} changed their name to ${newName}.`
    : `${renamedBy} renamed ${oldName} to ${newName}.`;
}

export function logRoleChanged(
  memberName: string,
  oldRole: string,
  newRole: string,
  changedBy: string,
): string {
  return `${changedBy} changed ${memberName}'s role from ${oldRole} to ${newRole}.`;
}

// Quorum warning
export const LOG_QUORUM_WARNING = 'Warning: Vote opened without quorum present';

// Roll call attendance
export const LOG_ROLL_CALL_STARTED = 'Chair: The Secretary will now call the roll.';

export function logRollCallResponse(name: string, status: string): string {
  const statusText = status === 'present' ? 'Present' : status === 'excused' ? 'Excused' : 'Absent';
  return `[ROLL CALL] ${name}: ${statusText}`;
}

export function logRollCallComplete(present: number, absent: number, excused: number): string {
  return `Roll call complete: ${present} present, ${absent} absent, ${excused} excused.`;
}

export function logMemberMarkedAbsent(name: string, excused: boolean): string {
  return excused ? `${name} marked as excused absence.` : `${name} marked absent.`;
}

// Settings changes
export function logQuorumChanged(quorum: number): string {
  return `Quorum requirement set to ${quorum} member${quorum === 1 ? '' : 's'}.`;
}
