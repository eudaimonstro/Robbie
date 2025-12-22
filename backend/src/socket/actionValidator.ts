/**
 * Server-side action validation
 * Pre-validates actions before they're applied to the reducer
 * Returns meaningful error codes instead of silent failures
 */

import type { MeetingState, MeetingAction } from '@robbie/shared/types';
import type { ActionErrorCode } from '@robbie/shared/types/socket';
import { MOTIONS } from '@robbie/shared/constants';
import { wasMotionDefeated } from '@robbie/shared/utils';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: ActionErrorCode;
}

/**
 * Validate an action before applying it to the reducer
 * Returns meaningful errors instead of letting the reducer silently fail
 */
export function validateAction(state: MeetingState, action: MeetingAction): ValidationResult {
  switch (action.type) {
    case 'START_MEETING':
      if (state.meetingActive) {
        return { valid: false, error: 'Meeting is already active', errorCode: 'MEETING_ALREADY_ACTIVE' };
      }
      return { valid: true };

    case 'END_MEETING':
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      return { valid: true };

    case 'MAKE_MOTION': {
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      const definition = MOTIONS[action.motionType];
      if (!definition) {
        return { valid: false, error: `Unknown motion type: ${action.motionType}`, errorCode: 'UNKNOWN_MOTION_TYPE' };
      }
      // Check precedence if there's a current motion
      if (state.currentMotion) {
        const currentDef = MOTIONS[state.currentMotion.type];
        if (currentDef && definition.precedence < currentDef.precedence && !definition.interrupt) {
          return {
            valid: false,
            error: `Cannot make ${definition.name} while ${currentDef.name} is pending`,
            errorCode: 'MOTION_PRECEDENCE_VIOLATION'
          };
        }
      }
      // Block renewal of substantially similar defeated motions (by subject matter for main motions)
      if (wasMotionDefeated(state, action.motionType, action.text)) {
        return {
          valid: false,
          error: 'A substantially similar motion was already defeated this meeting',
          errorCode: 'MOTION_RENEWAL_BLOCKED'
        };
      }
      return { valid: true };
    }

    case 'SECOND_MOTION':
      if (!state.pendingSecond) {
        return { valid: false, error: 'No motion pending a second', errorCode: 'NO_PENDING_SECOND' };
      }
      return { valid: true };

    case 'DECLINE_SECOND':
      if (!state.pendingSecond) {
        return { valid: false, error: 'No motion pending a second', errorCode: 'NO_PENDING_SECOND' };
      }
      return { valid: true };

    case 'OPEN_VOTING':
      if (!state.currentMotion) {
        return { valid: false, error: 'No motion to vote on', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (state.votingOpen) {
        return { valid: false, error: 'Voting is already open', errorCode: 'VOTING_ALREADY_OPEN' };
      }
      return { valid: true };

    case 'CAST_VOTE':
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      if (state.voters.includes(action.voterId)) {
        return { valid: false, error: 'You have already voted', errorCode: 'ALREADY_VOTED' };
      }
      // Chair voting restriction (unless suspended or deciding vote)
      if (!action.isChairDecidingVote) {
        const voter = state.members.find(m => m.id === action.voterId);
        if (voter?.role === 'chair') {
          const ruleActive = !state.suspendedRules.some(
            s => s.rule === 'chair-voting-restriction' && !s.actionCompleted
          );
          if (ruleActive) {
            return { valid: false, error: 'Chair cannot vote except to break ties', errorCode: 'CHAIR_CANNOT_VOTE' };
          }
        }
      }
      return { valid: true };

    case 'CLOSE_VOTING':
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      return { valid: true };

    case 'WITHDRAW_MOTION': {
      const motionToWithdraw = state.pendingSecond || state.currentMotion;
      if (!motionToWithdraw) {
        return { valid: false, error: 'No motion to withdraw', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (motionToWithdraw.moverId !== action.requesterId) {
        return { valid: false, error: 'Only the motion maker can withdraw their motion', errorCode: 'NOT_MOTION_MAKER' };
      }
      if (state.votingOpen) {
        return { valid: false, error: 'Cannot withdraw motion while voting is in progress', errorCode: 'VOTING_IN_PROGRESS' };
      }
      return { valid: true };
    }

    case 'MODIFY_MOTION': {
      const motionToModify = state.pendingSecond || state.currentMotion;
      if (!motionToModify) {
        return { valid: false, error: 'No motion to modify', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (motionToModify.moverId !== action.requesterId) {
        return { valid: false, error: 'Only the motion maker can modify their motion', errorCode: 'NOT_MOTION_MAKER' };
      }
      if (state.currentMotion && state.currentMotion.moverHasSpoken) {
        return { valid: false, error: 'Cannot modify motion after debate has begun - use amendment instead', errorCode: 'DEBATE_BEGUN' };
      }
      if (state.votingOpen) {
        return { valid: false, error: 'Cannot modify motion while voting is in progress', errorCode: 'VOTING_IN_PROGRESS' };
      }
      if (!action.newText || action.newText.trim().length === 0) {
        return { valid: false, error: 'New motion text cannot be empty', errorCode: 'INVALID_ACTION' };
      }
      return { valid: true };
    }

    case 'RAISE_HAND': {
      if (!state.currentMotion) {
        return { valid: false, error: 'No motion on the floor', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (!state.currentMotion.debatable) {
        return { valid: false, error: 'Current motion is not debatable', errorCode: 'MOTION_NOT_DEBATABLE' };
      }
      // Check if already in queue
      const alreadyInQueue = state.speakerQueue.some(e => e.member.id === action.member.id);
      if (alreadyInQueue) {
        return { valid: false, error: 'Already in speaker queue', errorCode: 'ALREADY_IN_QUEUE' };
      }
      // Check for side-switching (member already spoke with different stance)
      if (action.stance !== 'neutral') {
        const previousStance = state.debatePositions[action.member.id];
        if (previousStance && previousStance !== action.stance) {
          const debateRulesSuspended = state.suspendedRules.some(
            s => s.rule === 'debate-rules' && !s.actionCompleted
          );
          if (!debateRulesSuspended) {
            return {
              valid: false,
              error: `You already spoke ${previousStance} on this motion. Cannot switch to ${action.stance}.`,
              errorCode: 'CANNOT_SWITCH_SIDES'
            };
          }
        }
      }
      return { valid: true };
    }

    case 'LOWER_HAND': {
      const inQueue = state.speakerQueue.some(e => e.member.id === action.member.id);
      if (!inQueue) {
        return { valid: false, error: 'Not in speaker queue', errorCode: 'NOT_IN_QUEUE' };
      }
      return { valid: true };
    }

    case 'RECOGNIZE_SPEAKER': {
      const speakerInQueue = state.speakerQueue.some(e => e.member.id === action.member.id);
      if (!speakerInQueue) {
        return { valid: false, error: 'Member is not in speaker queue', errorCode: 'NOT_IN_QUEUE' };
      }
      if (state.recognizedSpeaker) {
        return { valid: false, error: 'Another speaker already has the floor', errorCode: 'SPEAKER_HAS_FLOOR' };
      }
      // Enforce motion-maker-priority: mover speaks first unless rule is suspended
      if (state.currentMotion && state.currentMotion.debatable && !state.currentMotion.moverHasSpoken) {
        const isMover = state.currentMotion.moverId === action.member.id;
        const prioritySuspended = state.suspendedRules.some(
          s => s.rule === 'motion-maker-priority' && !s.actionCompleted
        );
        if (!isMover && !prioritySuspended) {
          const mover = state.members.find(m => m.id === state.currentMotion?.moverId);
          return {
            valid: false,
            error: `Motion maker (${mover?.name || 'the mover'}) must speak first`,
            errorCode: 'MOVER_SPEAKS_FIRST'
          };
        }
      }
      return { valid: true };
    }

    case 'YIELD_FLOOR':
      if (!state.recognizedSpeaker) {
        return { valid: false, error: 'No speaker has the floor', errorCode: 'NO_SPEAKER' };
      }
      return { valid: true };

    case 'ADOPT_AGENDA':
      if (state.agendaAdopted) {
        return { valid: false, error: 'Agenda is already adopted', errorCode: 'AGENDA_ALREADY_ADOPTED' };
      }
      return { valid: true };

    case 'AGENDA_OBJECTION':
      if (state.agendaAdopted) {
        return { valid: false, error: 'Agenda is already adopted', errorCode: 'AGENDA_ALREADY_ADOPTED' };
      }
      if (state.agendaObjection) {
        return { valid: false, error: 'Objection already registered', errorCode: 'OBJECTION_ALREADY_REGISTERED' };
      }
      return { valid: true };

    case 'CALL_AGENDA_ITEM': {
      if (!state.agendaAdopted) {
        return { valid: false, error: 'Agenda must be adopted first', errorCode: 'AGENDA_NOT_ADOPTED' };
      }
      const item = state.agenda.find(a => a.id === action.id);
      if (!item) {
        return { valid: false, error: 'Agenda item not found', errorCode: 'ITEM_NOT_FOUND' };
      }
      if (item.status === 'completed') {
        return { valid: false, error: 'Agenda item already completed', errorCode: 'ITEM_ALREADY_COMPLETED' };
      }
      return { valid: true };
    }

    case 'COMPLETE_AGENDA_ITEM':
      if (!state.currentAgendaItem) {
        return { valid: false, error: 'No agenda item is active', errorCode: 'NO_ACTIVE_ITEM' };
      }
      if (state.currentAgendaItem.id !== action.id) {
        return { valid: false, error: 'Cannot complete a different agenda item', errorCode: 'WRONG_AGENDA_ITEM' };
      }
      return { valid: true };

    case 'REQUEST_UNANIMOUS_CONSENT':
      if (!state.currentMotion) {
        return { valid: false, error: 'No motion on the floor', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (state.unanimousConsentPending) {
        return { valid: false, error: 'Unanimous consent already pending', errorCode: 'CONSENT_ALREADY_PENDING' };
      }
      return { valid: true };

    case 'OBJECT_TO_CONSENT':
      if (!state.unanimousConsentPending) {
        return { valid: false, error: 'No unanimous consent request pending', errorCode: 'NO_CONSENT_PENDING' };
      }
      return { valid: true };

    case 'UNANIMOUS_CONSENT_PASSED':
      if (!state.unanimousConsentPending) {
        return { valid: false, error: 'No unanimous consent request pending', errorCode: 'NO_CONSENT_PENDING' };
      }
      return { valid: true };

    case 'APPROVE_MINUTES':
      if (state.minutesApproved) {
        return { valid: false, error: 'Minutes are already approved', errorCode: 'MINUTES_ALREADY_APPROVED' };
      }
      return { valid: true };

    case 'OPEN_NOMINATIONS':
      if (state.nominationsOpen) {
        return { valid: false, error: 'Nominations are already open', errorCode: 'NOMINATIONS_ALREADY_OPEN' };
      }
      return { valid: true };

    case 'NOMINATE': {
      if (!state.nominationsOpen) {
        return { valid: false, error: 'Nominations are not open', errorCode: 'NOMINATIONS_NOT_OPEN' };
      }
      if (state.currentNominationPosition !== action.position) {
        return { valid: false, error: 'Nominations are for a different position', errorCode: 'WRONG_POSITION' };
      }
      // Check if already nominated
      const alreadyNominated = state.nominations.some(
        n => n.position === action.position && n.nomineeId === action.nomineeId && !n.declined
      );
      if (alreadyNominated) {
        return { valid: false, error: 'Member is already nominated for this position', errorCode: 'ALREADY_NOMINATED' };
      }
      return { valid: true };
    }

    case 'DECLINE_NOMINATION': {
      const nomination = state.nominations.find(n => n.id === action.nominationId);
      if (!nomination) {
        return { valid: false, error: 'Nomination not found', errorCode: 'NOMINATION_NOT_FOUND' };
      }
      if (nomination.declined) {
        return { valid: false, error: 'Nomination is already declined', errorCode: 'NOMINATION_ALREADY_DECLINED' };
      }
      return { valid: true };
    }

    case 'CLOSE_NOMINATIONS':
      if (!state.nominationsOpen) {
        return { valid: false, error: 'Nominations are not open', errorCode: 'NOMINATIONS_NOT_OPEN' };
      }
      return { valid: true };

    case 'START_ELECTION':
      if (state.currentElection) {
        return { valid: false, error: 'An election is already in progress', errorCode: 'ELECTION_IN_PROGRESS' };
      }
      return { valid: true };

    case 'CAST_BALLOT':
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return { valid: false, error: 'Election voting is not open', errorCode: 'ELECTION_VOTING_NOT_OPEN' };
      }
      if (state.currentElection.votersWhoVoted.includes(action.voterId)) {
        return { valid: false, error: 'You have already voted in this election', errorCode: 'ALREADY_VOTED_ELECTION' };
      }
      return { valid: true };

    case 'CLOSE_ELECTION':
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return { valid: false, error: 'Election voting is not open', errorCode: 'ELECTION_VOTING_NOT_OPEN' };
      }
      return { valid: true };

    case 'DECLARE_ELECTED':
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      return { valid: true };

    case 'ASK_INQUIRY':
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      return { valid: true };

    case 'ANSWER_INQUIRY': {
      const inquiry = state.inquiries.find(i => i.id === action.inquiryId);
      if (!inquiry) {
        return { valid: false, error: 'Inquiry not found', errorCode: 'INQUIRY_NOT_FOUND' };
      }
      if (inquiry.answer) {
        return { valid: false, error: 'Inquiry is already answered', errorCode: 'INQUIRY_ALREADY_ANSWERED' };
      }
      return { valid: true };
    }

    case 'SET_MEMBER_ROLE': {
      const targetMember = state.members.find(m => m.id === action.targetMemberId);
      if (!targetMember) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      if (targetMember.role === action.newRole) {
        return { valid: false, error: `Member is already a ${action.newRole}`, errorCode: 'ROLE_UNCHANGED' };
      }
      return { valid: true };
    }

    case 'SET_MEMBER_PRESENCE': {
      const member = state.members.find(m => m.id === action.memberId);
      if (!member) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'ADD_MEMBER': {
      const existingMember = state.members.find(m => m.id === action.member.id);
      if (existingMember) {
        return { valid: false, error: 'Member already exists', errorCode: 'MEMBER_EXISTS' };
      }
      return { valid: true };
    }

    case 'PRESENT_COMMITTEE_REPORT': {
      const report = state.committeeReports.find(r => r.id === action.reportId);
      if (!report) {
        return { valid: false, error: 'Report not found', errorCode: 'REPORT_NOT_FOUND' };
      }
      if (report.presented) {
        return { valid: false, error: 'Report is already presented', errorCode: 'REPORT_ALREADY_PRESENTED' };
      }
      return { valid: true };
    }

    case 'RESTORE_RULE': {
      const suspension = state.suspendedRules.find(s => s.id === action.suspensionId);
      if (!suspension) {
        return { valid: false, error: 'Rule suspension not found', errorCode: 'SUSPENSION_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'CHAIR_RULING':
      // Chair rulings require context of what's being ruled on
      // The reducer handles context-specific validation
      return { valid: true };

    // Actions that are always valid if meeting is active
    case 'ADD_AGENDA_ITEM':
    case 'REMOVE_AGENDA_ITEM':
    case 'REORDER_AGENDA':
    case 'SET_SPEAKER_TIME_LIMIT':
    case 'SET_VOTE_TIME_LIMIT':
    case 'SET_VOTING_METHOD':
    case 'ADVANCE_MEETING_STAGE':
    case 'SET_PREVIOUS_MINUTES':
    case 'ADD_COMMITTEE_REPORT':
    case 'SUSPEND_RULE_APPROVED':
      return { valid: true };

    default:
      // Unknown action type - let reducer handle it
      return { valid: true };
  }
}
