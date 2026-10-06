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
    <section className="bg-white rounded-lg p-4 shadow-sm" aria-labelledby="reports-heading">
      <h3 id="reports-heading" className="font-semibold mb-3 text-gray-800">
        <span aria-hidden="true">📊</span> Committee Reports
      </h3>

      {state.committeeReports.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No committee reports scheduled</p>
      ) : (
        <div className="space-y-3" role="list" aria-label="Committee reports">
          {state.committeeReports.map((report) => (
            <article
              key={report.id}
              role="listitem"
              className={`border rounded-lg p-4 ${
                report.presented ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-gray-900">{report.committee}</h4>
                  <p className="text-sm text-gray-600">Presenter: {report.presenter}</p>
                </div>
                {report.presented && (
                  <CheckCircle size={18} className="text-green-600" aria-label="Presented" />
                )}
              </div>
              <p className="text-sm text-gray-700 mb-2">{report.summary}</p>
              {report.recommendations && (
                <div className="bg-amber-50 border border-amber-200 rounded-sm p-2 mb-2">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Recommendations:</p>
                  <p className="text-xs text-amber-900">{report.recommendations}</p>
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
                  className="w-full mt-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
                >
                  Present Report
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3 text-center">
        After all reports, click "Proceed to Next Stage"
      </p>
    </section>
  );
});
