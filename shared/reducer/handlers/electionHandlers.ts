import type { MeetingAction, Officer } from '../../types/index.js';
import type { ActionHandler } from './types.js';

export const electionHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'OPEN_NOMINATIONS': {
      const typedAction = action as Extract<MeetingAction, { type: 'OPEN_NOMINATIONS' }>;
      return {
        ...state,
        nominationsOpen: true,
        currentNominationPosition: typedAction.position,
        meetingLog: log(
          typedAction.timestamp,
          `Chair: Nominations are now open for ${typedAction.position}.`,
        ),
      };
    }

    case 'NOMINATE': {
      const typedAction = action as Extract<MeetingAction, { type: 'NOMINATE' }>;
      const nomination = {
        id: typedAction.nominationId,
        position: typedAction.position,
        nomineeName: typedAction.nomineeName,
        nomineeId: typedAction.nomineeId,
        nominatedBy: typedAction.nominatedBy,
        nominatorId: typedAction.nominatorId,
        timestamp: typedAction.timestamp,
        declined: false,
      };
      return {
        ...state,
        nominations: [...state.nominations, nomination],
        meetingLog: log(
          typedAction.timestamp,
          `${typedAction.nominatedBy} nominates ${typedAction.nomineeName} for ${typedAction.position}.`,
        ),
      };
    }

    case 'DECLINE_NOMINATION': {
      const typedAction = action as Extract<MeetingAction, { type: 'DECLINE_NOMINATION' }>;
      const nomination = state.nominations.find((n) => n.id === typedAction.nominationId);
      if (!nomination) return state;

      return {
        ...state,
        nominations: state.nominations.map((n) =>
          n.id === typedAction.nominationId ? { ...n, declined: true } : n,
        ),
        meetingLog: log(
          typedAction.timestamp,
          `${nomination.nomineeName} declines nomination for ${nomination.position}.`,
        ),
      };
    }

    case 'CLOSE_NOMINATIONS': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_NOMINATIONS' }>;
      return {
        ...state,
        nominationsOpen: false,
        meetingLog: log(
          typedAction.timestamp,
          `Chair: Nominations for ${state.currentNominationPosition} are now closed.`,
        ),
      };
    }

    case 'START_ELECTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'START_ELECTION' }>;
      // Gather candidates from nominations for this position (excluding declined)
      const candidates = state.nominations
        .filter((n) => n.position === typedAction.position && !n.declined)
        .map((n) => ({ name: n.nomineeName, id: n.nomineeId }))
        // Remove duplicates
        .filter(
          (candidate, index, self) => index === self.findIndex((c) => c.name === candidate.name),
        );

      const election = {
        id: typedAction.electionId,
        position: typedAction.position,
        candidates,
        requiredVotes: typedAction.requiredVotes,
        votingInProgress: true,
        ballotResults: candidates.reduce(
          (acc, c) => ({ ...acc, [c.name]: 0 }),
          {} as Record<string, number>,
        ),
        votersWhoVoted: [],
        elected: null,
      };

      return {
        ...state,
        currentElection: election,
        currentNominationPosition: null,
        meetingLog: log(
          typedAction.timestamp,
          `Chair: Voting is now open for ${typedAction.position}. ${candidates.length} candidate(s).`,
        ),
      };
    }

    case 'CAST_BALLOT': {
      const typedAction = action as Extract<MeetingAction, { type: 'CAST_BALLOT' }>;
      if (!state.currentElection || !state.currentElection.votingInProgress) return state;

      // Check if voter has already voted
      if (state.currentElection.votersWhoVoted.includes(typedAction.voterId)) return state;

      return {
        ...state,
        currentElection: {
          ...state.currentElection,
          ballotResults: {
            ...state.currentElection.ballotResults,
            [typedAction.candidateName]:
              (state.currentElection.ballotResults[typedAction.candidateName] || 0) + 1,
          },
          votersWhoVoted: [...state.currentElection.votersWhoVoted, typedAction.voterId],
        },
      };
    }

    case 'CLOSE_ELECTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_ELECTION' }>;
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
          if (topVotes >= (totalVotes * 2) / 3) {
            winner = topCandidate[0];
          }
        } else {
          // plurality
          winner = topCandidate[0];
        }
      }

      // Determine if each result is a write-in
      const officialCandidateNames = new Set(state.currentElection.candidates.map((c) => c.name));
      const resultsText = sortedCandidates
        .map(([name, votes]) => {
          const isWriteIn = !officialCandidateNames.has(name);
          return `${name}${isWriteIn ? ' (write-in)' : ''}: ${votes} vote(s)`;
        })
        .join(', ');

      // Check for tie at the top
      const topVotes = sortedCandidates[0]?.[1] ?? 0;
      const tiedCandidates = sortedCandidates.filter(([, votes]) => votes === topVotes);
      const hasTie = tiedCandidates.length > 1;
      const needsRunoff = hasTie && (requiredVotes === 'plurality' || !winner);

      if (needsRunoff) {
        const tiedCandidateInfo = tiedCandidates.map(([name]) => {
          const officialCandidate = state.currentElection!.candidates.find((c) => c.name === name);
          const member = state.members.find((m) => m.name === name);
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
            votingInProgress: true,
            elected: null,
            isRunoff: true,
            runoffRound,
          },
          meetingLog: log(
            typedAction.timestamp,
            `Voting closed for ${state.currentElection.position}. Results: ${resultsText}. TIE between: ${tiedNames}. Runoff vote (round ${runoffRound}) now open.`,
          ),
        };
      }

      return {
        ...state,
        currentElection: {
          ...state.currentElection,
          votingInProgress: false,
          elected: winner,
        },
        meetingLog: log(
          typedAction.timestamp,
          `Voting closed for ${state.currentElection.position}. Results: ${resultsText}. ${winner ? `${winner} elected.` : 'No candidate elected (majority not reached).'}`,
        ),
      };
    }

    case 'DECLARE_ELECTED': {
      const typedAction = action as Extract<MeetingAction, { type: 'DECLARE_ELECTED' }>;
      if (!state.currentElection) return state;

      // Check if candidate is an official nominee
      const nominatedCandidate = state.currentElection.candidates.find(
        (c) => c.name === typedAction.candidateName,
      );

      // Check if candidate received any votes
      const hasVotes = typedAction.candidateName in state.currentElection.ballotResults;

      // Allow declaring if they're a nominated candidate OR received write-in votes
      if (!nominatedCandidate && !hasVotes) return state;

      const memberId =
        nominatedCandidate?.id ??
        state.members.find((m) => m.name === typedAction.candidateName)?.id ??
        0;

      const isWriteIn = !nominatedCandidate;
      const officer: Officer = {
        position: state.currentElection.position,
        name: typedAction.candidateName,
        memberId,
        electedAt: typedAction.timestamp,
      };

      const writeInNote = isWriteIn ? ' (write-in candidate)' : '';
      return {
        ...state,
        electedOfficers: [...state.electedOfficers, officer],
        currentElection: null,
        meetingLog: log(
          typedAction.timestamp,
          `Chair declares ${typedAction.candidateName}${writeInNote} elected as ${officer.position}.`,
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
