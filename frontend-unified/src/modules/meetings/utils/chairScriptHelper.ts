import type { MeetingState } from '@robbie-bylawyer/shared/types';
import {
  acclamationCandidates,
  joinNames,
  votingMethodNow,
  winnersOf,
} from '@robbie-bylawyer/shared/utils';
import { nomineesFor } from './question';

export interface ChairScript {
  text: string;
  note: string;
}

/** What the chair says to open each kind of vote */
const VOTE_SCRIPTS: Record<MeetingState['votingMethod'], string> = {
  standard:
    '"Those in favor, vote on your phone or raise your hand. Those opposed, vote on your phone or raise your hand."',
  voice: '"Those in favor say Aye. Those opposed say No."',
  ballot: '"The ballot is open. Vote on your phone or on a paper ballot."',
  rollcall:
    '"The secretary will call the roll. Answer Aye or No when your name is called, or vote on your phone."',
};

/**
 * Generates contextual chair script based on current meeting state
 * @param state - Current meeting state
 * @returns Chair script with text to say and guidance note, or null if meeting not active
 */
export function getChairScript(state: MeetingState): ChairScript | null {
  if (!state.meetingActive) return null;

  if (state.adjournmentCarried) {
    return {
      text: '"The motion to adjourn has carried. The meeting is adjourned."',
      note: 'Declare the meeting adjourned.',
    };
  }
  if (state.recess) {
    return {
      text: state.recess.until
        ? `"The meeting is in recess until ${state.recess.until}."`
        : '"The meeting is in recess."',
      note: 'Resume the meeting when the members are back.',
    };
  }
  // A point of order, during a vote or not: the chair rules on it at once
  if (state.currentMotion?.type === 'pointOrder') {
    return {
      text: `"${state.currentMotion.mover} will state the point of order." Then: "The point is well taken" or "The point is not well taken."`,
      note: 'Rule on the point. An appeal from the ruling is in order at once.',
    };
  }

  // Agenda adoption phase
  if (
    !state.agendaAdopted &&
    !state.agendaObjection &&
    !state.currentMotion &&
    !state.pendingSecond
  ) {
    return {
      text: '"Is there any objection to adopting the agenda?"',
      note: 'If none, adopt the agenda. If someone objects, record the objection to the agenda.',
    };
  }

  if (
    !state.agendaAdopted &&
    state.agendaObjection &&
    !state.currentMotion &&
    !state.pendingSecond
  ) {
    return {
      text: '"There has been an objection. A motion to adopt the agenda is in order."',
      note: 'Wait for a member to move.',
    };
  }

  // Pending second
  if (state.pendingSecond) {
    return {
      text: '"Is there a second?"',
      note: 'Wait for a second or declare no second.',
    };
  }

  // An election: nominations, the ballot, the result
  if (state.nominationsOpen && state.currentNominationPosition) {
    return {
      text: `"Nominations are open for ${state.currentNominationPosition}. Are there any further nominations?"`,
      note: 'Record nominations from the floor in the election card, then close nominations.',
    };
  }
  if (state.currentNominationPosition && !state.currentElection) {
    const position = state.currentNominationPosition;
    // Nobody to vote for: no ballot is taken
    if (nomineesFor(state, position).length === 0) {
      return {
        text: `"Nominations for ${position} are closed, and nobody has been nominated."`,
        note: 'Open nominations again, or set the election aside.',
      };
    }
    // No more nominees than seats: they may be declared elected without a ballot (RONR 46:40)
    const acclaimed = acclamationCandidates(state);
    if (acclaimed) {
      const names = joinNames(acclaimed.names);
      return {
        text: `"Nominations for ${position} are closed. ${names}, ${acclaimed.names.length > 1 ? 'having been the only nominees, are' : 'being the only nominee, is'} elected by acclamation."`,
        note: 'Declare elected by acclamation in the election card, or open the ballot if the bylaws require one.',
      };
    }
    return {
      text: `"Nominations for ${position} are closed. The ballot will now be taken."`,
      note: 'Open the ballot in the election card.',
    };
  }
  const election = state.currentElection;
  if (election?.votingInProgress) {
    return { text: VOTE_SCRIPTS.ballot, note: 'Enter the paper ballots, then close the ballot.' };
  }
  const winners = election ? winnersOf(election) : [];
  if (election && winners.length > 0) {
    return {
      text: `"${joinNames(winners)}, having received the vote required, ${winners.length > 1 ? 'are' : 'is'} elected ${election.position}."`,
      note:
        winners.length > 1
          ? 'Declare each of them elected in the election card.'
          : 'Declare the result in the election card.',
    };
  }
  if (election) {
    const seats = election.seats ?? 1;
    return {
      text: `"${seats === 1 ? 'One seat remains' : `${seats} seats remain`} to be filled. The ballot will now be taken again."`,
      note: 'Open the next ballot in the election card.',
    };
  }

  // Voting in progress: on phones and by a show of hands in the room, unless it is a voice vote
  if (state.votingOpen) {
    const method = Object.hasOwn(VOTE_SCRIPTS, votingMethodNow(state))
      ? votingMethodNow(state)
      : 'standard';
    return { text: VOTE_SCRIPTS[method], note: 'Close voting when done.' };
  }

  // Check for recently passed or failed vote. The reducer logs the result as
  // "Vote: Yea X, Nay Y. CARRIED." (or FAILED), or "Motion CARRIED by unanimous consent.",
  // followed by any outcome notes.
  const lastLog = state.meetingLog[state.meetingLog.length - 1];
  const outcomeMatch = lastLog?.message.match(
    /^(?:(?:Vote: Yea \d+, Nay \d+|Voice vote: the (?:ayes|noes) have it)\. (CARRIED|FAILED)\.|Motion (CARRIED) by unanimous consent\.)/,
  );
  const voteOutcome = outcomeMatch?.[1] ?? outcomeMatch?.[2];
  // A voice vote the chair declared: a member may still call for a division
  if (state.voiceVote && !state.votingOpen) {
    return {
      text: `"The ${state.voiceVote.passed ? 'ayes' : 'noes'} have it, and the motion ${state.voiceVote.passed ? 'is adopted' : 'is lost'}."`,
      note: 'If a member calls for a division, record it: the vote is counted.',
    };
  }

  if (voteOutcome === 'CARRIED' && !state.votingOpen && !state.currentMotion) {
    if (state.currentAgendaItem) {
      return {
        text: '"The motion has carried."',
        note: 'Agenda item complete. Move to next item or ask if there is further discussion.',
      };
    }

    return {
      text: '"The motion has carried."',
      note: 'Proceed to next business.',
    };
  }

  if (voteOutcome === 'FAILED' && !state.votingOpen && !state.currentMotion) {
    if (state.currentAgendaItem) {
      return {
        text: '"The motion has failed."',
        note: 'Ask if there is further discussion or a substitute motion on this agenda item, or move to complete/call next item.',
      };
    }

    return {
      text: '"The motion has failed."',
      note: 'Ask if there is further business or other motions.',
    };
  }

  // Current motion handling
  if (state.currentMotion) {
    const recentObjection = lastLog && lastLog.message.includes('objects');

    if (state.currentMotion.type === 'withdrawMotion') {
      return {
        text: `"${state.currentMotion.mover} asks to withdraw the motion. Is there any objection?"`,
        note: 'Without objection it is withdrawn; with one, put the request to a vote.',
      };
    }
    if (state.currentMotion.debateClosed) {
      return {
        text: `"Debate is closed. The question is on: ${state.currentMotion.text}."`,
        note: 'Open the vote.',
      };
    }

    // Special handling for Appeal
    if (state.currentMotion.type === 'appeal' && state.lastChairRuling) {
      return {
        text: '"The chair will entertain debate on the appeal. The chair may speak first to explain the ruling."',
        note: `Appealing: "${state.lastChairRuling.ruling}" - Yes keeps the chair's ruling, No overturns it.`,
      };
    }

    if (recentObjection) {
      return {
        text: '"There is an objection. The question will be put to a vote."',
        note: 'Open the vote.',
      };
    }

    return {
      text: state.currentMotion.debatable
        ? `"Is there any discussion on: ${state.currentMotion.text}?"`
        : '"This motion is not debatable."',
      note: state.currentMotion.debatable
        ? 'Recognize speakers, then call the question.'
        : 'Proceed to vote.',
    };
  }

  // Agenda item discussion
  if (state.currentAgendaItem) {
    return {
      text: `"We are now on: ${state.currentAgendaItem.title}"`,
      note: 'Allow discussion or motions.',
    };
  }

  // General business
  if (state.agendaAdopted) {
    const next = state.agenda.find((a) => a.status === 'pending');
    return next
      ? {
          text: '"We will proceed to the next item."',
          note: `Next: "${next.title}"`,
        }
      : {
          text: '"Is there any new business?"',
          note: 'If none, entertain motion to adjourn.',
        };
  }

  return {
    text: '"Is there any business?"',
    note: '',
  };
}
