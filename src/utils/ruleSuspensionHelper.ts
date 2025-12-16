import type { MeetingState, SuspendableRule, RuleSuspension } from '../types';

/**
 * Check if a specific rule is currently suspended
 * @param state - Current meeting state
 * @param rule - The rule to check
 * @returns true if the rule is suspended and active
 */
export function isRuleSuspended(
  state: MeetingState,
  rule: SuspendableRule
): boolean {
  return state.suspendedRules.some(
    suspension =>
      suspension.rule === rule &&
      (suspension.scope === 'meeting-remainder' || !suspension.actionCompleted)
  );
}

/**
 * Mark a single-action suspension as completed
 * @param state - Current meeting state
 * @param rule - The rule whose single-action suspension should be marked complete
 * @returns Updated suspendedRules array
 */
export function markSingleActionComplete(
  state: MeetingState,
  rule: SuspendableRule
): RuleSuspension[] {
  return state.suspendedRules.map(suspension =>
    suspension.rule === rule && suspension.scope === 'single-action'
      ? { ...suspension, actionCompleted: true }
      : suspension
  );
}

/**
 * Get display name for a suspendable rule
 * @param rule - The rule identifier
 * @returns Human-readable name
 */
export function getRuleName(rule: SuspendableRule): string {
  const names: Record<SuspendableRule, string> = {
    'pro-con-alternation': 'Pro/Con Speaker Alternation',
    'second-requirement': 'Second Requirement',
    'motion-precedence': 'Motion Precedence',
    'amendment-depth': 'Amendment Depth Limit',
    'motion-renewal': 'Motion Renewal Restriction',
    'chair-voting-restriction': 'Chair Voting Restriction',
    'motion-maker-priority': 'Motion Maker Priority',
    'mover-cannot-second': 'Mover Cannot Second Own Motion',
    'debate-rules': 'Debate Rules',
    'order-of-business': 'Order of Business'
  };
  return names[rule];
}

/**
 * Get description for a suspendable rule
 * @param rule - The rule identifier
 * @returns Description of what the rule does
 */
export function getRuleDescription(rule: SuspendableRule): string {
  const descriptions: Record<SuspendableRule, string> = {
    'pro-con-alternation': 'Requires speakers to alternate between for and against positions',
    'second-requirement': 'Requires motions to be seconded before consideration',
    'motion-precedence': 'Enforces motion hierarchy (higher precedence interrupts lower)',
    'amendment-depth': 'Limits amendments to 2 levels (primary + secondary)',
    'motion-renewal': 'Prevents re-making defeated motions in same meeting',
    'chair-voting-restriction': 'Chair only votes to break/create ties',
    'motion-maker-priority': 'Motion maker speaks first in debate',
    'mover-cannot-second': 'Member who made motion cannot second it',
    'debate-rules': 'Determines whether motion is debatable',
    'order-of-business': 'Requires sequential progression through meeting stages'
  };
  return descriptions[rule];
}

/**
 * Get active suspensions with their details
 * @param state - Current meeting state
 * @returns Array of active suspensions
 */
export function getActiveSuspensions(state: MeetingState): RuleSuspension[] {
  return state.suspendedRules.filter(
    suspension =>
      suspension.scope === 'meeting-remainder' || !suspension.actionCompleted
  );
}
