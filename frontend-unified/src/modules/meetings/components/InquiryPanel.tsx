import { useState, useMemo, useCallback } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type {
  MeetingState,
  MeetingAction,
  Member,
  InquiryType,
} from '@robbie-bylawyer/shared/types';

interface InquiryPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
  isChair?: boolean;
}

export function InquiryPanel({ state, dispatch, currentUser, isChair = false }: InquiryPanelProps) {
  const [inquiryType, setInquiryType] = useState<InquiryType>('parliamentary');
  const [question, setQuestion] = useState('');
  const [answerText, setAnswerText] = useState<Record<number, string>>({});

  const handleAskInquiry = useCallback(() => {
    if (!question.trim()) return;

    dispatch({
      type: 'ASK_INQUIRY',
      inquiryType,
      question: question.trim(),
      askedBy: currentUser.name,
      askerId: currentUser.id,
      inquiryId: generateId(),
      timestamp: generateTimestamp(),
    });
    setQuestion('');
  }, [dispatch, inquiryType, question, currentUser.name, currentUser.id]);

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

  const answeredInquiries = useMemo(
    () => state.inquiries.filter((inq) => inq.answer),
    [state.inquiries],
  );

  // Memoize the recent answered inquiries (last 5, reversed for display)
  const recentAnsweredInquiries = useMemo(
    () => answeredInquiries.slice(-5).reverse(),
    [answeredInquiries],
  );

  return (
    <div className="bg-surface rounded-lg p-4 shadow-sm">
      <h3 className="font-semibold mb-3 text-ink flex items-center gap-2">Ask a Question</h3>

      {/* Submit Question Form */}
      {!isChair && (
        <div className="mb-4 p-3 bg-gavel-tint border border-rule rounded-lg">
          <div className="mb-3">
            <p className="text-sm font-medium text-ink mb-2">Question Type</p>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  value="parliamentary"
                  checked={inquiryType === 'parliamentary'}
                  onChange={(e) => setInquiryType(e.target.value as InquiryType)}
                  className="mt-0.5 accent-gavel"
                />
                <div>
                  <div className="font-medium">Parliamentary Inquiry</div>
                  <div className="text-xs text-ink-muted">
                    Ask the chair about rules of procedure, precedence, or what motion is in order
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  value="information"
                  checked={inquiryType === 'information'}
                  onChange={(e) => setInquiryType(e.target.value as InquiryType)}
                  className="mt-0.5 accent-gavel"
                />
                <div>
                  <div className="font-medium">Request for Information</div>
                  <div className="text-xs text-ink-muted">
                    Ask for factual information relevant to the business at hand
                  </div>
                </div>
              </label>
            </div>
          </div>

          <label className="block text-sm font-medium text-ink mb-2">Your Question</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter your question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAskInquiry()}
              className="flex-1 p-2 border rounded-sm text-sm"
            />
            <button
              onClick={handleAskInquiry}
              disabled={!question.trim()}
              className="px-4 py-2 bg-gavel text-paper rounded-sm hover:bg-gavel/90 disabled:bg-rule text-sm font-medium"
            >
              Ask
            </button>
          </div>
          <p className="text-xs text-ink mt-2">
            Per RONR, inquiries do not require a second and can interrupt pending business.
          </p>
        </div>
      )}

      {/* Unanswered Inquiries - Chair View */}
      {isChair && unansweredInquiries.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-ink mb-2">
            Pending Inquiries ({unansweredInquiries.length}):
          </p>
          <div className="space-y-3">
            {unansweredInquiries.map((inquiry) => (
              <div
                key={inquiry.id}
                className="p-3 bg-caution-tint border border-caution/40 rounded-lg"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xs font-semibold text-ink uppercase">
                      {inquiry.type === 'parliamentary'
                        ? 'Parliamentary Inquiry'
                        : 'Request for Information'}
                    </span>
                    <p className="text-sm text-ink mt-1">
                      <span className="font-medium">{inquiry.askedBy}:</span> "{inquiry.question}"
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs font-medium text-ink mb-1">Your Answer</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter your answer..."
                      value={answerText[inquiry.id] || ''}
                      onChange={(e) =>
                        setAnswerText({ ...answerText, [inquiry.id]: e.target.value })
                      }
                      onKeyPress={(e) => e.key === 'Enter' && handleAnswerInquiry(inquiry.id)}
                      className="flex-1 p-2 border rounded-sm text-sm"
                    />
                    <button
                      onClick={() => handleAnswerInquiry(inquiry.id)}
                      disabled={!answerText[inquiry.id]?.trim()}
                      className="px-3 py-2 bg-carried text-paper rounded-sm hover:bg-carried/90 disabled:bg-rule text-xs font-medium"
                    >
                      Answer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answered Inquiries - All Views */}
      {recentAnsweredInquiries.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink mb-2">
            Recent Q&A ({recentAnsweredInquiries.length}):
          </p>
          <div className="space-y-2">
            {recentAnsweredInquiries.map((inquiry) => (
              <div
                key={inquiry.id}
                className="p-2 bg-carried-tint border border-carried/40 rounded-sm text-sm"
              >
                <div className="mb-1">
                  <span className="text-xs font-semibold text-ink uppercase">
                    {inquiry.type === 'parliamentary'
                      ? 'Parliamentary Inquiry'
                      : 'Request for Information'}
                  </span>
                </div>
                <p className="text-ink">
                  <span className="font-medium">Q:</span> {inquiry.question}
                </p>
                <p className="text-ink mt-1">
                  <span className="font-medium">A:</span> {inquiry.answer}
                </p>
                <p className="text-xs text-ink-muted mt-1">Answered by {inquiry.answeredBy}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Inquiries State */}
      {state.inquiries.length === 0 && !isChair && (
        <div className="text-center text-ink-muted text-sm py-4">
          <p>No questions yet. Use the form above to ask the chair a question.</p>
        </div>
      )}

      {isChair && unansweredInquiries.length === 0 && (
        <div className="text-center text-ink-muted text-sm py-4">
          <p>No pending inquiries</p>
        </div>
      )}
    </div>
  );
}
