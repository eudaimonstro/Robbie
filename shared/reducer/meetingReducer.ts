import { MOTIONS } from '../constants/motions.js';
import { getNextStage, getStageLogMessage } from '../constants/meetingStages.js';
import {
  LOG_MEETING_CALLED_TO_ORDER,
  LOG_MEETING_ADJOURNED,
  LOG_MOTION_FAILED_NO_SECOND,
  LOG_AGENDA_ADOPTED,
  LOG_AGENDA_OBJECTION,
  LOG_UNANIMOUS_CONSENT_REQUESTED,
  LOG_MINUTES_APPROVED,
  LOG_QUORUM_WARNING,
  logMotionMade,
  logMotionSeconded,
  logMotionWithdrawn,
  logMotionModified,
  logRollCallVote,
  logSpeakerRecognized,
  logSpeakerYields,
  logAgendaItemCalled,
  logAgendaItemCompleted,
  logUnanimousConsentObjection,
  logUnanimousConsentPassed,
  logCommitteeReportPresented,
  logRuleSuspended,
  logNominationsOpened,
  logNomination,
  logNominationDeclined,
  logNominationsClosed,
  logElectionVotingOpen,
  logElectionClosed,
  logElected,
  logInquiryRaised,
  logInquiryAnswered,
  logMemberJoined,
  logMemberPresenceChanged,
  LOG_ROLL_CALL_STARTED,
  logRollCallResponse,
  logRollCallComplete,
  logMemberMarkedAbsent
} from '../constants/logMessages.js';
import { applyMotionOutcome, processOutcomeResult } from '../utils/motionOutcomeHelper.js';
import { isRuleSuspended, markSingleActionComplete } from '../utils/ruleSuspensionHelper.js';
import { generateId } from '../utils/idGenerators.js';
import { calculateVoteResult } from '../utils/voteCalculator.js';
import type { MeetingState, MeetingAction, MeetingLogEntry, Inquiry, Officer, RollCallRecord } from '../types/index.js';

export function meetingReducer(state: MeetingState, action: MeetingAction): MeetingState {
  // Helper to add log entry (timestamp now comes from action)
  const log = (timestamp: string, msg: string): MeetingLogEntry[] =>
    [...state.meetingLog, { time: timestamp, message: msg }];

  switch (action.type) {
    case 'START_MEETING':
      return {
        ...state,
        meetingActive: true,
        meetingStage: 'call-to-order',
        meetingCode: action.meetingCode,
        meetingLog: log(action.timestamp, LOG_MEETING_CALLED_TO_ORDER)
      };

    case 'END_MEETING':
      // All rule suspensions end when meeting adjourns per Robert's Rules
      return {
        ...state,
        meetingActive: false,
        meetingStage: 'adjourned',
        suspendedRules: [],
        meetingLog: log(action.timestamp, LOG_MEETING_ADJOURNED)
      };

    case 'MAKE_MOTION': {
      const motionDef = MOTIONS[action.motionType];
      const motion = {
        ...motionDef,
        id: action.motionId,
        type: action.motionType,
        text: action.text,
        mover: action.mover,
        moverId: action.moverId,
        secondedBy: null,
        status: "pending" as const,
        isAgendaAdoption: action.motionType === 'adoptAgenda',
        agendaAmendment: action.agendaAmendment || null,
        ruleSuspension: action.ruleSuspension || null,
        moverHasSpoken: false,
        tabledMotionId: action.tabledMotionId,
        reconsideredMotionId: action.reconsideredMotionId,
        dividedParts: action.dividedParts
      };
      // Check if second requirement is suspended
      const secondSuspended = isRuleSuspended(state, 'second-requirement');

      if (motion.needsSecond && !secondSuspended) {
        return {
          ...state,
          pendingSecond: motion,
          // Clear lastChairRuling for non-Appeal motions
          lastChairRuling: action.motionType === 'appeal' ? state.lastChairRuling : null,
          meetingLog: log(action.timestamp, logMotionMade(action.mover, action.text, motion.name))
        };
      }
      // If second was bypassed due to suspension, note it in the log
      const bypassedSecond = motion.needsSecond && secondSuspended;
      const logMessage = bypassedSecond
        ? `${action.mover} moves: "${action.text}" (${motion.name}). [Second requirement suspended - motion proceeds directly]`
        : `${action.mover} raises ${motion.name}.`;

      // Auto-complete single-action suspension when used
      const updatedSuspensions = bypassedSecond
        ? markSingleActionComplete(state, 'second-requirement')
        : state.suspendedRules;

      return {
        ...state,
        currentMotion: motion,
        motionStack: [...state.motionStack, motion],
        suspendedRules: updatedSuspensions,
        // Clear lastChairRuling for non-Appeal motions
        lastChairRuling: action.motionType === 'appeal' ? state.lastChairRuling : null,
        meetingLog: log(action.timestamp, logMessage)
      };
    }

    case 'SECOND_MOTION':
      if (!state.pendingSecond) return state;
      const seconded = { ...state.pendingSecond, secondedBy: action.seconder, status: "active" as const };
      return {
        ...state,
        pendingSecond: null,
        currentMotion: seconded,
        motionStack: [...state.motionStack, seconded],
        meetingLog: log(action.timestamp, logMotionSeconded(action.seconder))
      };

    case 'DECLINE_SECOND':
      return {
        ...state,
        pendingSecond: null,
        meetingLog: log(action.timestamp, LOG_MOTION_FAILED_NO_SECOND)
      };

    case 'WITHDRAW_MOTION': {
      // Motion can be withdrawn if it's pending a second or is the current motion
      // Chair grants withdrawal request; mover must match
      const motionToWithdraw = state.pendingSecond || state.currentMotion;
      if (!motionToWithdraw) {
        return state; // No motion to withdraw
      }
      if (motionToWithdraw.moverId !== action.requesterId) {
        return state; // Only the mover can withdraw their motion
      }

      if (state.pendingSecond) {
        // Motion not yet seconded - can be withdrawn freely
        return {
          ...state,
          pendingSecond: null,
          meetingLog: log(action.timestamp, logMotionWithdrawn(state.pendingSecond.mover))
        };
      }

      // Motion is already seconded - remove from stack
      const newStack = state.motionStack.slice(0, -1);
      const previousMotion = newStack.length > 0 ? newStack[newStack.length - 1] : null;

      return {
        ...state,
        currentMotion: previousMotion,
        motionStack: newStack,
        votingOpen: false,
        unanimousConsentPending: false,
        speakerQueue: [],
        recognizedSpeaker: null,
        debatePositions: {},
        meetingLog: log(action.timestamp, logMotionWithdrawn(motionToWithdraw.mover))
      };
    }

    case 'MODIFY_MOTION': {
      // Motion maker can modify their motion before debate begins
      // Works for both pendingSecond and currentMotion (before mover speaks)
      const motionToModify = state.pendingSecond || state.currentMotion;
      if (!motionToModify) {
        return state; // No motion to modify
      }
      if (motionToModify.moverId !== action.requesterId) {
        return state; // Only the mover can modify their motion
      }
      // Cannot modify after debate has begun (someone has spoken)
      if (state.currentMotion && state.currentMotion.moverHasSpoken) {
        return state; // Debate has begun - use amendment instead
      }

      const modifiedMotion = {
        ...motionToModify,
        text: action.newText
      };

      if (state.pendingSecond) {
        // Motion not yet seconded
        return {
          ...state,
          pendingSecond: modifiedMotion,
          meetingLog: log(action.timestamp, logMotionModified(motionToModify.mover, action.newText))
        };
      }

      // Motion is current - update in stack too
      const newStack = [...state.motionStack.slice(0, -1), modifiedMotion];
      return {
        ...state,
        currentMotion: modifiedMotion,
        motionStack: newStack,
        meetingLog: log(action.timestamp, logMotionModified(motionToModify.mover, action.newText))
      };
    }

    case 'OPEN_VOTING': {
      let logEntries = log(action.timestamp, `Chair puts the question: "${state.currentMotion?.text}"`);
      if (action.withoutQuorum) {
        logEntries = [...logEntries, { time: action.timestamp, message: LOG_QUORUM_WARNING }];
      }
      return {
        ...state,
        votingOpen: true,
        voteTimerEnd: action.voteTimerEnd,
        votes: { yea: 0, nay: 0, abstain: 0 },
        voters: [],
        voterChoices: {},
        meetingLog: logEntries
      };
    }

    case 'CAST_VOTE': {
      // Check if voter is chair
      const voter = state.members.find(m => m.id === action.voterId);
      const isChair = voter?.role === 'chair';

      // Chair can only vote on ballot votes or when it affects outcome
      if (isChair && state.votingMethod !== 'ballot' && !action.isChairDecidingVote) {
        return state; // Chair cannot vote with members
      }

      // Allow vote changing per Robert's Rules (before vote is announced)
      const previousVote = state.voterChoices[action.voterId];
      const newVotes = { ...state.votes };

      // If changing vote, decrement previous choice
      if (previousVote) {
        newVotes[previousVote]--;
      }

      // Add new vote
      newVotes[action.vote]++;

      // Update voter choices
      const newVoterChoices = { ...state.voterChoices, [action.voterId]: action.vote };

      // Add to voters list if first time voting
      const newVoters = previousVote ? state.voters : [...state.voters, action.voterId];

      // Log roll call votes individually (when timestamp provided and roll call method)
      const rollCallLog = state.votingMethod === 'rollcall' && action.timestamp && voter && !previousVote
        ? log(action.timestamp, logRollCallVote(voter.name, action.vote))
        : state.meetingLog;

      return {
        ...state,
        votes: newVotes,
        voters: newVoters,
        voterChoices: newVoterChoices,
        meetingLog: rollCallLog
      };
    }

    case 'CLOSE_VOTING': {
      const voteCalc = calculateVoteResult(
        state.votes,
        state.currentMotion?.vote || 'majority'
      );
      const { passed, yea, nay } = voteCalc;
      const newStack = state.motionStack.slice(0, -1);

      // Special handling for Appeal
      const isAppeal = state.currentMotion?.type === 'appeal';

      // For Appeal: majority sustains chair, less than majority overturns
      // For other motions: majority passes
      const voteResultText = isAppeal
        ? (passed ? "Chair's decision SUSTAINED" : "Chair's decision OVERTURNED")
        : (passed ? "CARRIED" : "FAILED");

      // Track defeated motions for renewal rule enforcement
      const defeatedMotions = !passed && state.currentMotion && !isAppeal
        ? [...state.defeatedMotions, {
            type: state.currentMotion.type,
            text: state.currentMotion.text,
            timestamp: action.timestamp
          }]
        : state.defeatedMotions;

      // Apply motion outcome if passed (Appeals don't have outcomes to apply)
      const outcome = passed && !isAppeal ? applyMotionOutcome(state, action.timestamp) : {
        tabledMotions: state.tabledMotions,
        agendaAdopted: state.agendaAdopted,
        agendaObjection: state.agendaObjection,
        agenda: state.agenda,
        newSuspension: null,
        restoredMotion: null,
        objectionKilledMotion: null,
        reconsideredMotionId: null,
        dividedParts: null,
        dividedMainMotion: null
      };

      // Handle reconsider - reconstruct motion from completed motions
      let reconsideredMotion: typeof state.tabledMotions[0] | null = null;
      let updatedCompletedMotions = state.completedMotions;
      if (outcome.reconsideredMotionId) {
        const completedMotion = state.completedMotions.find(cm => cm.id === outcome.reconsideredMotionId);
        if (completedMotion) {
          reconsideredMotion = {
            id: generateId(),
            type: completedMotion.type,
            name: completedMotion.name,
            text: completedMotion.text,
            mover: state.currentMotion?.mover || 'Unknown',
            moverId: state.currentMotion?.moverId || 0,
            secondedBy: null,
            status: 'active' as const,
            precedence: MOTIONS[completedMotion.type]?.precedence || 1,
            category: MOTIONS[completedMotion.type]?.category || 'main',
            interrupt: MOTIONS[completedMotion.type]?.interrupt || false,
            needsSecond: MOTIONS[completedMotion.type]?.needsSecond || true,
            debatable: MOTIONS[completedMotion.type]?.debatable || true,
            amendable: MOTIONS[completedMotion.type]?.amendable || true,
            reconsidered: MOTIONS[completedMotion.type]?.reconsidered || false,
            vote: MOTIONS[completedMotion.type]?.vote || 'majority',
            phrase: MOTIONS[completedMotion.type]?.phrase || '',
            help: MOTIONS[completedMotion.type]?.help || '',
            whenToUse: MOTIONS[completedMotion.type]?.whenToUse || '',
            moverHasSpoken: false
          };
          updatedCompletedMotions = state.completedMotions.map(cm =>
            cm.id === outcome.reconsideredMotionId ? { ...cm, reconsidered: true } : cm
          );
        }
      }

      const reconsideredLog = reconsideredMotion
        ? `\n[RECONSIDERED] Motion brought back for new vote: "${reconsideredMotion.text}"`
        : '';

      // Handle divide the question - special processing
      let dividedQuestionParts = state.dividedQuestionParts;
      let divideLog = '';
      let workingStack = newStack;
      if (outcome.dividedParts && outcome.dividedMainMotion) {
        // Remove the original main motion from the stack
        workingStack = workingStack.filter(m => m.id !== outcome.dividedMainMotion!.id);

        // Create the first part as a new main motion
        const firstPart = outcome.dividedParts[0];
        const firstPartMotion = {
          ...outcome.dividedMainMotion,
          id: firstPart.id,
          text: firstPart.text,
          status: 'active' as const,
          moverHasSpoken: false
        };
        workingStack = [...workingStack, firstPartMotion];

        // Store remaining parts for sequential processing
        dividedQuestionParts = outcome.dividedParts.slice(1);

        divideLog = `\n[DIVIDED] Original motion split into ${outcome.dividedParts.length} parts. Now considering: "${firstPart.text}"`;
      }

      // Process common outcome fields using helper
      const processed = processOutcomeResult(outcome, state.suspendedRules, workingStack, reconsideredMotion);

      // Save completed motion for potential reconsideration
      const completedMotions = state.currentMotion && state.currentMotion.reconsidered
        ? [...updatedCompletedMotions, {
            id: state.currentMotion.id,
            type: state.currentMotion.type,
            name: state.currentMotion.name,
            text: state.currentMotion.text,
            passed,
            voterChoices: state.voterChoices,
            timestamp: action.timestamp,
            reconsidered: false
          }]
        : updatedCompletedMotions;

      return {
        ...state,
        votingOpen: false,
        voteTimerEnd: null,
        currentMotion: processed.finalCurrentMotion,
        motionStack: processed.finalStack,
        defeatedMotions,
        completedMotions,
        suspendedRules: processed.suspendedRules,
        tabledMotions: outcome.tabledMotions,
        agendaAdopted: outcome.agendaAdopted,
        agendaObjection: outcome.agendaObjection,
        agenda: outcome.agenda,
        lastChairRuling: isAppeal ? null : state.lastChairRuling,
        debatePositions: {}, // Reset debate positions when motion resolves
        dividedQuestionParts,
        meetingLog: log(
          action.timestamp,
          `Vote: Yea ${yea}, Nay ${nay}. ${voteResultText}.${processed.suspensionLog}${processed.restoredLog}${processed.objectionLog}${reconsideredLog}${divideLog}`
        )
      };
    }

    case 'RAISE_HAND': {
      if (state.speakerQueue.find(s => s.member.id === action.member.id)) return state;

      // Check for side-switching (member already spoke with different stance)
      // Only enforce for pro/con, neutral is always allowed
      if (action.stance !== 'neutral') {
        const previousStance = state.debatePositions[action.member.id];
        if (previousStance && previousStance !== action.stance) {
          // Member is trying to switch sides - check if debate rules are suspended
          const debateRulesSuspended = isRuleSuspended(state, 'debate-rules');
          if (!debateRulesSuspended) {
            return state; // Reject - can't switch sides
          }
        }
      }

      return { ...state, speakerQueue: [...state.speakerQueue, { member: action.member, stance: action.stance }] };
    }

    case 'LOWER_HAND':
      return { ...state, speakerQueue: state.speakerQueue.filter(s => s.member.id !== action.member.id) };

    case 'RECOGNIZE_SPEAKER': {
      // Enforce motion-maker-priority rule: mover speaks first unless rule is suspended
      if (state.currentMotion && state.currentMotion.debatable && !state.currentMotion.moverHasSpoken) {
        const isMover = state.currentMotion.moverId === action.member.id;
        const prioritySuspended = isRuleSuspended(state, 'motion-maker-priority');

        // If not the mover and rule is active, reject the recognition
        if (!isMover && !prioritySuspended) {
          return state;
        }
      }

      // Mark motion maker as having spoken if they're being recognized
      const updatedMotion = state.currentMotion && state.currentMotion.moverId === action.member.id
        ? { ...state.currentMotion, moverHasSpoken: true }
        : state.currentMotion;

      // Update motion stack if current motion was updated
      const updatedStack = updatedMotion && updatedMotion !== state.currentMotion
        ? state.motionStack.map(m => m.id === updatedMotion.id ? updatedMotion : m)
        : state.motionStack;

      // Lock member's debate position (pro/con/neutral) when they speak
      const updatedDebatePositions = action.stance !== 'neutral'
        ? { ...state.debatePositions, [action.member.id]: action.stance }
        : state.debatePositions;

      return {
        ...state,
        currentMotion: updatedMotion,
        motionStack: updatedStack,
        recognizedSpeaker: action.member,
        lastSpeakerStance: action.stance,
        debatePositions: updatedDebatePositions,
        speakerTimerEnd: action.speakerTimerEnd,
        speakerQueue: state.speakerQueue.filter(s => s.member.id !== action.member.id),
        meetingLog: log(action.timestamp, logSpeakerRecognized(action.member.name))
      };
    }

    case 'YIELD_FLOOR':
      return {
        ...state,
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        meetingLog: log(action.timestamp, logSpeakerYields(state.recognizedSpeaker?.name))
      };

    case 'ADD_AGENDA_ITEM':
      return {
        ...state,
        agenda: [...state.agenda, { id: action.itemId, title: action.title, status: "pending" as const }]
      };

    case 'REMOVE_AGENDA_ITEM':
      return { ...state, agenda: state.agenda.filter(a => a.id !== action.id) };

    case 'ADOPT_AGENDA':
      return {
        ...state,
        agendaAdopted: true,
        agendaObjection: false,
        meetingLog: log(action.timestamp, LOG_AGENDA_ADOPTED)
      };

    case 'AGENDA_OBJECTION':
      return {
        ...state,
        agendaObjection: true,
        meetingLog: log(action.timestamp, LOG_AGENDA_OBJECTION)
      };

    case 'CALL_AGENDA_ITEM': {
      const item = state.agenda.find(a => a.id === action.id);
      const updatedAgenda = state.agenda.map(a =>
        a.id === action.id
          ? { ...a, status: "active" as const }
          : a.status === "active"
          ? { ...a, status: "pending" as const }
          : a
      );
      return {
        ...state,
        currentAgendaItem: item || null,
        agenda: updatedAgenda,
        meetingLog: log(action.timestamp, logAgendaItemCalled(item?.title))
      };
    }

    case 'COMPLETE_AGENDA_ITEM': {
      const updatedAgenda = state.agenda.map(a =>
        a.id === action.id ? { ...a, status: "completed" as const } : a
      );
      return {
        ...state,
        currentAgendaItem: null,
        agenda: updatedAgenda,
        meetingLog: log(action.timestamp, logAgendaItemCompleted(state.currentAgendaItem?.title))
      };
    }

    case 'REORDER_AGENDA': {
      const { fromIndex, toIndex } = action;
      const newAgenda = [...state.agenda];
      const [moved] = newAgenda.splice(fromIndex, 1);
      newAgenda.splice(toIndex, 0, moved);
      return { ...state, agenda: newAgenda };
    }

    case 'SET_SPEAKER_TIME_LIMIT':
      return { ...state, speakerTimeLimit: action.seconds };

    case 'SET_VOTE_TIME_LIMIT':
      return { ...state, voteTimeLimit: action.seconds };

    case 'REQUEST_UNANIMOUS_CONSENT':
      return {
        ...state,
        unanimousConsentPending: true,
        meetingLog: log(action.timestamp, 'Chair: "Is there any objection?"')
      };

    case 'OBJECT_TO_CONSENT':
      return {
        ...state,
        unanimousConsentPending: false,
        meetingLog: log(action.timestamp, `${action.objector} objects. Motion requires a vote.`)
      };

    case 'UNANIMOUS_CONSENT_PASSED': {
      const newStack = state.motionStack.slice(0, -1);
      const outcome = applyMotionOutcome(state, action.timestamp);

      // Handle divide the question - special processing
      let dividedQuestionParts = state.dividedQuestionParts;
      let divideLog = '';
      let workingStack = newStack;
      if (outcome.dividedParts && outcome.dividedMainMotion) {
        // Remove the original main motion from the stack
        workingStack = workingStack.filter(m => m.id !== outcome.dividedMainMotion!.id);

        // Create the first part as a new main motion
        const firstPart = outcome.dividedParts[0];
        const firstPartMotion = {
          ...outcome.dividedMainMotion,
          id: firstPart.id,
          text: firstPart.text,
          status: 'active' as const,
          moverHasSpoken: false
        };
        workingStack = [...workingStack, firstPartMotion];

        // Store remaining parts for sequential processing
        dividedQuestionParts = outcome.dividedParts.slice(1);

        divideLog = `\n[DIVIDED] Original motion split into ${outcome.dividedParts.length} parts. Now considering: "${firstPart.text}"`;
      }

      const processed = processOutcomeResult(outcome, state.suspendedRules, workingStack);

      return {
        ...state,
        unanimousConsentPending: false,
        currentMotion: processed.finalCurrentMotion,
        motionStack: processed.finalStack,
        suspendedRules: processed.suspendedRules,
        tabledMotions: outcome.tabledMotions,
        agendaAdopted: outcome.agendaAdopted,
        agendaObjection: outcome.agendaObjection,
        agenda: outcome.agenda,
        debatePositions: {}, // Reset debate positions when motion resolves
        dividedQuestionParts,
        meetingLog: log(
          action.timestamp,
          `Motion CARRIED by unanimous consent.${processed.suspensionLog}${processed.restoredLog}${processed.objectionLog}${divideLog}`
        )
      };
    }

    case 'SET_VOTING_METHOD':
      return { ...state, votingMethod: action.method };

    case 'ADVANCE_MEETING_STAGE': {
      const nextStage = getNextStage(state.meetingStage);
      const logMessage = getStageLogMessage(nextStage);

      return {
        ...state,
        meetingStage: nextStage,
        meetingLog: logMessage ? log(action.timestamp, logMessage) : state.meetingLog
      };
    }

    case 'APPROVE_MINUTES':
      return {
        ...state,
        minutesApproved: true,
        meetingLog: log(action.timestamp, "Minutes from previous meeting approved.")
      };

    case 'SET_PREVIOUS_MINUTES':
      return {
        ...state,
        minutesFromPreviousMeeting: action.minutes
      };

    case 'ADD_COMMITTEE_REPORT':
      return {
        ...state,
        committeeReports: [...state.committeeReports, action.report]
      };

    case 'PRESENT_COMMITTEE_REPORT': {
      const report = state.committeeReports.find(r => r.id === action.reportId);
      if (!report) return state;

      return {
        ...state,
        committeeReports: state.committeeReports.map(r =>
          r.id === action.reportId ? { ...r, presented: true } : r
        ),
        meetingLog: log(action.timestamp, `${report.committee} report presented by ${report.presenter}.${report.recommendations ? ' Recommendations made.' : ''}`)
      };
    }

    case 'SUSPEND_RULE_APPROVED':
      // Add suspension to active suspensions list
      // Phase 1: No-op implementation - foundation only
      return {
        ...state,
        suspendedRules: [...state.suspendedRules, action.suspension],
        meetingLog: log(action.timestamp, `[RULE SUSPENDED] ${action.suspension.rule}: ${action.suspension.purpose}`)
      };

    case 'RESTORE_RULE': {
      // Remove the suspension by ID
      const suspension = state.suspendedRules.find(s => s.id === action.suspensionId);
      const updatedRules = state.suspendedRules.filter(s => s.id !== action.suspensionId);

      return {
        ...state,
        suspendedRules: updatedRules,
        meetingLog: suspension
          ? log(action.timestamp, `[RULE RESTORED] ${suspension.rule} restored to normal enforcement`)
          : state.meetingLog
      };
    }

    case 'CHAIR_RULING': {
      // Handle chair's ruling on motions that don't require a vote
      // (Point of Order, Question of Privilege, Point of Information, etc.)
      if (!state.currentMotion) return state;

      const motionText = state.currentMotion.text;
      const rulingText = action.ruling === 'sustain'
        ? `The point is well taken.`
        : action.ruling === 'overrule'
        ? `The point is not well taken.`
        : action.ruling === 'allow'
        ? `The request is granted.`
        : `The request is denied.`;

      const logMessage = `Chair ruled: ${rulingText}${action.explanation ? ` - ${action.explanation}` : ''} (Re: ${motionText})`;

      // Store this ruling so it can be appealed
      const lastChairRuling = {
        ruling: rulingText,
        motionText,
        timestamp: action.timestamp
      };

      return {
        ...state,
        currentMotion: null,
        motionStack: state.motionStack.slice(0, -1),
        lastChairRuling,
        meetingLog: log(action.timestamp, logMessage)
      };
    }

    case 'OPEN_NOMINATIONS':
      return {
        ...state,
        nominationsOpen: true,
        currentNominationPosition: action.position,
        meetingLog: log(action.timestamp, `Chair: Nominations are now open for ${action.position}.`)
      };

    case 'NOMINATE': {
      const nomination = {
        id: action.nominationId,
        position: action.position,
        nomineeName: action.nomineeName,
        nomineeId: action.nomineeId,
        nominatedBy: action.nominatedBy,
        nominatorId: action.nominatorId,
        timestamp: action.timestamp,
        declined: false
      };
      return {
        ...state,
        nominations: [...state.nominations, nomination],
        meetingLog: log(action.timestamp, `${action.nominatedBy} nominates ${action.nomineeName} for ${action.position}.`)
      };
    }

    case 'DECLINE_NOMINATION': {
      const nomination = state.nominations.find(n => n.id === action.nominationId);
      if (!nomination) return state;

      return {
        ...state,
        nominations: state.nominations.map(n =>
          n.id === action.nominationId ? { ...n, declined: true } : n
        ),
        meetingLog: log(action.timestamp, `${nomination.nomineeName} declines nomination for ${nomination.position}.`)
      };
    }

    case 'CLOSE_NOMINATIONS':
      return {
        ...state,
        nominationsOpen: false,
        meetingLog: log(action.timestamp, `Chair: Nominations for ${state.currentNominationPosition} are now closed.`)
      };

    case 'START_ELECTION': {
      // Gather candidates from nominations for this position (excluding declined)
      const candidates = state.nominations
        .filter(n => n.position === action.position && !n.declined)
        .map(n => ({ name: n.nomineeName, id: n.nomineeId }))
        // Remove duplicates (same person nominated multiple times)
        .filter((candidate, index, self) =>
          index === self.findIndex(c => c.name === candidate.name)
        );

      const election = {
        id: action.electionId,
        position: action.position,
        candidates,
        requiredVotes: action.requiredVotes,
        votingInProgress: true,
        ballotResults: candidates.reduce((acc, c) => ({ ...acc, [c.name]: 0 }), {} as Record<string, number>),
        votersWhoVoted: [],
        elected: null
      };

      return {
        ...state,
        currentElection: election,
        currentNominationPosition: null,
        meetingLog: log(action.timestamp, `Chair: Voting is now open for ${action.position}. ${candidates.length} candidate(s).`)
      };
    }

    case 'CAST_BALLOT': {
      if (!state.currentElection || !state.currentElection.votingInProgress) return state;

      // Check if voter has already voted
      if (state.currentElection.votersWhoVoted.includes(action.voterId)) return state;

      return {
        ...state,
        currentElection: {
          ...state.currentElection,
          ballotResults: {
            ...state.currentElection.ballotResults,
            [action.candidateName]: (state.currentElection.ballotResults[action.candidateName] || 0) + 1
          },
          votersWhoVoted: [...state.currentElection.votersWhoVoted, action.voterId]
        }
      };
    }

    case 'CLOSE_ELECTION': {
      if (!state.currentElection) return state;

      const results = state.currentElection.ballotResults;
      const totalVotes = state.currentElection.votersWhoVoted.length;
      const requiredVotes = state.currentElection.requiredVotes;

      // Calculate winner based on vote requirement
      let winner: string | null = null;
      const sortedCandidates = Object.entries(results).sort((a, b) => b[1] - a[1]);

      if (sortedCandidates.length > 0) {
        const topCandidate = sortedCandidates[0];
        const topVotes = topCandidate[1];

        if (requiredVotes === 'majority') {
          if (topVotes > totalVotes / 2) {
            winner = topCandidate[0];
          }
        } else if (requiredVotes === '2/3') {
          if (topVotes >= (totalVotes * 2 / 3)) {
            winner = topCandidate[0];
          }
        } else { // plurality
          winner = topCandidate[0];
        }
      }

      // Determine if each result is a write-in (not in official candidates)
      const officialCandidateNames = new Set(state.currentElection.candidates.map(c => c.name));
      const resultsText = sortedCandidates
        .map(([name, votes]) => {
          const isWriteIn = !officialCandidateNames.has(name);
          return `${name}${isWriteIn ? ' (write-in)' : ''}: ${votes} vote(s)`;
        })
        .join(', ');

      // Check for tie at the top
      const topVotes = sortedCandidates[0]?.[1] ?? 0;
      const tiedCandidates = sortedCandidates.filter(([, votes]) => votes === topVotes);

      // Trigger runoff if there's a tie at top AND (plurality with tie OR no winner found)
      const hasTie = tiedCandidates.length > 1;
      const needsRunoff = hasTie && (requiredVotes === 'plurality' || !winner);

      if (needsRunoff) {
        // Get candidate info for tied candidates (look up IDs for known members)
        const tiedCandidateInfo = tiedCandidates.map(([name]) => {
          const officialCandidate = state.currentElection!.candidates.find(c => c.name === name);
          const member = state.members.find(m => m.name === name);
          return { name, id: officialCandidate?.id ?? member?.id ?? 0 };
        });

        const runoffRound = (state.currentElection.runoffRound ?? 0) + 1;
        const tiedNames = tiedCandidates.map(([name]) => name).join(', ');

        return {
          ...state,
          currentElection: {
            ...state.currentElection,
            candidates: tiedCandidateInfo,
            ballotResults: {},
            votersWhoVoted: [],
            votingInProgress: true, // Keep voting open for runoff
            elected: null,
            isRunoff: true,
            runoffRound
          },
          meetingLog: log(action.timestamp, `Voting closed for ${state.currentElection.position}. Results: ${resultsText}. TIE between: ${tiedNames}. Runoff vote (round ${runoffRound}) now open.`)
        };
      }

      return {
        ...state,
        currentElection: {
          ...state.currentElection,
          votingInProgress: false,
          elected: winner
        },
        meetingLog: log(action.timestamp, `Voting closed for ${state.currentElection.position}. Results: ${resultsText}. ${winner ? `${winner} elected.` : 'No candidate elected (majority not reached).'}`)
      };
    }

    case 'DECLARE_ELECTED': {
      if (!state.currentElection) return state;

      // Check if candidate is an official nominee
      const nominatedCandidate = state.currentElection.candidates.find(c => c.name === action.candidateName);

      // Check if candidate received any votes (either nominated or write-in)
      const hasVotes = action.candidateName in state.currentElection.ballotResults;

      // Allow declaring if they're a nominated candidate OR received write-in votes
      if (!nominatedCandidate && !hasVotes) return state;

      // For write-ins, try to find their memberId from the members list
      const memberId = nominatedCandidate?.id ??
        state.members.find(m => m.name === action.candidateName)?.id ??
        0; // 0 indicates write-in not found in members

      const isWriteIn = !nominatedCandidate;
      const officer: Officer = {
        position: state.currentElection.position,
        name: action.candidateName,
        memberId,
        electedAt: action.timestamp
      };

      const writeInNote = isWriteIn ? ' (write-in candidate)' : '';
      return {
        ...state,
        electedOfficers: [...state.electedOfficers, officer],
        currentElection: null,
        meetingLog: log(action.timestamp, `Chair declares ${action.candidateName}${writeInNote} elected as ${officer.position}.`)
      };
    }

    case 'ASK_INQUIRY': {
      const newInquiry: Inquiry = {
        id: action.inquiryId,
        type: action.inquiryType,
        question: action.question,
        askedBy: action.askedBy,
        askerId: action.askerId,
        timestamp: action.timestamp
      };

      const inquiryTypeLabel = action.inquiryType === 'parliamentary'
        ? 'Parliamentary Inquiry'
        : 'Request for Information';

      return {
        ...state,
        inquiries: [...state.inquiries, newInquiry],
        meetingLog: log(action.timestamp, `${action.askedBy} raises ${inquiryTypeLabel}: "${action.question}"`)
      };
    }

    case 'ANSWER_INQUIRY': {
      const updatedInquiries = state.inquiries.map(inq =>
        inq.id === action.inquiryId
          ? {
              ...inq,
              answer: action.answer,
              answeredBy: action.answeredBy,
              answeredAt: action.timestamp
            }
          : inq
      );

      const inquiry = state.inquiries.find(inq => inq.id === action.inquiryId);
      const inquiryTypeLabel = inquiry?.type === 'parliamentary'
        ? 'Parliamentary Inquiry'
        : 'Request for Information';

      return {
        ...state,
        inquiries: updatedInquiries,
        meetingLog: log(action.timestamp, `Chair answers ${inquiryTypeLabel}: "${action.answer}"`)
      };
    }

    case 'SET_MEMBER_ROLE': {
      const targetMember = state.members.find(m => m.id === action.targetMemberId);
      if (!targetMember) return state;

      const oldRole = targetMember.role;

      // Update the target member's role and demote previous chair if needed
      const updatedMembers = state.members.map(member => {
        if (member.id === action.targetMemberId) {
          return { ...member, role: action.newRole };
        }
        // If assigning a new chair, demote the previous chair to member
        if (action.newRole === 'chair' && action.previousChairId && member.id === action.previousChairId) {
          return { ...member, role: 'member' as const };
        }
        return member;
      });

      // Build audit log message including who made the change
      const previousChair = action.previousChairId
        ? state.members.find(m => m.id === action.previousChairId)
        : null;

      // changedBy is optional (added by server enrichment), fallback to 'System' if not present
      const changedBy = action.changedBy || 'System';

      let logMessage: string;
      if (action.newRole === 'chair' && previousChair) {
        logMessage = `[ROLE CHANGE] ${changedBy} transferred chair to ${targetMember.name}. ${previousChair.name} is now a member.`;
      } else {
        logMessage = `[ROLE CHANGE] ${changedBy} changed ${targetMember.name}'s role from ${oldRole} to ${action.newRole}.`;
      }

      return {
        ...state,
        members: updatedMembers,
        meetingLog: log(action.timestamp, logMessage)
      };
    }

    case 'ADD_MEMBER': {
      // Don't add if member already exists
      if (state.members.some(m => m.id === action.member.id)) {
        return state;
      }
      return {
        ...state,
        members: [...state.members, action.member],
        meetingLog: log(action.timestamp, logMemberJoined(action.member.name))
      };
    }

    case 'SET_MEMBER_PRESENCE': {
      const member = state.members.find(m => m.id === action.memberId);
      if (!member) return state;

      // No change needed if presence is already correct
      if (member.present === action.present) return state;

      const updatedMembers = state.members.map(m =>
        m.id === action.memberId ? { ...m, present: action.present } : m
      );

      return {
        ...state,
        members: updatedMembers,
        meetingLog: log(action.timestamp, logMemberPresenceChanged(member.name, action.present))
      };
    }

    case 'START_ROLL_CALL': {
      // Initialize roll call with all members as not-responded
      const responses: RollCallRecord[] = state.members.map(member => ({
        memberId: member.id,
        memberName: member.name,
        status: 'not-responded' as const
      }));

      return {
        ...state,
        rollCall: {
          inProgress: true,
          startedAt: action.timestamp,
          responses
        },
        meetingLog: log(action.timestamp, LOG_ROLL_CALL_STARTED)
      };
    }

    case 'RESPOND_ROLL_CALL': {
      if (!state.rollCall || !state.rollCall.inProgress) return state;

      const member = state.members.find(m => m.id === action.memberId);
      if (!member) return state;

      // Update the response for this member
      const updatedResponses = state.rollCall.responses.map(r =>
        r.memberId === action.memberId
          ? { ...r, status: action.status, respondedAt: action.timestamp }
          : r
      );

      // Also update member presence based on response
      const isPresent = action.status === 'present';
      const updatedMembers = state.members.map(m =>
        m.id === action.memberId ? { ...m, present: isPresent } : m
      );

      return {
        ...state,
        rollCall: {
          ...state.rollCall,
          responses: updatedResponses
        },
        members: updatedMembers,
        meetingLog: log(action.timestamp, logRollCallResponse(member.name, action.status))
      };
    }

    case 'COMPLETE_ROLL_CALL': {
      if (!state.rollCall || !state.rollCall.inProgress) return state;

      // Count attendance
      const present = state.rollCall.responses.filter(r => r.status === 'present').length;
      const absent = state.rollCall.responses.filter(r => r.status === 'absent').length;
      const excused = state.rollCall.responses.filter(r => r.status === 'excused').length;

      return {
        ...state,
        rollCall: {
          ...state.rollCall,
          inProgress: false,
          completedAt: action.timestamp
        },
        meetingLog: log(action.timestamp, logRollCallComplete(present, absent, excused))
      };
    }

    case 'MARK_ABSENT': {
      const member = state.members.find(m => m.id === action.memberId);
      if (!member) return state;

      // Update member presence
      const updatedMembers = state.members.map(m =>
        m.id === action.memberId ? { ...m, present: false } : m
      );

      // If roll call is in progress, also update the roll call response
      let updatedRollCall = state.rollCall;
      if (state.rollCall) {
        const newStatus = action.excused ? 'excused' : 'absent';
        updatedRollCall = {
          ...state.rollCall,
          responses: state.rollCall.responses.map(r =>
            r.memberId === action.memberId
              ? { ...r, status: newStatus as 'absent' | 'excused', respondedAt: action.timestamp }
              : r
          )
        };
      }

      return {
        ...state,
        members: updatedMembers,
        rollCall: updatedRollCall,
        meetingLog: log(action.timestamp, logMemberMarkedAbsent(member.name, action.excused))
      };
    }

    case 'SET_AUTO_YIELD': {
      return {
        ...state,
        autoYieldOnTimeExpired: action.enabled
      };
    }

    default:
      return state;
  }
}
