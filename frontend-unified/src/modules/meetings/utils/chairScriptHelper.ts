import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { isRuleSuspended } from '@robbie-bylawyer/shared/utils';
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

  // Agenda adoption phase
  if (
    !state.agendaAdopted &&
    !state.agendaObjection &&
    !state.currentMotion &&
    !state.pendingSecond
  ) {
    return {
      text: '"Is there any objection to adopting the agenda?"',
      note: "If none, click 'No Objection'. If someone objects, click 'Objection Raised'.",
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
    return {
      text: `"Nominations for ${position} are closed. The ballot will now be taken."`,
      note: 'Open the ballot in the election card.',
    };
  }
  const election = state.currentElection;
  if (election?.votingInProgress) {
    return { text: VOTE_SCRIPTS.ballot, note: 'Enter the paper ballots, then close the ballot.' };
  }
  if (election?.elected) {
    return {
      text: `"${election.elected}, having received the vote required, is elected ${election.position}."`,
      note: 'Declare the result in the election card.',
    };
  }

  // Voting in progress: on phones and by a show of hands in the room, unless it is a voice vote
  if (state.votingOpen) {
    const method = Object.hasOwn(VOTE_SCRIPTS, state.votingMethod)
      ? state.votingMethod
      : 'standard';
    return { text: VOTE_SCRIPTS[method], note: 'Close voting when done.' };
  }

  // Check for recently passed or failed vote. The reducer logs the result as
  // "Vote: Yea X, Nay Y. CARRIED." (or FAILED), or "Motion CARRIED by unanimous consent.",
  // followed by any outcome notes.
  const lastLog = state.meetingLog[state.meetingLog.length - 1];
  const outcomeMatch = lastLog?.message.match(
    /^(?:Vote: Yea \d+, Nay \d+\. (CARRIED|FAILED)\.|Motion (CARRIED) by unanimous consent\.)/,
  );
  const voteOutcome = outcomeMatch?.[1] ?? outcomeMatch?.[2];

  if (voteOutcome === 'CARRIED' && !state.votingOpen && !state.currentMotion) {
    // Check if this was a suspension (special handling)
    if (lastLog.message.includes('[RULE SUSPENDED]')) {
      const suspensionMatch = lastLog.message.match(/\[RULE SUSPENDED\] ([\w-]+)/);
      const ruleName = suspensionMatch ? suspensionMatch[1] : 'rule';
      return {
        text: '"The motion has carried. The rules have been suspended."',
        note: `The ${ruleName} is now suspended. Proceed with business under the suspended rules.`,
      };
    }

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
    const debateRulesSuspended = isRuleSuspended(state, 'debate-rules');

    // Special handling for Appeal
    if (state.currentMotion.type === 'appeal' && state.lastChairRuling) {
      return {
        text: '"The chair will entertain debate on the appeal. The chair may speak first to explain the ruling."',
        note: `Appealing: "${state.lastChairRuling.ruling}" - Yes keeps the chair's ruling, No overturns it.`,
      };
    }

    if (recentObjection) {
      return {
        text: '"An objection has been raised. The motion is now open for debate."',
        note: state.currentMotion.debatable
          ? 'Recognize speakers, then call the question.'
          : 'This motion is not debatable - proceed to vote.',
      };
    }

    // When debate-rules suspended, chair can proceed directly to vote even on debatable motions
    if (debateRulesSuspended && state.currentMotion.debatable) {
      return {
        text: `"Is there any discussion on: ${state.currentMotion.text}?"`,
        note: '[Debate rules suspended] You may proceed directly to vote without debate if desired.',
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
