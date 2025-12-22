import type { MeetingState, AgendaItem, RuleSuspension, Motion } from '../types/index.js';

export interface DividedPart {
  id: number;
  text: string;
  originalMotionId: number;
}

export interface MotionOutcome {
  tabledMotions: Motion[];
  agendaAdopted: boolean;
  agendaObjection: boolean;
  agenda: AgendaItem[];
  newSuspension: RuleSuspension | null;
  restoredMotion: Motion | null;
  objectionKilledMotion: Motion | null;
  reconsideredMotionId: number | null;
  dividedParts: DividedPart[] | null;
  dividedMainMotion: Motion | null;
}

export interface ProcessedOutcome {
  suspendedRules: RuleSuspension[];
  suspensionLog: string;
  workingStack: Motion[];
  objectionLog: string;
  finalStack: Motion[];
  finalCurrentMotion: Motion | null;
  restoredLog: string;
}

/**
 * Process motion outcome result to compute derived state fields
 * Reduces duplication between CLOSE_VOTING and UNANIMOUS_CONSENT_PASSED
 */
export function processOutcomeResult(
  outcome: MotionOutcome,
  currentSuspendedRules: RuleSuspension[],
  newStack: Motion[],
  motionToRestore?: Motion | null
): ProcessedOutcome {
  // Handle suspended rules
  const suspendedRules = outcome.newSuspension
    ? [...currentSuspendedRules, outcome.newSuspension]
    : currentSuspendedRules;

  const suspensionLog = outcome.newSuspension
    ? `[RULE SUSPENDED] ${outcome.newSuspension.rule}: ${outcome.newSuspension.purpose}`
    : '';

  // Handle objection killing main motion
  let workingStack = newStack;
  if (outcome.objectionKilledMotion) {
    workingStack = newStack.filter(m => m.id !== outcome.objectionKilledMotion!.id);
  }

  const objectionLog = outcome.objectionKilledMotion
    ? `\n[OBJECTION SUSTAINED] Main motion will not be considered: "${outcome.objectionKilledMotion.text}"`
    : '';

  // Handle restored motion (from table or reconsider)
  const restoreMotion = motionToRestore ?? outcome.restoredMotion;
  const finalStack = restoreMotion
    ? [...workingStack, restoreMotion]
    : workingStack;

  const finalCurrentMotion = restoreMotion
    ? restoreMotion
    : (workingStack[workingStack.length - 1] || null);

  const restoredLog = outcome.restoredMotion && !motionToRestore
    ? `\n[RESTORED FROM TABLE] "${outcome.restoredMotion.text}"`
    : '';

  return {
    suspendedRules,
    suspensionLog,
    workingStack,
    objectionLog,
    finalStack,
    finalCurrentMotion,
    restoredLog
  };
}

/**
 * Helper function to handle motion outcome logic
 * Used by both CLOSE_VOTING and UNANIMOUS_CONSENT_PASSED
 */
export function applyMotionOutcome(state: MeetingState, timestamp: string): MotionOutcome {
  const newStack = state.motionStack.slice(0, -1);
  let tabledMotions: Motion[] = state.tabledMotions;
  let agendaAdopted = state.agendaAdopted;
  let agendaObjection = state.agendaObjection;
  let agenda = state.agenda;
  let newSuspension: RuleSuspension | null = null;
  let restoredMotion: Motion | null = null;
  let objectionKilledMotion: Motion | null = null;
  let reconsideredMotionId: number | null = null;

  // Handle table motion
  if (state.currentMotion?.type === 'layOnTable') {
    const mainMotion = newStack.find(m => m.category === 'main');
    if (mainMotion) {
      tabledMotions = [...tabledMotions, mainMotion];
    }
  }

  // Handle agenda adoption
  if (state.currentMotion?.isAgendaAdoption) {
    agendaAdopted = true;
    agendaObjection = false;
  }

  // Handle agenda amendments
  if (state.currentMotion?.agendaAmendment) {
    const amendment = state.currentMotion.agendaAmendment;

    if (amendment.action === 'add' && amendment.title) {
      const newItem: AgendaItem = {
        id: amendment.itemId || 0,
        title: amendment.title,
        status: "pending" as const
      };

      if (amendment.position === 'end') {
        agenda = [...agenda, newItem];
      } else if (amendment.position === 'beginning') {
        agenda = [newItem, ...agenda];
      } else if (typeof amendment.position === 'number') {
        agenda = [
          ...agenda.slice(0, amendment.position),
          newItem,
          ...agenda.slice(amendment.position)
        ];
      }
    } else if (amendment.action === 'remove') {
      agenda = agenda.filter(item => item.id !== amendment.itemId);
    } else if (amendment.action === 'reorder') {
      const newAgenda = [...agenda];
      const [moved] = newAgenda.splice(amendment.fromIndex!, 1);
      newAgenda.splice(amendment.toIndex!, 0, moved);
      agenda = newAgenda;
    }
  }

  // Handle rule suspension
  if (state.currentMotion?.type === 'suspendRules' && state.currentMotion?.ruleSuspension) {
    const suspension = state.currentMotion.ruleSuspension;

    // Generate new suspension ID (max existing ID + 1)
    const maxId = state.suspendedRules.reduce((max, s) => Math.max(max, s.id), 0);

    newSuspension = {
      id: maxId + 1,
      rule: suspension.rule!,
      purpose: suspension.purpose!,
      specificAction: suspension.specificAction!,
      scope: suspension.scope!,
      suspendedAt: timestamp,
      actionCompleted: false,
      motionId: state.currentMotion.id
    };
  }

  // Handle take from table
  if (state.currentMotion?.type === 'takeFromTable' && state.currentMotion?.tabledMotionId) {
    const motionId = state.currentMotion.tabledMotionId;
    const motion = tabledMotions.find(m => m.id === motionId);

    if (motion) {
      // Remove from tabled motions
      tabledMotions = tabledMotions.filter(m => m.id !== motionId);
      // Restore the motion (will be added to stack by reducer)
      restoredMotion = { ...motion, status: 'active' as const };
    }
  }

  // Handle objection to consideration
  // When objection is sustained (2/3 vote passes), it kills the main motion
  if (state.currentMotion?.type === 'objectionConsideration') {
    const mainMotion = newStack.find(m => m.category === 'main');
    if (mainMotion) {
      objectionKilledMotion = mainMotion;
    }
  }

  // Handle reconsider
  // When reconsider passes, restore the motion for a new vote
  if (state.currentMotion?.type === 'reconsider' && state.currentMotion?.reconsideredMotionId) {
    reconsideredMotionId = state.currentMotion.reconsideredMotionId;
    // The motion will be restored by the reducer (using completedMotions data)
  }

  // Handle divide the question
  // When passed, split the main motion into parts
  let dividedParts: DividedPart[] | null = null;
  let dividedMainMotion: Motion | null = null;
  if (state.currentMotion?.type === 'divideQuestion' && state.currentMotion?.dividedParts) {
    const mainMotion = newStack.find(m => m.category === 'main');
    if (mainMotion && state.currentMotion.dividedParts.length > 0) {
      dividedMainMotion = mainMotion;
      // Create divided parts with sequential IDs starting after highest existing ID
      const maxId = Math.max(
        ...state.motionStack.map(m => m.id),
        state.currentMotion.id,
        0
      );
      dividedParts = state.currentMotion.dividedParts.map((text, index) => ({
        id: maxId + 1 + index,
        text,
        originalMotionId: mainMotion.id
      }));
    }
  }

  return { tabledMotions, agendaAdopted, agendaObjection, agenda, newSuspension, restoredMotion, objectionKilledMotion, reconsideredMotionId, dividedParts, dividedMainMotion };
}
