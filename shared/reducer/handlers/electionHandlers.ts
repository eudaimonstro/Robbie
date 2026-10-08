import type {
  Election,
  ElectionSetAsideRecord,
  MeetingAction,
  Nomination,
  Officer,
} from '../../types/index.js';
import { FROM_THE_FLOOR } from '../../constants/floor.js';
import {
  logElectionSetAside,
  logFloorNomination,
  logNomination,
} from '../../constants/logMessages.js';
import {
  acclamationCandidates,
  ballotsNotMinuted,
  countBallot,
  electedTo,
  electionHistory,
  joinNames,
  remainingNominees,
  seatsOpen,
  winnersOf,
} from '../../utils/elections.js';
import { decisionContext } from './records.js';
import type { ActionHandler } from './types.js';

/** A count of nothing for each candidate */
function zeros(candidates: Election['candidates']): Record<string, number> {
  return Object.fromEntries(candidates.map((c) => [c.name, 0]));
}

export const electionHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'OPEN_NOMINATIONS': {
      const typedAction = action as Extract<MeetingAction, { type: 'OPEN_NOMINATIONS' }>;
      // Reopened for the position in hand, its seats stand, and with seats still open after a
      // ballot it is the same election; otherwise the seats given (one)
      const between = state.currentElection;
      const reopened =
        (between?.position ?? state.currentNominationPosition) === typedAction.position;
      const seats = between
        ? (between.seats ?? 1)
        : reopened
          ? (state.openSeats ?? 1)
          : (typedAction.seats ?? 1);
      return {
        ...state,
        nominationsOpen: true,
        currentNominationPosition: typedAction.position,
        openSeats: seats,
        currentElection: null,
        continuingElection: between
          ? {
              id: between.id,
              ...(between.ballots ? { ballots: between.ballots } : {}),
              ...(between.ballotTotals ? { ballotTotals: between.ballotTotals } : {}),
            }
          : reopened
            ? (state.continuingElection ?? null)
            : null,
        meetingLog: log(
          typedAction.timestamp,
          `Chair: Nominations are now open for ${typedAction.position}${seats > 1 ? ` (${seats} seats)` : ''}.`,
        ),
      };
    }

    case 'NOMINATE': {
      const typedAction = action as Extract<MeetingAction, { type: 'NOMINATE' }>;
      // A nomination from the floor is recorded as that, not as the chair's who entered it
      const fromFloor = !!typedAction.fromFloor;
      const nomination: Nomination = {
        id: typedAction.nominationId,
        position: typedAction.position,
        nomineeName: typedAction.nomineeName,
        nomineeId: typedAction.nomineeId,
        nominatedBy: fromFloor ? FROM_THE_FLOOR : typedAction.nominatedBy,
        nominatorId: typedAction.nominatorId,
        timestamp: typedAction.timestamp,
        declined: false,
        ...(fromFloor && { fromFloor }),
      };
      return {
        ...state,
        nominations: [...state.nominations, nomination],
        meetingLog: log(
          typedAction.timestamp,
          fromFloor
            ? logFloorNomination(typedAction.nomineeName, typedAction.position)
            : logNomination(typedAction.nominatedBy, typedAction.nomineeName, typedAction.position),
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
      const open = state.currentElection;
      // The next ballot of an election with seats still open: its candidates, less those elected
      if (open) {
        return {
          ...state,
          currentElection: {
            ...open,
            votingInProgress: true,
            ballotResults: zeros(open.candidates),
            votersWhoVoted: [],
            floorBallots: {},
            floorWriteIns: {},
            floorBlank: 0,
            floorIllegal: 0,
            floorBallotCount: 0,
            winners: [],
            elected: null,
          },
          meetingLog: log(
            typedAction.timestamp,
            `Chair: Ballot ${(open.ballots ?? []).length + 1} is now open for ${open.position}.`,
          ),
        };
      }
      // The nominees, less anyone declined or already elected to the position
      const candidates = remainingNominees(state, typedAction.position).map((name) => ({
        name,
        id:
          state.nominations.find(
            (n) => n.position === typedAction.position && n.nomineeName === name,
          )?.nomineeId ?? 0,
      }));
      const seats = state.openSeats ?? 1;
      // Seats left open by an acclamation or an earlier ballot: the same election goes on
      const continuing = state.continuingElection;
      const election: Election = {
        id: continuing?.id ?? typedAction.electionId,
        ...(continuing?.ballots ? { ballots: continuing.ballots } : {}),
        ...(continuing?.ballotTotals ? { ballotTotals: continuing.ballotTotals } : {}),
        position: typedAction.position,
        candidates,
        requiredVotes: typedAction.requiredVotes,
        votingInProgress: true,
        ...(seats > 1 ? { seats } : {}),
        ballotResults: zeros(candidates),
        votersWhoVoted: [],
        floorBallots: {},
        elected: null,
      };

      // Opening the ballot closes nominations
      return {
        ...state,
        currentElection: election,
        nominationsOpen: false,
        currentNominationPosition: null,
        openSeats: null,
        continuingElection: null,
        meetingLog: log(
          typedAction.timestamp,
          `Chair: Voting is now open for ${typedAction.position}. ${candidates.length} candidate(s)${seats > 1 ? `, ${seats} seats` : ''}.`,
        ),
      };
    }

    case 'CAST_BALLOT': {
      const typedAction = action as Extract<MeetingAction, { type: 'CAST_BALLOT' }>;
      const election = state.currentElection;
      if (!election || !election.votingInProgress) return state;

      // Check if voter has already voted
      if (election.votersWhoVoted.includes(typedAction.voterId)) return state;

      // One ballot, marking one name or several (up to the seats), each once
      const names = [
        ...new Set(
          typedAction.candidateNames ??
            (typedAction.candidateName ? [typedAction.candidateName] : []),
        ),
      ];
      const ballotResults = { ...election.ballotResults };
      for (const name of names) ballotResults[name] = (ballotResults[name] ?? 0) + 1;
      return {
        ...state,
        currentElection: {
          ...election,
          ballotResults,
          votersWhoVoted: [...election.votersWhoVoted, typedAction.voterId],
        },
      };
    }

    case 'SET_FLOOR_BALLOTS': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_FLOOR_BALLOTS' }>;
      if (!state.currentElection) return state;
      return {
        ...state,
        currentElection: {
          ...state.currentElection,
          floorBallots: typedAction.counts,
          floorWriteIns: typedAction.writeIns ?? {},
          floorBlank: typedAction.blank ?? 0,
          floorIllegal: typedAction.illegal ?? 0,
          floorBallotCount: typedAction.ballots ?? 0,
        },
      };
    }

    case 'CLOSE_ELECTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_ELECTION' }>;
      const election = state.currentElection;
      if (!election) return state;

      // Ballots on devices and the tellers' count of paper ballots together. Every ballot's
      // count and totals are kept for the minutes, whatever comes of it.
      const { results, totals, winners, next, tied } = countBallot(election);
      const ballots = [...(election.ballots ?? []), results];
      const ballotTotals = [...(election.ballotTotals ?? []), totals];
      const writeIns = new Set(next.filter((c) => c.writeIn).map((c) => c.name));
      const resultsText = Object.entries(results)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(
          ([name, votes]) => `${name}${writeIns.has(name) ? ' (write-in)' : ''}: ${votes} vote(s)`,
        )
        .join(', ');
      const closedLine = `Voting closed for ${election.position}. Results: ${resultsText}. ${totals.cast} ballot(s) cast.`;

      // RONR: balloting continues until the seats are filled, and no candidate is dropped, so
      // with nobody elected the next ballot opens at once (nothing else could move it on). Under
      // a plurality, a tie at the top is run off among the tied.
      if (winners.length === 0) {
        const ballot = ballots.length + 1;
        const runoff = tied.length > 0;
        return {
          ...state,
          currentElection: {
            ...election,
            candidates: next,
            ballotResults: zeros(next),
            votersWhoVoted: [],
            floorBallots: {},
            floorWriteIns: {},
            floorBlank: 0,
            floorIllegal: 0,
            floorBallotCount: 0,
            ballots,
            ballotTotals,
            winners: [],
            votingInProgress: true,
            elected: null,
            ...(runoff ? { isRunoff: true } : {}),
            // Counts the repeated ballots (the first ballot is round 0)
            runoffRound: (election.runoffRound ?? 0) + 1,
          },
          meetingLog: log(
            typedAction.timestamp,
            runoff
              ? `${closedLine} TIE between: ${joinNames(tied)}. Ballot ${ballot} is now open.`
              : `${closedLine} No candidate received the required ${election.requiredVotes} vote. Ballot ${ballot} is now open.`,
          ),
        };
      }

      return {
        ...state,
        currentElection: {
          ...election,
          candidates: next,
          // The tally the result rests on, device and paper ballots together, for the result,
          // the declaration and the minutes
          ballotResults: results,
          ballots,
          ballotTotals,
          votingInProgress: false,
          winners,
          elected: winners[0],
        },
        meetingLog: log(
          typedAction.timestamp,
          `${closedLine} ${joinNames(winners)} ${winners.length > 1 ? 'have' : 'has'} the vote required.`,
        ),
      };
    }

    case 'DECLARE_ELECTED': {
      const typedAction = action as Extract<MeetingAction, { type: 'DECLARE_ELECTED' }>;
      const election = state.currentElection;
      if (!election) return state;
      const winners = winnersOf(election);
      const name = typedAction.candidateName;
      // Nobody is elected twice
      if (!winners.includes(name) || electedTo(state, election.position).includes(name)) {
        return state;
      }

      const candidate = election.candidates.find((c) => c.name === name);
      const memberId = candidate?.id || state.members.find((m) => m.name === name)?.id || 0;
      const ballots = election.ballots ?? [];
      const officer: Officer = {
        position: election.position,
        name,
        memberId,
        electedAt: typedAction.timestamp,
        ...(ballots.length > 0 ? { ballots } : {}),
        ...(election.ballotTotals?.length ? { ballotTotals: election.ballotTotals } : {}),
        requiredVotes: election.requiredVotes,
        electionId: election.id,
        ...(candidate?.writeIn ? { writeIn: true as const } : {}),
        ...decisionContext(state, typedAction.at),
      };

      // The other winners await their declaration; once they are declared, the seats still
      // open take another ballot, among the candidates not elected
      const stillWinning = winners.filter((w) => w !== name);
      const seats = (election.seats ?? 1) - 1;
      const currentElection: Election | null =
        stillWinning.length > 0 || seats > 0
          ? {
              ...election,
              seats,
              candidates: election.candidates.filter((c) => c.name !== name),
              winners: stillWinning,
              elected: stillWinning[0] ?? null,
            }
          : null;

      const writeInNote = candidate?.writeIn ? ' (write-in candidate)' : '';
      return {
        ...state,
        electedOfficers: [...state.electedOfficers, officer],
        currentElection,
        meetingLog: log(
          typedAction.timestamp,
          `Chair declares ${name}${writeInNote} elected as ${officer.position}.`,
        ),
      };
    }

    case 'ELECT_BY_ACCLAMATION': {
      const typedAction = action as Extract<MeetingAction, { type: 'ELECT_BY_ACCLAMATION' }>;
      const acclaimed = acclamationCandidates(state);
      if (!acclaimed) return state;
      const { position, names, seats } = acclaimed;
      const election = state.currentElection;
      const context = decisionContext(state, typedAction.at);
      // The election these seats belong to: the ballot's, one carried through nominations
      // reopened, or a new one
      const history = electionHistory(state);
      const electionId = history.id ?? typedAction.electionId;
      const officers: Officer[] = names.map((name) => {
        const candidate = election?.candidates.find((c) => c.name === name);
        const nominee = state.nominations.find(
          (n) => n.position === position && n.nomineeName === name && !n.declined,
        );
        return {
          position,
          name,
          memberId:
            candidate?.id ||
            nominee?.nomineeId ||
            state.members.find((m) => m.name === name)?.id ||
            0,
          electedAt: typedAction.timestamp,
          ...(history.ballots.length ? { ballots: history.ballots } : {}),
          ...(history.ballotTotals.length ? { ballotTotals: history.ballotTotals } : {}),
          electionId,
          acclamation: true as const,
          ...(candidate?.writeIn ? { writeIn: true as const } : {}),
          ...context,
        };
      });
      // Fewer nominees than seats leaves the rest open, for nominations again (or set aside)
      const left = seats - names.length;
      return {
        ...state,
        electedOfficers: [...state.electedOfficers, ...officers],
        currentElection: null,
        currentNominationPosition: left > 0 ? position : null,
        openSeats: left > 0 ? left : null,
        continuingElection:
          left > 0
            ? {
                id: electionId,
                ...(history.ballots.length ? { ballots: history.ballots } : {}),
                ...(history.ballotTotals.length ? { ballotTotals: history.ballotTotals } : {}),
              }
            : null,
        meetingLog: log(
          typedAction.timestamp,
          `Chair declares ${joinNames(names)} elected as ${position}, by acclamation.`,
        ),
      };
    }

    case 'SET_ASIDE_ELECTION': {
      const { timestamp, at } = action as Extract<MeetingAction, { type: 'SET_ASIDE_ELECTION' }>;
      if (!state.nominationsOpen && !state.currentNominationPosition && !state.currentElection) {
        return state;
      }
      const position = state.currentElection?.position ?? state.currentNominationPosition;
      // The minutes record it, with the count of each ballot already closed and not already
      // minuted with someone it elected (the open ballot's count, never announced, goes with it),
      // and the seats left unfilled
      const { ballots, ballotTotals } = ballotsNotMinuted(state);
      const seats = seatsOpen(state);
      const setAside: ElectionSetAsideRecord = {
        position,
        ...(ballots.length > 0 ? { ballots } : {}),
        ...(ballotTotals.length > 0 ? { ballotTotals } : {}),
        ...(seats > 1 ? { seats } : {}),
        timestamp,
        ...decisionContext(state, at),
      };
      // The nominations already made stand: nominations reopened for the same position bring
      // them back
      return {
        ...state,
        nominationsOpen: false,
        currentNominationPosition: null,
        openSeats: null,
        continuingElection: null,
        currentElection: null,
        electionsSetAside: [...(state.electionsSetAside ?? []), setAside],
        meetingLog: log(timestamp, logElectionSetAside(position)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
