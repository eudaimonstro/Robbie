import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { isRuleSuspended } from '@robbie-bylawyer/shared/utils';

export interface ChairScript {
  text: string;
  note: string;
}

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

  // Voting in progress
  if (state.votingOpen) {
    return {
      text: '"Those in favor say Aye. Those opposed say No."',
      note: 'Close voting when done.',
    };
  }

  // Check for recently passed or failed vote
  const lastLog = state.meetingLog[state.meetingLog.length - 1];

  if (
    lastLog &&
    lastLog.message.includes('Motion CARRIED') &&
    !state.votingOpen &&
    !state.currentMotion
  ) {
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

  if (
    lastLog &&
    lastLog.message.includes('Motion FAILED') &&
    !state.votingOpen &&
    !state.currentMotion
  ) {
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
        note: `Appealing: "${state.lastChairRuling.ruling}" - Vote Yea to sustain chair, Nay to overturn.`,
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
