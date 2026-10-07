/**
 * Server-side action validation
 * Pre-validates actions before they're applied to the reducer
 * Returns meaningful error codes instead of silent failures
 */

import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';
import type { ActionErrorCode } from '@robbie-bylawyer/shared/types/socket';
import { DISPLAYABLE_STAGES, MOTIONS } from '@robbie-bylawyer/shared/constants';
import {
  canChairVoteDecide,
  isRuleSuspended,
  isSecondaryAmendmentInOrder,
  wasMotionDefeated,
} from '@robbie-bylawyer/shared/utils';

/** The most people the chair can count in the room without an account */
export const MAX_HEADCOUNT = 100_000;

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
        return {
          valid: false,
          error: 'Meeting is already active',
          errorCode: 'MEETING_ALREADY_ACTIVE',
        };
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
      // A motion made during a vote would become the pending question and take over the votes
      // already cast, and one made while another awaits a second would replace it
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'No motion can be made while a vote is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (state.pendingSecond) {
        return {
          valid: false,
          error: 'Another motion is waiting for a second',
          errorCode: 'MOTION_PRECEDENCE_VIOLATION',
        };
      }
      // Validate motion text length
      if (action.text && action.text.length > 500) {
        return {
          valid: false,
          error: 'Motion text exceeds 500 character limit',
          errorCode: 'INVALID_ACTION',
        };
      }
      const definition = MOTIONS[action.motionType];
      if (!definition) {
        return {
          valid: false,
          error: `Unknown motion type: ${action.motionType}`,
          errorCode: 'UNKNOWN_MOTION_TYPE',
        };
      }
      // Motions whose effect depends on details: without them the motion could be adopted and
      // then do nothing
      const missingDetails =
        (action.motionType === 'takeFromTable' &&
          !state.tabledMotions.some((m) => m.id === action.tabledMotionId)) ||
        (action.motionType === 'reconsider' &&
          !state.completedMotions.some((m) => m.id === action.reconsideredMotionId)) ||
        (action.motionType === 'suspendRules' &&
          !(action.ruleSuspension?.rule && action.ruleSuspension?.scope)) ||
        (action.motionType === 'bylawAmendment' &&
          !(action.bylawAmendment?.documentId && action.bylawAmendment?.changeType)) ||
        (action.motionType === 'amendAgenda' && !action.agendaAmendment?.action);
      if (missingDetails) {
        return {
          valid: false,
          error: `${definition.name} needs details this request did not include`,
          errorCode: 'INVALID_ACTION',
        };
      }
      // A secondary amendment is in order only on a pending primary amendment; its numeric
      // precedence can't express that, so it is checked by type instead
      if (action.motionType === 'amendAmendment') {
        if (!isSecondaryAmendmentInOrder(state)) {
          return {
            valid: false,
            error: 'Amend the Amendment is only in order while an amendment is pending',
            errorCode: 'MOTION_PRECEDENCE_VIOLATION',
          };
        }
      } else if (state.currentMotion) {
        // Check precedence if there's a current motion
        const currentDef = MOTIONS[state.currentMotion.type];
        if (currentDef && definition.precedence < currentDef.precedence && !definition.interrupt) {
          return {
            valid: false,
            error: `Cannot make ${definition.name} while ${currentDef.name} is pending`,
            errorCode: 'MOTION_PRECEDENCE_VIOLATION',
          };
        }
      }
      // Block renewal of substantially similar defeated motions (by subject matter for main motions)
      if (wasMotionDefeated(state, action.motionType, action.text, action.bylawAmendment)) {
        return {
          valid: false,
          error: 'A substantially similar motion was already defeated this meeting',
          errorCode: 'MOTION_RENEWAL_BLOCKED',
        };
      }
      return { valid: true };
    }

    case 'SECOND_MOTION':
      if (!state.pendingSecond) {
        return {
          valid: false,
          error: 'No motion pending a second',
          errorCode: 'NO_PENDING_SECOND',
        };
      }
      // RONR: the mover can't second their own motion (unless that rule is suspended)
      if (
        action.seconderId !== undefined &&
        action.seconderId === state.pendingSecond.moverId &&
        !isRuleSuspended(state, 'mover-cannot-second')
      ) {
        return {
          valid: false,
          error: 'You cannot second your own motion',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    case 'DECLINE_SECOND':
      if (!state.pendingSecond) {
        return {
          valid: false,
          error: 'No motion pending a second',
          errorCode: 'NO_PENDING_SECOND',
        };
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
      // A member who has voted may change the vote until the result is announced (RONR); the
      // reducer moves the count from the old choice to the new one
      // Chair voting restriction (unless suspended): the chair votes only when the vote would
      // change the result. That is checked here, not taken from the client's flag.
      {
        const voter = state.members.find((m) => m.id === action.voterId);
        // On a secret ballot the chair votes like any member (RONR)
        if (
          voter?.role === 'chair' &&
          state.votingMethod !== 'ballot' &&
          !isRuleSuspended(state, 'chair-voting-restriction')
        ) {
          // Judge on the other members' votes, leaving out a vote the chair already cast
          const previous = state.voterChoices[action.voterId];
          const othersVotes = previous
            ? { ...state.votes, [previous]: state.votes[previous] - 1 }
            : state.votes;
          const decides =
            action.isChairDecidingVote &&
            canChairVoteDecide(othersVotes, state.currentMotion?.vote ?? 'majority');
          if (!decides) {
            return {
              valid: false,
              error: "The chair votes only when the chair's vote would change the result",
              errorCode: 'CHAIR_CANNOT_VOTE',
            };
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
        return {
          valid: false,
          error: 'Only the motion maker can withdraw their motion',
          errorCode: 'NOT_MOTION_MAKER',
        };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot withdraw motion while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      return { valid: true };
    }

    case 'MODIFY_MOTION': {
      const motionToModify = state.pendingSecond || state.currentMotion;
      if (!motionToModify) {
        return { valid: false, error: 'No motion to modify', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (motionToModify.moverId !== action.requesterId) {
        return {
          valid: false,
          error: 'Only the motion maker can modify their motion',
          errorCode: 'NOT_MOTION_MAKER',
        };
      }
      if (state.currentMotion && state.currentMotion.moverHasSpoken) {
        return {
          valid: false,
          error: 'Cannot modify motion after debate has begun - use amendment instead',
          errorCode: 'DEBATE_BEGUN',
        };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot modify motion while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (!action.newText || action.newText.trim().length === 0) {
        return {
          valid: false,
          error: 'New motion text cannot be empty',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (action.newText.length > 500) {
        return {
          valid: false,
          error: 'Motion text exceeds 500 character limit',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'RAISE_HAND': {
      if (!state.currentMotion) {
        return { valid: false, error: 'No motion on the floor', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (!state.currentMotion.debatable) {
        return {
          valid: false,
          error: 'Current motion is not debatable',
          errorCode: 'MOTION_NOT_DEBATABLE',
        };
      }
      // Check if already in queue
      const alreadyInQueue = state.speakerQueue.some((e) => e.member.id === action.member.id);
      if (alreadyInQueue) {
        return { valid: false, error: 'Already in speaker queue', errorCode: 'ALREADY_IN_QUEUE' };
      }
      // Check for side-switching (member already spoke with different stance)
      if (action.stance !== 'neutral') {
        const previousStance = state.debatePositions[action.member.id];
        if (previousStance && previousStance !== action.stance) {
          const debateRulesSuspended = state.suspendedRules.some(
            (s) => s.rule === 'debate-rules' && !s.actionCompleted,
          );
          if (!debateRulesSuspended) {
            return {
              valid: false,
              error: `You already spoke ${previousStance} on this motion. Cannot switch to ${action.stance}.`,
              errorCode: 'CANNOT_SWITCH_SIDES',
            };
          }
        }
      }
      return { valid: true };
    }

    case 'LOWER_HAND': {
      const inQueue = state.speakerQueue.some((e) => e.member.id === action.member.id);
      if (!inQueue) {
        return { valid: false, error: 'Not in speaker queue', errorCode: 'NOT_IN_QUEUE' };
      }
      return { valid: true };
    }

    case 'RECOGNIZE_SPEAKER': {
      const speakerInQueue = state.speakerQueue.some((e) => e.member.id === action.member.id);
      if (!speakerInQueue) {
        return { valid: false, error: 'Member is not in speaker queue', errorCode: 'NOT_IN_QUEUE' };
      }
      if (state.recognizedSpeaker) {
        return {
          valid: false,
          error: 'Another speaker already has the floor',
          errorCode: 'SPEAKER_HAS_FLOOR',
        };
      }
      // Enforce motion-maker-priority: mover speaks first unless rule is suspended
      if (
        state.currentMotion &&
        state.currentMotion.debatable &&
        !state.currentMotion.moverHasSpoken
      ) {
        const isMover = state.currentMotion.moverId === action.member.id;
        const prioritySuspended = state.suspendedRules.some(
          (s) => s.rule === 'motion-maker-priority' && !s.actionCompleted,
        );
        if (!isMover && !prioritySuspended) {
          const mover = state.members.find((m) => m.id === state.currentMotion?.moverId);
          return {
            valid: false,
            error: `Motion maker (${mover?.name || 'the mover'}) must speak first`,
            errorCode: 'MOVER_SPEAKS_FIRST',
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
        return {
          valid: false,
          error: 'Agenda is already adopted',
          errorCode: 'AGENDA_ALREADY_ADOPTED',
        };
      }
      return { valid: true };

    case 'AGENDA_OBJECTION':
      if (state.agendaAdopted) {
        return {
          valid: false,
          error: 'Agenda is already adopted',
          errorCode: 'AGENDA_ALREADY_ADOPTED',
        };
      }
      if (state.agendaObjection) {
        return {
          valid: false,
          error: 'Objection already registered',
          errorCode: 'OBJECTION_ALREADY_REGISTERED',
        };
      }
      return { valid: true };

    case 'CALL_AGENDA_ITEM': {
      if (!state.agendaAdopted) {
        return {
          valid: false,
          error: 'Agenda must be adopted first',
          errorCode: 'AGENDA_NOT_ADOPTED',
        };
      }
      const item = state.agenda.find((a) => a.id === action.id);
      if (!item) {
        return { valid: false, error: 'Agenda item not found', errorCode: 'ITEM_NOT_FOUND' };
      }
      if (item.status === 'completed') {
        return {
          valid: false,
          error: 'Agenda item already completed',
          errorCode: 'ITEM_ALREADY_COMPLETED',
        };
      }
      return { valid: true };
    }

    case 'COMPLETE_AGENDA_ITEM':
      if (!state.currentAgendaItem) {
        return { valid: false, error: 'No agenda item is active', errorCode: 'NO_ACTIVE_ITEM' };
      }
      if (state.currentAgendaItem.id !== action.id) {
        return {
          valid: false,
          error: 'Cannot complete a different agenda item',
          errorCode: 'WRONG_AGENDA_ITEM',
        };
      }
      return { valid: true };

    case 'REQUEST_UNANIMOUS_CONSENT':
      if (!state.currentMotion) {
        return { valid: false, error: 'No motion on the floor', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (state.unanimousConsentPending) {
        return {
          valid: false,
          error: 'Unanimous consent already pending',
          errorCode: 'CONSENT_ALREADY_PENDING',
        };
      }
      return { valid: true };

    case 'OBJECT_TO_CONSENT':
      if (!state.unanimousConsentPending) {
        return {
          valid: false,
          error: 'No unanimous consent request pending',
          errorCode: 'NO_CONSENT_PENDING',
        };
      }
      return { valid: true };

    case 'UNANIMOUS_CONSENT_PASSED':
      if (!state.unanimousConsentPending) {
        return {
          valid: false,
          error: 'No unanimous consent request pending',
          errorCode: 'NO_CONSENT_PENDING',
        };
      }
      return { valid: true };

    case 'APPROVE_MINUTES':
      if (state.minutesApproved) {
        return {
          valid: false,
          error: 'Minutes are already approved',
          errorCode: 'MINUTES_ALREADY_APPROVED',
        };
      }
      return { valid: true };

    case 'OPEN_NOMINATIONS':
      if (state.nominationsOpen) {
        return {
          valid: false,
          error: 'Nominations are already open',
          errorCode: 'NOMINATIONS_ALREADY_OPEN',
        };
      }
      return { valid: true };

    case 'NOMINATE': {
      if (!state.nominationsOpen) {
        return {
          valid: false,
          error: 'Nominations are not open',
          errorCode: 'NOMINATIONS_NOT_OPEN',
        };
      }
      if (state.currentNominationPosition !== action.position) {
        return {
          valid: false,
          error: 'Nominations are for a different position',
          errorCode: 'WRONG_POSITION',
        };
      }
      // Check if already nominated. A nominee from outside the meeting has no member ID (0),
      // so they are told apart by name.
      const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
      const alreadyNominated = state.nominations.some(
        (n) =>
          n.position === action.position &&
          !n.declined &&
          (action.nomineeId
            ? n.nomineeId === action.nomineeId
            : !n.nomineeId && sameName(n.nomineeName, action.nomineeName)),
      );
      if (alreadyNominated) {
        return {
          valid: false,
          error: 'Member is already nominated for this position',
          errorCode: 'ALREADY_NOMINATED',
        };
      }
      return { valid: true };
    }

    case 'DECLINE_NOMINATION': {
      const nomination = state.nominations.find((n) => n.id === action.nominationId);
      if (!nomination) {
        return { valid: false, error: 'Nomination not found', errorCode: 'NOMINATION_NOT_FOUND' };
      }
      if (nomination.declined) {
        return {
          valid: false,
          error: 'Nomination is already declined',
          errorCode: 'NOMINATION_ALREADY_DECLINED',
        };
      }
      return { valid: true };
    }

    case 'CLOSE_NOMINATIONS':
      if (!state.nominationsOpen) {
        return {
          valid: false,
          error: 'Nominations are not open',
          errorCode: 'NOMINATIONS_NOT_OPEN',
        };
      }
      return { valid: true };

    case 'START_ELECTION':
      if (state.currentElection) {
        return {
          valid: false,
          error: 'An election is already in progress',
          errorCode: 'ELECTION_IN_PROGRESS',
        };
      }
      return { valid: true };

    case 'CAST_BALLOT':
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return {
          valid: false,
          error: 'Election voting is not open',
          errorCode: 'ELECTION_VOTING_NOT_OPEN',
        };
      }
      if (state.currentElection.votersWhoVoted.includes(action.voterId)) {
        return {
          valid: false,
          error: 'You have already voted in this election',
          errorCode: 'ALREADY_VOTED_ELECTION',
        };
      }
      return { valid: true };

    case 'CLOSE_ELECTION':
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return {
          valid: false,
          error: 'Election voting is not open',
          errorCode: 'ELECTION_VOTING_NOT_OPEN',
        };
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
      if (action.question && action.question.length > 500) {
        return {
          valid: false,
          error: 'Question exceeds 500 character limit',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    case 'ANSWER_INQUIRY': {
      const inquiry = state.inquiries.find((i) => i.id === action.inquiryId);
      if (!inquiry) {
        return { valid: false, error: 'Inquiry not found', errorCode: 'INQUIRY_NOT_FOUND' };
      }
      if (inquiry.answer) {
        return {
          valid: false,
          error: 'Inquiry is already answered',
          errorCode: 'INQUIRY_ALREADY_ANSWERED',
        };
      }
      if (action.answer && action.answer.length > 1000) {
        return {
          valid: false,
          error: 'Answer exceeds 1000 character limit',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'SET_MEMBER_ROLE': {
      const targetMember = state.members.find((m) => m.id === action.targetMemberId);
      if (!targetMember) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      if (targetMember.role === action.newRole) {
        return {
          valid: false,
          error: `Member is already a ${action.newRole}`,
          errorCode: 'ROLE_UNCHANGED',
        };
      }
      return { valid: true };
    }

    case 'SET_MEMBER_PRESENCE': {
      const member = state.members.find((m) => m.id === action.memberId);
      if (!member) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'ADD_MEMBER': {
      const existingMember = state.members.find((m) => m.id === action.member.id);
      if (existingMember) {
        return { valid: false, error: 'Member already exists', errorCode: 'MEMBER_EXISTS' };
      }
      return { valid: true };
    }

    case 'PRESENT_COMMITTEE_REPORT': {
      const report = state.committeeReports.find((r) => r.id === action.reportId);
      if (!report) {
        return { valid: false, error: 'Report not found', errorCode: 'REPORT_NOT_FOUND' };
      }
      if (report.presented) {
        return {
          valid: false,
          error: 'Report is already presented',
          errorCode: 'REPORT_ALREADY_PRESENTED',
        };
      }
      return { valid: true };
    }

    case 'RESTORE_RULE': {
      const suspension = state.suspendedRules.find((s) => s.id === action.suspensionId);
      if (!suspension) {
        return {
          valid: false,
          error: 'Rule suspension not found',
          errorCode: 'SUSPENSION_NOT_FOUND',
        };
      }
      return { valid: true };
    }

    case 'CHAIR_RULING':
      // A ruling pops the pending motion; during a vote that would leave the vote open with
      // nothing to decide, and closing it would then drop the motion underneath undecided
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'The chair cannot rule while a vote is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      // The reducer handles context-specific validation
      return { valid: true };

    // Proxy voting actions - block modifications during voting to prevent race conditions
    case 'SET_PROXY_SETTINGS':
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot change proxy settings while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      return { valid: true };

    case 'GRANT_PROXY': {
      if (!state.allowProxyVoting) {
        return {
          valid: false,
          error: 'Proxy voting is not enabled',
          errorCode: 'PROXY_VOTING_DISABLED',
        };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot grant proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (action.grantedBy === action.grantedTo) {
        return {
          valid: false,
          error: 'Cannot grant proxy to yourself',
          errorCode: 'CANNOT_PROXY_SELF',
        };
      }
      const grantingMember = state.members.find((m) => m.id === action.grantedBy);
      if (!grantingMember) {
        return { valid: false, error: 'Granting member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      const receivingMember = state.members.find((m) => m.id === action.grantedTo);
      if (!receivingMember) {
        return { valid: false, error: 'Receiving member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      if (!receivingMember.present) {
        return {
          valid: false,
          error: 'Proxy receiver must be present',
          errorCode: 'RECEIVER_NOT_PRESENT',
        };
      }
      // Check max proxies limit (0 = unlimited)
      if (state.maxProxiesPerMember > 0) {
        const currentProxyCount = state.proxies.filter(
          (p) => p.grantedTo === action.grantedTo,
        ).length;
        if (currentProxyCount >= state.maxProxiesPerMember) {
          return {
            valid: false,
            error: `Member already holds maximum ${state.maxProxiesPerMember} proxies`,
            errorCode: 'MAX_PROXIES_REACHED',
          };
        }
      }
      // Check if granting member already has an active proxy
      const existingProxy = state.proxies.find((p) => p.grantedBy === action.grantedBy);
      if (existingProxy) {
        return {
          valid: false,
          error: 'Member already has an active proxy',
          errorCode: 'PROXY_ALREADY_GRANTED',
        };
      }
      return { valid: true };
    }

    case 'REVOKE_PROXY': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot revoke proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const proxy = state.proxies.find((p) => p.id === action.proxyId);
      if (!proxy) {
        return { valid: false, error: 'Proxy not found', errorCode: 'PROXY_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'CAST_PROXY_VOTE': {
      if (!state.allowProxyVoting) {
        return {
          valid: false,
          error: 'Proxy voting is not enabled',
          errorCode: 'PROXY_VOTING_DISABLED',
        };
      }
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      // Verify the caster has proxy authority for this member
      const proxy = state.proxies.find(
        (p) => p.grantedBy === action.forMemberId && p.grantedTo === action.castById,
      );
      if (!proxy) {
        return {
          valid: false,
          error: 'No proxy authority for this member',
          errorCode: 'NO_PROXY_AUTHORITY',
        };
      }
      // A proxy may cast or change the member's vote, but not replace one cast in person
      const votedInPerson =
        state.voters.includes(action.forMemberId) &&
        !state.proxyVotes.some((pv) => pv.memberId === action.forMemberId);
      if (votedInPerson) {
        return {
          valid: false,
          error: 'This member has already voted in person',
          errorCode: 'ALREADY_VOTED',
        };
      }
      return { valid: true };
    }

    // Member-initiated proxy request actions - also blocked during voting
    case 'REQUEST_PROXY': {
      if (!state.allowProxyVoting) {
        return {
          valid: false,
          error: 'Proxy voting is not enabled',
          errorCode: 'PROXY_VOTING_DISABLED',
        };
      }
      if (!state.allowMemberProxyGrant) {
        return {
          valid: false,
          error: 'Member proxy requests are not enabled',
          errorCode: 'MEMBER_PROXY_DISABLED',
        };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot request proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (action.requestedBy === action.requestedFor) {
        return {
          valid: false,
          error: 'Cannot request yourself as proxy holder',
          errorCode: 'CANNOT_PROXY_SELF',
        };
      }
      const requestingMember = state.members.find((m) => m.id === action.requestedBy);
      if (!requestingMember) {
        return {
          valid: false,
          error: 'Requesting member not found',
          errorCode: 'MEMBER_NOT_FOUND',
        };
      }
      const designatedHolder = state.members.find((m) => m.id === action.requestedFor);
      if (!designatedHolder) {
        return {
          valid: false,
          error: 'Designated proxy holder not found',
          errorCode: 'MEMBER_NOT_FOUND',
        };
      }
      // Check for existing pending request
      const existingRequest = state.pendingProxyRequests.find(
        (r) => r.requestedBy === action.requestedBy && r.status === 'pending',
      );
      if (existingRequest) {
        return {
          valid: false,
          error: 'You already have a pending proxy request',
          errorCode: 'REQUEST_PENDING',
        };
      }
      // Check for existing active proxy
      const existingProxy = state.proxies.find((p) => p.grantedBy === action.requestedBy);
      if (existingProxy) {
        return {
          valid: false,
          error: 'You already have an active proxy',
          errorCode: 'PROXY_ALREADY_GRANTED',
        };
      }
      return { valid: true };
    }

    case 'ACCEPT_PROXY': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot accept proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const request = state.pendingProxyRequests.find((r) => r.id === action.requestId);
      if (!request) {
        return { valid: false, error: 'Proxy request not found', errorCode: 'REQUEST_NOT_FOUND' };
      }
      if (request.status !== 'pending') {
        return {
          valid: false,
          error: 'Request is no longer pending',
          errorCode: 'REQUEST_NOT_PENDING',
        };
      }
      // Check max proxies limit
      if (state.maxProxiesPerMember > 0) {
        const currentCount = state.proxies.filter(
          (p) => p.grantedTo === request.requestedFor,
        ).length;
        if (currentCount >= state.maxProxiesPerMember) {
          return {
            valid: false,
            error: `You already hold maximum ${state.maxProxiesPerMember} proxies`,
            errorCode: 'MAX_PROXIES_REACHED',
          };
        }
      }
      return { valid: true };
    }

    case 'DECLINE_PROXY': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot decline proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const request = state.pendingProxyRequests.find((r) => r.id === action.requestId);
      if (!request) {
        return { valid: false, error: 'Proxy request not found', errorCode: 'REQUEST_NOT_FOUND' };
      }
      if (request.status !== 'pending') {
        return {
          valid: false,
          error: 'Request is no longer pending',
          errorCode: 'REQUEST_NOT_PENDING',
        };
      }
      return { valid: true };
    }

    case 'CANCEL_PROXY_REQUEST': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot cancel proxy request while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const request = state.pendingProxyRequests.find((r) => r.id === action.requestId);
      if (!request) {
        return { valid: false, error: 'Proxy request not found', errorCode: 'REQUEST_NOT_FOUND' };
      }
      if (request.status !== 'pending') {
        return {
          valid: false,
          error: 'Request is no longer pending',
          errorCode: 'REQUEST_NOT_PENDING',
        };
      }
      return { valid: true };
    }

    // Roll call actions
    case 'START_ROLL_CALL':
      if (state.rollCall?.inProgress) {
        return {
          valid: false,
          error: 'Roll call is already in progress',
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };

    case 'RESPOND_ROLL_CALL': {
      if (!state.rollCall?.inProgress) {
        return {
          valid: false,
          error: 'Roll call is not in progress',
          errorCode: 'ROLL_CALL_NOT_IN_PROGRESS',
        };
      }
      const member = state.members.find((m) => m.id === action.memberId);
      if (!member) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'COMPLETE_ROLL_CALL':
      if (!state.rollCall?.inProgress) {
        return {
          valid: false,
          error: 'Roll call is not in progress',
          errorCode: 'ROLL_CALL_NOT_IN_PROGRESS',
        };
      }
      return { valid: true };

    case 'MARK_ABSENT': {
      const memberToMark = state.members.find((m) => m.id === action.memberId);
      if (!memberToMark) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'RENAME_MEMBER': {
      const memberToRename = state.members.find((m) => m.id === action.memberId);
      if (!memberToRename) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      const trimmedName = action.newName?.trim() || '';
      if (trimmedName.length < 2) {
        return {
          valid: false,
          error: 'Name must be at least 2 characters',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (trimmedName.length > 100) {
        return {
          valid: false,
          error: 'Name must be 100 characters or less',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    // Settings actions
    case 'SET_AUTO_YIELD':
      // Always valid - chair setting
      return { valid: true };

    case 'SET_MEETING_STAGE': {
      const { stage } = action;
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      // Starting and adjourning the meeting set the other stages
      if (!DISPLAYABLE_STAGES.some((s) => s.stage === stage)) {
        return { valid: false, error: 'Unknown meeting stage', errorCode: 'INVALID_ACTION' };
      }
      return { valid: true };
    }

    case 'SET_QUORUM':
      if (!Number.isInteger(action.quorum) || action.quorum < 1) {
        return {
          valid: false,
          error: 'Quorum must be a whole number of at least 1',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    // Attendance
    case 'MARK_PRESENT': {
      // The server fills in member from the organization's roster (see attendanceActions.ts)
      if (!action.member || action.member.id !== action.userId) {
        return {
          valid: false,
          error: "That person isn't in the organization",
          errorCode: 'NOT_A_MEMBER',
        };
      }
      const existing = state.members.find((m) => m.id === action.userId);
      if (existing?.present && existing.presentBy === 'chair') {
        return {
          valid: false,
          error: `${existing.name} is already marked present`,
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };
    }

    case 'SET_HEADCOUNT': {
      if (!Number.isInteger(action.count) || action.count < 0 || action.count > MAX_HEADCOUNT) {
        return {
          valid: false,
          error: `The headcount must be a whole number from 0 to ${MAX_HEADCOUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      const names = Array.isArray(action.names) ? action.names : null;
      if (
        !names ||
        names.some((n) => typeof n !== 'string' || n.trim().length > 100) ||
        names.filter((n) => n.trim().length > 0).length > action.count
      ) {
        return {
          valid: false,
          error: 'Give at most one name for each person counted, each up to 100 characters',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'RELOAD_AGENDA':
      // Once the meeting starts, the agenda is changed in the meeting
      if (state.meetingActive || state.meetingStage !== 'not-started') {
        return {
          valid: false,
          error: 'The meeting has started; change the agenda in the meeting',
          errorCode: 'MEETING_ALREADY_ACTIVE',
        };
      }
      return { valid: true };

    case 'REFRESH_MEMBERS':
      // Server-only, from the organization's roster
      return { valid: true };

    case 'REORDER_AGENDA': {
      const inAgenda = (index: number) =>
        Number.isInteger(index) && index >= 0 && index < state.agenda.length;
      if (!inAgenda(action.fromIndex) || !inAgenda(action.toIndex)) {
        return {
          valid: false,
          error: 'The agenda has changed; reload and try again',
          errorCode: 'ITEM_NOT_FOUND',
        };
      }
      return { valid: true };
    }

    // Actions that are always valid if meeting is active
    case 'ADD_AGENDA_ITEM':
    case 'REMOVE_AGENDA_ITEM':
    case 'SET_SPEAKER_TIME_LIMIT':
    case 'SET_VOTE_TIME_LIMIT':
    case 'SET_VOTING_METHOD':
    case 'ADVANCE_MEETING_STAGE':
    case 'SET_PREVIOUS_MINUTES':
    case 'ADD_COMMITTEE_REPORT':
    case 'SUSPEND_RULE_APPROVED':
      return { valid: true };

    default: {
      // Every action type needs a case above; this fails to compile if one is missing
      const unhandled: never = action;
      void unhandled;
      // Unknown action type from a client - reject for safety
      return { valid: false, error: 'Unknown action type', errorCode: 'INVALID_ACTION' };
    }
  }
}
