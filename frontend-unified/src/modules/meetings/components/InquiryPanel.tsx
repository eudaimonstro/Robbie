import { useState, useMemo, useCallback } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { inquiryKind } from '../utils/inquiryKinds';

interface InquiryPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The presiding officer, who answers */
  currentUser: Member;
}

/** Questions members asked the chair: the chair answers each, and the last answers stay listed */
export function InquiryPanel({ state, dispatch, currentUser }: InquiryPanelProps) {
  const [answerText, setAnswerText] = useState<Record<number, string>>({});

  const handleAnswerInquiry = useCallback(
    (inquiryId: number) => {
      const answer = answerText[inquiryId];
      if (!answer?.trim()) return;

      dispatch({
        type: 'ANSWER_INQUIRY',
        inquiryId,
        answer: answer.trim(),
        answeredBy: currentUser.name,
        timestamp: generateTimestamp(),
      });
      setAnswerText((prev) => ({ ...prev, [inquiryId]: '' }));
    },
    [dispatch, answerText, currentUser.name],
  );

  const unansweredInquiries = useMemo(
    () => state.inquiries.filter((inq) => !inq.answer),
    [state.inquiries],
  );
  // The last five answered, the latest first
  const recentAnsweredInquiries = useMemo(
    () =>
      state.inquiries
        .filter((inq) => inq.answer)
        .slice(-5)
        .reverse(),
    [state.inquiries],
  );

  return (
    <section className="card p-4" aria-labelledby="inquiries-heading">
      <h3 id="inquiries-heading" className="label-caps mb-3">
        Questions for the chair
      </h3>

      {unansweredInquiries.length > 0 ? (
        <div className="mb-4 space-y-3">
          {unansweredInquiries.map((inquiry) => (
            <div key={inquiry.id} className="rounded-lg border border-rule bg-caution-tint p-3">
              <p className="label-caps">{inquiryKind(inquiry.type).label}</p>
              <p className="mt-1 text-sm text-ink">
                <span className="font-medium">{inquiry.askedBy}:</span> &ldquo;{inquiry.question}
                &rdquo;
              </p>
              <div className="mt-2 flex gap-2">
                <label htmlFor={`answer-${inquiry.id}`} className="sr-only">
                  Your answer
                </label>
                <input
                  id={`answer-${inquiry.id}`}
                  type="text"
                  className="input min-w-0 flex-1"
                  placeholder="Enter your answer..."
                  value={answerText[inquiry.id] || ''}
                  onChange={(e) => setAnswerText({ ...answerText, [inquiry.id]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnswerInquiry(inquiry.id)}
                />
                <button
                  type="button"
                  className="btn-primary btn-sm shrink-0"
                  onClick={() => handleAnswerInquiry(inquiry.id)}
                  disabled={!answerText[inquiry.id]?.trim()}
                >
                  Answer
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No questions are waiting.</p>
      )}

      <AnsweredQuestions inquiries={recentAnsweredInquiries} />
    </section>
  );
}

/** Questions the chair has answered, the latest first */
export function AnsweredQuestions({ inquiries }: { inquiries: MeetingState['inquiries'] }) {
  if (inquiries.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="label-caps">Answered</p>
      {inquiries.map((inquiry) => (
        <div key={inquiry.id} className="rounded-lg bg-surface-2 p-3 text-sm">
          <p className="text-xs text-ink-muted">{inquiryKind(inquiry.type).label}</p>
          <p className="text-ink">
            <span className="font-medium">Q:</span> {inquiry.question}
          </p>
          <p className="mt-1 text-ink">
            <span className="font-medium">A:</span> {inquiry.answer}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Answered by {inquiry.answeredBy}</p>
        </div>
      ))}
    </div>
  );
}
