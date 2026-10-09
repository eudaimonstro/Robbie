import type { MeetingStage } from '../types/index.js';

export interface MeetingStageInfo {
  readonly stage: MeetingStage;
  readonly label: string;
  readonly logMessage: string;
}

/**
 * Ordered list of meeting stages per Robert's Rules of Order
 */
export const MEETING_STAGES: readonly MeetingStageInfo[] = [
  { stage: 'not-started', label: 'Not Started', logMessage: '' },
  {
    stage: 'call-to-order',
    label: 'Call to Order',
    logMessage: 'Meeting called to order',
  },
  {
    stage: 'minutes-approval',
    label: 'Approval of Minutes',
    logMessage: 'Reading and approval of minutes',
  },
  {
    stage: 'reports',
    label: 'Reports',
    logMessage: 'Reports of officers and committees',
  },
  { stage: 'special-orders', label: 'Special Orders', logMessage: 'Special orders' },
  {
    stage: 'unfinished-business',
    label: 'Unfinished Business',
    logMessage: 'Unfinished business and general orders',
  },
  { stage: 'new-business', label: 'New Business', logMessage: 'New business' },
  { stage: 'announcements', label: 'Announcements', logMessage: 'Announcements' },
  { stage: 'adjourned', label: 'Adjourned', logMessage: 'Meeting adjourned' },
] as const;

/**
 * Get the stage order array for navigation
 */
export const STAGE_ORDER: readonly MeetingStage[] = MEETING_STAGES.map((s) => s.stage);

/**
 * Get the log message for a given stage
 */
export function getStageLogMessage(stage: MeetingStage): string {
  return MEETING_STAGES.find((s) => s.stage === stage)?.logMessage || '';
}
