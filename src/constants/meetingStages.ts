import type { MeetingStage } from '../types';

export interface MeetingStageInfo {
  readonly stage: MeetingStage;
  readonly label: string;
  readonly icon: string;
  readonly logMessage: string;
}

/**
 * Ordered list of meeting stages per Robert's Rules of Order
 */
export const MEETING_STAGES: readonly MeetingStageInfo[] = [
  { stage: 'not-started', label: 'Not Started', icon: '', logMessage: '' },
  { stage: 'call-to-order', label: 'Call to Order', icon: '🔔', logMessage: 'Meeting called to order' },
  { stage: 'minutes-approval', label: 'Approval of Minutes', icon: '📝', logMessage: 'Reading and approval of minutes' },
  { stage: 'reports', label: 'Reports', icon: '📊', logMessage: 'Reports of officers and committees' },
  { stage: 'special-orders', label: 'Special Orders', icon: '⭐', logMessage: 'Special orders' },
  { stage: 'unfinished-business', label: 'Unfinished Business', icon: '📋', logMessage: 'Unfinished business and general orders' },
  { stage: 'new-business', label: 'New Business', icon: '✨', logMessage: 'New business' },
  { stage: 'announcements', label: 'Announcements', icon: '📢', logMessage: 'Announcements' },
  { stage: 'adjourned', label: 'Adjourned', icon: '🔚', logMessage: 'Meeting adjourned' },
] as const;

/**
 * Stages that should be displayed in the Order of Business UI
 * (excludes not-started and adjourned)
 */
export const DISPLAYABLE_STAGES = MEETING_STAGES.filter(
  s => s.stage !== 'not-started' && s.stage !== 'adjourned'
);

/**
 * Get the stage order array for navigation
 */
export const STAGE_ORDER: readonly MeetingStage[] = MEETING_STAGES.map(s => s.stage);

/**
 * Get the log message for a given stage
 */
export function getStageLogMessage(stage: MeetingStage): string {
  return MEETING_STAGES.find(s => s.stage === stage)?.logMessage || '';
}

/**
 * Get the next stage in the order
 */
export function getNextStage(currentStage: MeetingStage): MeetingStage {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const nextIndex = Math.min(currentIndex + 1, STAGE_ORDER.length - 1);
  return STAGE_ORDER[nextIndex];
}

/**
 * Check if this is the last stage before adjournment
 */
export function isLastActiveStage(stage: MeetingStage): boolean {
  return stage === 'announcements';
}
