import { MOTIONS } from '../constants/motions.js';
import { getNextStage, getStageLogMessage } from '../constants/meetingStages.js';
import { applyMotionOutcome } from '../utils/motionOutcomeHelper.js';
import { isRuleSuspended, markSingleActionComplete } from '../utils/ruleSuspensionHelper.js';
import { generateId } from '../utils/idGenerators.js';
import { calculateVoteResult } from '../utils/voteCalculator.js';
import type { MeetingState, MeetingAction, MeetingLogEntry, Inquiry } from '../types/index.js';

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
        meetingLog: log(action.timestamp, "Meeting called to order.")
      };

    case 'END_MEETING':
      // All rule suspensions end when meeting adjourns per Robert's Rules
      return {
        ...state,
        meetingActive: false,
        meetingStage: 'adjourned',
        suspendedRules: [],
        meetingLog: log(action.timestamp, "Meeting adjourned.")
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
        reconsideredMotionId: action.reconsideredMotionId
      };
      // Check if second requirement is suspended
      const secondSuspended = isRuleSuspended(state, 'second-requirement');

      if (motion.needsSecond && !secondSuspended) {
        return {
          ...state,
          pendingSecond: motion,
          // Clear lastChairRuling for non-Appeal motions
          lastChairRuling: action.motionType === 'appeal' ? state.lastChairRuling : null,
          meetingLog: log(action.timestamp, `${action.mover} moves: "${action.text}" (${motion.name}). Awaiting second.`)
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
        meetingLog: log(action.timestamp, `${action.seconder} seconds the motion.`)
      };

    case 'DECLINE_SECOND':
      return {
        ...state,
        pendingSecond: null,
        meetingLog: log(action.timestamp, "Motion fails for lack of a second.")
      };

    case 'OPEN_VOTING':
      return {
        ...state,
        votingOpen: true,
        voteTimerEnd: action.voteTimerEnd,
        votes: { yea: 0, nay: 0, abstain: 0 },
        voters: [],
        voterChoices: {},
        meetingLog: log(action.timestamp, `Chair puts the question: "${state.currentMotion?.text}"`)
      };

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

      return {
        ...state,
        votes: newVotes,
        voters: newVoters,
        voterChoices: newVoterChoices
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
        reconsideredMotionId: null
      };

      // Add suspension to state if created
      const suspendedRules = outcome.newSuspension
        ? [...state.suspendedRules, outcome.newSuspension]
        : state.suspendedRules;

      // Add suspension log entry if created
      const suspensionLog = outcome.newSuspension
        ? `[RULE SUSPENDED] ${outcome.newSuspension.rule}: ${outcome.newSuspension.purpose}`
        : '';

      // Handle objection to consideration killing main motion
      let workingStack = newStack;
      if (outcome.objectionKilledMotion) {
        workingStack = newStack.filter(m => m.id !== outcome.objectionKilledMotion!.id);
      }

      const objectionLog = outcome.objectionKilledMotion
        ? `\n[OBJECTION SUSTAINED] Main motion will not be considered: "${outcome.objectionKilledMotion.text}"`
        : '';

      // Handle reconsider
      let reconsideredMotion: typeof state.tabledMotions[0] | null = null;
      let updatedCompletedMotions = state.completedMotions;
      if (outcome.reconsideredMotionId) {
        const completedMotion = state.completedMotions.find(cm => cm.id === outcome.reconsideredMotionId);
        if (completedMotion) {
          // Reconstruct the motion from completed motion data
          reconsideredMotion = {
            id: generateId(), // New ID for the reconsidered motion
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
          // Mark as reconsidered
          updatedCompletedMotions = state.completedMotions.map(cm =>
            cm.id === outcome.reconsideredMotionId ? { ...cm, reconsidered: true } : cm
          );
        }
      }

      const reconsideredLog = reconsideredMotion
        ? `\n[RECONSIDERED] Motion brought back for new vote: "${reconsideredMotion.text}"`
        : '';

      // Handle restored/reconsidered motions
      const motionToRestore = reconsideredMotion || outcome.restoredMotion;
      const finalStack = motionToRestore
        ? [...workingStack, motionToRestore]
        : workingStack;

      const finalCurrentMotion = motionToRestore
        ? motionToRestore
        : (workingStack[workingStack.length - 1] || null);

      const restoredLog = outcome.restoredMotion && !reconsideredMotion
        ? `\n[RESTORED FROM TABLE] "${outcome.restoredMotion.text}"`
        : '';

      // Save completed motion for potential reconsideration
      // Only save if motion can be reconsidered (per RONR, most motions can be)
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
        currentMotion: finalCurrentMotion,
        motionStack: finalStack,
        defeatedMotions,
        completedMotions,
        suspendedRules,
        tabledMotions: outcome.tabledMotions,
        agendaAdopted: outcome.agendaAdopted,
        agendaObjection: outcome.agendaObjection,
        agenda: outcome.agenda,
        // Clear lastChairRuling after Appeal is resolved
        lastChairRuling: isAppeal ? null : state.lastChairRuling,
        meetingLog: log(
          action.timestamp,
          `Vote: Yea ${yea}, Nay ${nay}. ${voteResultText}.${suspensionLog}${restoredLog}${objectionLog}${reconsideredLog}`
        )
      };
    }

    case 'RAISE_HAND':
      if (state.speakerQueue.find(s => s.member.id === action.member.id)) return state;
      return { ...state, speakerQueue: [...state.speakerQueue, { member: action.member, stance: action.stance }] };

    case 'LOWER_HAND':
      return { ...state, speakerQueue: state.speakerQueue.filter(s => s.member.id !== action.member.id) };

    case 'RECOGNIZE_SPEAKER': {
      // Mark motion maker as having spoken if they're being recognized
      const updatedMotion = state.currentMotion && state.currentMotion.moverId === action.member.id
        ? { ...state.currentMotion, moverHasSpoken: true }
        : state.currentMotion;

      // Update motion stack if current motion was updated
      const updatedStack = updatedMotion && updatedMotion !== state.currentMotion
        ? state.motionStack.map(m => m.id === updatedMotion.id ? updatedMotion : m)
        : state.motionStack;

      return {
        ...state,
        currentMotion: updatedMotion,
        motionStack: updatedStack,
        recognizedSpeaker: action.member,
        lastSpeakerStance: action.stance,
        speakerTimerEnd: action.speakerTimerEnd,
        speakerQueue: state.speakerQueue.filter(s => s.member.id !== action.member.id),
        meetingLog: log(action.timestamp, `Chair recognizes ${action.member.name}.`)
      };
    }

    case 'YIELD_FLOOR':
      return {
        ...state,
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        meetingLog: log(action.timestamp, `${state.recognizedSpeaker?.name} yields the floor.`)
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
        meetingLog: log(action.timestamp, "Agenda adopted by unanimous consent.")
      };

    case 'AGENDA_OBJECTION':
      return {
        ...state,
        agendaObjection: true,
        meetingLog: log(action.timestamp, "Objection raised to agenda.")
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
        meetingLog: log(action.timestamp, `Chair calls: "${item?.title}"`)
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
        meetingLog: log(action.timestamp, `Completed: "${state.currentAgendaItem?.title}"`)
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

      // Add suspension to state if created
      const suspendedRules = outcome.newSuspension
        ? [...state.suspendedRules, outcome.newSuspension]
        : state.suspendedRules;

      // Add suspension log entry if created
      const suspensionLog = outcome.newSuspension
        ? `[RULE SUSPENDED] ${outcome.newSuspension.rule}: ${outcome.newSuspension.purpose}`
        : '';

      // Handle objection to consideration killing main motion
      let workingStack = newStack;
      if (outcome.objectionKilledMotion) {
        workingStack = newStack.filter(m => m.id !== outcome.objectionKilledMotion!.id);
      }

      // Handle restored motion from table
      const finalStack = outcome.restoredMotion
        ? [...workingStack, outcome.restoredMotion]
        : workingStack;

      const finalCurrentMotion = outcome.restoredMotion
        ? outcome.restoredMotion
        : (workingStack[workingStack.length - 1] || null);

      const restoredLog = outcome.restoredMotion
        ? `\n[RESTORED FROM TABLE] "${outcome.restoredMotion.text}"`
        : '';

      const objectionLog = outcome.objectionKilledMotion
        ? `\n[OBJECTION SUSTAINED] Main motion will not be considered: "${outcome.objectionKilledMotion.text}"`
        : '';

      return {
        ...state,
        unanimousConsentPending: false,
        currentMotion: finalCurrentMotion,
        motionStack: finalStack,
        suspendedRules,
        tabledMotions: outcome.tabledMotions,
        agendaAdopted: outcome.agendaAdopted,
        agendaObjection: outcome.agendaObjection,
        agenda: outcome.agenda,
        meetingLog: log(
          action.timestamp,
          `Motion CARRIED by unanimous consent.${suspensionLog}${restoredLog}${objectionLog}`
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

      const resultsText = sortedCandidates
        .map(([name, votes]) => `${name}: ${votes} vote(s)`)
        .join(', ');

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

      const officer = {
        position: state.currentElection.position,
        name: action.candidateName,
        memberId: state.currentElection.candidates.find(c => c.name === action.candidateName)?.id,
        electedAt: action.timestamp
      };

      return {
        ...state,
        electedOfficers: [...state.electedOfficers, officer],
        currentElection: null,
        meetingLog: log(action.timestamp, `Chair declares ${action.candidateName} elected as ${officer.position}.`)
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

      // Build appropriate log message
      const previousChair = action.previousChairId
        ? state.members.find(m => m.id === action.previousChairId)
        : null;

      let logMessage = `${targetMember.name} is now ${action.newRole}.`;
      if (action.newRole === 'chair' && previousChair) {
        logMessage = `${targetMember.name} is now chair. ${previousChair.name} is now a member.`;
      }

      return {
        ...state,
        members: updatedMembers,
        meetingLog: log(action.timestamp, logMessage)
      };
    }

    default:
      return state;
  }
}
