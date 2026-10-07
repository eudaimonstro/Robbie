import React from 'react';
import { CheckCircle } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';

interface CommitteeReportsPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const CommitteeReportsPanel = React.memo(function CommitteeReportsPanel({
  state,
  dispatch,
}: CommitteeReportsPanelProps) {
  if (state.meetingStage !== 'reports') {
    return null;
  }

  return (
    <section className="bg-surface rounded-lg p-4 shadow-sm" aria-labelledby="reports-heading">
      <h3 id="reports-heading" className="label-caps mb-3">
        Committee reports
      </h3>

      {state.committeeReports.length === 0 ? (
        <p className="text-ink-muted text-center py-4">No committee reports scheduled</p>
      ) : (
        <div className="space-y-3" role="list" aria-label="Committee reports">
          {state.committeeReports.map((report) => (
            <article
              key={report.id}
              role="listitem"
              className={`border rounded-lg p-4 ${
                report.presented ? 'bg-carried-tint border-carried/40' : 'bg-surface-2 border-rule'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-ink">{report.committee}</h4>
                  <p className="text-sm text-ink-muted">Presenter: {report.presenter}</p>
                </div>
                {report.presented && (
                  <CheckCircle size={18} className="text-carried" aria-label="Presented" />
                )}
              </div>
              <p className="text-sm text-ink mb-2">{report.summary}</p>
              {report.recommendations && (
                <div className="bg-caution-tint border border-caution/40 rounded-sm p-2 mb-2">
                  <p className="text-xs font-semibold text-ink mb-1">Recommendations:</p>
                  <p className="text-xs text-ink">{report.recommendations}</p>
                </div>
              )}
              {!report.presented && (
                <button
                  onClick={() =>
                    dispatch({
                      type: 'PRESENT_COMMITTEE_REPORT',
                      reportId: report.id,
                      timestamp: generateTimestamp(),
                    })
                  }
                  className="w-full mt-2 bg-gavel text-paper py-2 rounded-lg hover:bg-gavel-700 dark:hover:bg-gavel-300 text-sm font-medium"
                >
                  Present Report
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-muted mt-3 text-center">
        After all reports, click "Proceed to Next Stage"
      </p>
    </section>
  );
});
