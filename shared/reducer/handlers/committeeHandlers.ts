import type { MeetingAction } from '../../types/index.js';
import type { ActionHandler } from './types.js';

export const committeeHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'ADD_COMMITTEE_REPORT': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADD_COMMITTEE_REPORT' }>;
      return {
        ...state,
        committeeReports: [...state.committeeReports, typedAction.report],
      };
    }

    case 'PRESENT_COMMITTEE_REPORT': {
      const typedAction = action as Extract<MeetingAction, { type: 'PRESENT_COMMITTEE_REPORT' }>;
      const report = state.committeeReports.find((r) => r.id === typedAction.reportId);
      if (!report) return state;

      return {
        ...state,
        committeeReports: state.committeeReports.map((r) =>
          r.id === typedAction.reportId ? { ...r, presented: true } : r,
        ),
        meetingLog: log(
          typedAction.timestamp,
          `${report.committee} report presented by ${report.presenter}.${report.recommendations ? ' Recommendations made.' : ''}`,
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
