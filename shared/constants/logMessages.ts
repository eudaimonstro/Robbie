/**
 * Centralized log message factory functions
 * Ensures consistency and makes log messages easier to maintain
 */

// Meeting lifecycle
export const LOG_MEETING_CALLED_TO_ORDER = 'Meeting called to order.';
export const LOG_MEETING_ADJOURNED = 'Meeting adjourned.';

/** The business left pending at adjournment, each as "the election for Treasurer" */
export function logAdjournedUnfinished(items: string[]): string {
  const listed =
    items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '');
  return `The meeting adjourned with ${listed} unfinished.`;
}

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

/** A motion that died for want of a second: the whole line */
export const LOG_MOTION_FAILED_NO_SECOND = 'Motion fails for lack of a second.';

/** How a withdrawal's line ends, after the mover's name */
export const LOG_MOTION_WITHDRAWN = "'s motion is withdrawn.";

export function logMotionWithdrawn(mover: string): string {
  return `${mover}${LOG_MOTION_WITHDRAWN}`;
}

/** The mover asks to withdraw a motion already stated */
export function logWithdrawalAsked(mover: string, text: string): string {
  return `${mover} asks to withdraw the motion "${text}".`;
}

/** The chair takes up a question postponed to later in the meeting */
export function logTakenUp(text: string): string {
  return `The chair takes up the motion postponed earlier: "${text}"`;
}

/** The chair ends a recess */
export const LOG_MEETING_RESUMED = 'The meeting resumes.';

// Voting
export function logRollCallVote(memberName: string, vote: 'yea' | 'nay' | 'abstain'): string {
  const voteText = vote.charAt(0).toUpperCase() + vote.slice(1);
  return `[ROLL CALL] ${memberName}: ${voteText}`;
}

/** A division called on a voice vote: by a member, or from the floor */
/** A voice vote's result declared without a count: "Voice vote: the ayes have it. CARRIED." */
export function logVoiceVoteDeclared(declared: 'ayes' | 'noes', result: string): string {
  return `Voice vote: the ${declared} have it. ${result}.`;
}

export function logDivisionCalled(caller: string | null): string {
  return `${caller ?? 'A member in the room'} calls for a division: the vote is counted.`;
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
export function logUnanimousConsentObjection(objector: string): string {
  return `${objector} objects. The question is put to a vote.`;
}

/** How the line for a motion adopted by unanimous consent begins */
export const LOG_ADOPTED_BY_CONSENT = 'Motion CARRIED by unanimous consent.';

/** A motion adopted by unanimous consent, with what its adoption did after it */
export function logAdoptedByConsent(effects = ''): string {
  return `${LOG_ADOPTED_BY_CONSENT}${effects}`;
}

// Chair rulings
/** How the line for a ruling of the chair begins */
export const LOG_CHAIR_RULED = 'Chair ruled:';

export function logChairRuled(
  ruling: string,
  explanation: string | undefined,
  motionText: string,
): string {
  return `${LOG_CHAIR_RULED} ${ruling}${explanation ? ` - ${explanation}` : ''} (Re: ${motionText})`;
}

// Minutes
export const LOG_MINUTES_APPROVED = 'Minutes from previous meeting approved.';

export function logMinutesApprovedWithCorrections(corrections: string): string {
  return `Minutes from previous meeting approved with corrections: ${corrections}`;
}

// Nominations and elections
export function logNomination(nominatedBy: string, nomineeName: string, position: string): string {
  return `${nominatedBy} nominates ${nomineeName} for ${position}.`;
}

export function logElectionSetAside(position: string | null): string {
  return position ? `The election for ${position} was set aside.` : 'The election was set aside.';
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

export function logProxiesHeldSet(count: number): string {
  return count === 1
    ? '1 proxy or absentee ballot held.'
    : `${count} proxies and absentee ballots held.`;
}

// Quorum warning
export const LOG_QUORUM_WARNING = 'Warning: Vote opened without quorum present';

// Attendance
export function logMemberMarkedAbsent(name: string, excused: boolean): string {
  return excused ? `${name} marked as excused absence.` : `${name} marked absent.`;
}

// Settings changes
export function logQuorumChanged(quorum: number): string {
  return `Quorum requirement set to ${quorum} member${quorum === 1 ? '' : 's'}.`;
}
