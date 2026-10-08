import type { BallotTotals, Election, MeetingState } from '../types/index.js';

/** The most seats one election fills */
export const MAX_SEATS = 20;

/** "Alice", "Alice and Ben", "Alice, Ben and Carmen" */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Who has been elected to this position in this meeting */
export function electedTo(state: MeetingState, position: string): string[] {
  return state.electedOfficers.filter((o) => o.position === position).map((o) => o.name);
}

/**
 * Who stands for the position: nominated, not declined, and not already elected to it in this
 * meeting (the winner of one seat is not on the next seat's ballot), each name once
 */
export function remainingNominees(state: MeetingState, position: string): string[] {
  const elected = new Set(electedTo(state, position));
  return [
    ...new Set(
      state.nominations
        .filter((n) => n.position === position && !n.declined && !elected.has(n.nomineeName))
        .map((n) => n.nomineeName),
    ),
  ];
}

/** The seats an election still fills: the ballot's, or before it the seats nominations opened for */
export function seatsOpen(state: MeetingState): number {
  return state.currentElection
    ? (state.currentElection.seats ?? 1)
    : state.currentNominationPosition
      ? (state.openSeats ?? 1)
      : 0;
}

/** Who has the vote required on the closed ballot, awaiting the chair's declaration */
export function winnersOf(election: Election): string[] {
  return election.winners ?? (election.elected ? [election.elected] : []);
}

/**
 * Who the chair may declare elected by acclamation now (RONR 46:40), or null: with nominations
 * closed and no ballot open or awaiting a declaration, the candidates left are one or more, and
 * no more than the seats open
 */
export function acclamationCandidates(
  state: MeetingState,
): { position: string; names: string[]; seats: number } | null {
  if (state.nominationsOpen) return null;
  const election = state.currentElection;
  let position: string;
  let names: string[];
  if (election) {
    if (election.votingInProgress || winnersOf(election).length > 0) return null;
    position = election.position;
    names = election.candidates.map((c) => c.name);
  } else {
    if (!state.currentNominationPosition) return null;
    position = state.currentNominationPosition;
    names = remainingNominees(state, position);
  }
  const seats = seatsOpen(state);
  if (names.length === 0 || names.length > seats) return null;
  return { position, names, seats };
}

const sum = (counts: Record<string, number> | undefined) =>
  Object.values(counts ?? {}).reduce((total, count) => total + count, 0);

/** What a closed ballot comes to (see countBallot) */
export interface BallotCount {
  /** Marks by name, devices and paper (write-ins too) together */
  results: Record<string, number>;
  totals: BallotTotals;
  /** Who has the vote required, the most first, at most one per seat */
  winners: string[];
  /**
   * With nobody elected, who goes on the next ballot: every candidate (RONR 46:32), or under a
   * plurality the candidates tied at the top
   */
  next: Election['candidates'];
  /** Under a plurality with nobody elected: the candidates tied at the top, run off */
  tied: string[];
}

/**
 * Count a ballot: device ballots and paper ballots together. Ballots cast are the device ballots
 * and the paper ballots counted, blanks left out and illegal ballots in (RONR 45:31); with one
 * seat the paper ballots are their marks plus the illegal ones, with several the chair enters
 * how many there were. A candidate with more than half the ballots cast has a majority (at
 * least two thirds for two thirds; under a plurality, the most marks). The candidates with the
 * vote required fill the seats, the most first; candidates tied for the last open seat are left
 * for another ballot.
 */
export function countBallot(election: Election): BallotCount {
  const seats = election.seats ?? 1;
  const results: Record<string, number> = {};
  for (const c of election.candidates) results[c.name] = 0;
  for (const counts of [election.ballotResults, election.floorBallots, election.floorWriteIns]) {
    for (const [name, count] of Object.entries(counts ?? {})) {
      results[name] = (results[name] ?? 0) + count;
    }
  }
  const illegal = election.floorIllegal ?? 0;
  const paper =
    seats > 1
      ? (election.floorBallotCount ?? 0)
      : sum(election.floorBallots) + sum(election.floorWriteIns) + illegal;
  const cast = election.votersWhoVoted.length + paper;
  const writeIns = Object.entries(election.floorWriteIns ?? {})
    .filter(([, count]) => count > 0)
    .map(([name]) => name);
  const totals: BallotTotals = {
    cast,
    ...(election.floorBlank ? { blank: election.floorBlank } : {}),
    ...(illegal ? { illegal } : {}),
    ...(writeIns.length > 0 ? { writeIns } : {}),
  };

  const ranked = Object.entries(results).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const required = election.requiredVotes;
  const hasVote = (votes: number) =>
    cast > 0 &&
    votes > 0 &&
    (required === 'majority'
      ? votes * 2 > cast
      : required === '2/3'
        ? votes * 3 >= cast * 2
        : true);
  const qualified = ranked.filter(([, votes]) => hasVote(votes));
  let winners = qualified.slice(0, seats);
  // A tie for the last open seat: nobody tied for it takes it
  if (qualified.length > seats) {
    const last = qualified[seats - 1][1];
    if (qualified[seats][1] === last) winners = winners.filter(([, votes]) => votes > last);
  }

  // The candidates for a later ballot: everyone on this one, and anyone written in who received
  // votes, as a write-in
  const known = new Set(election.candidates.map((c) => c.name));
  const all: Election['candidates'] = [
    ...election.candidates,
    ...writeIns.filter((name) => !known.has(name)).map((name) => ({ name, id: 0, writeIn: true })),
  ];
  const top = ranked[0]?.[1] ?? 0;
  const tiedAtTop = ranked.filter(([, votes]) => votes === top).map(([name]) => name);
  const tied =
    required === 'plurality' && winners.length === 0 && top > 0 && tiedAtTop.length > 1
      ? tiedAtTop
      : [];
  const next = tied.length > 0 ? all.filter((c) => tied.includes(c.name)) : all;
  return { results, totals, winners: winners.map(([name]) => name), next, tied };
}
