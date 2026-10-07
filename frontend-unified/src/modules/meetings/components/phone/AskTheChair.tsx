import { useId, useMemo, useState, type FormEvent } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type {
  InquiryType,
  MeetingAction,
  MeetingState,
  Member,
} from '@robbie-bylawyer/shared/types';
import { INQUIRY_KINDS } from '../../utils/inquiryKinds';
import { AnsweredQuestions } from '../InquiryPanel';

interface AskTheChairProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

const KINDS: InquiryType[] = ['parliamentary', 'information'];

/**
 * A question for the chair, from a member or a guest: about the rules, or for information. The
 * chair's answers stay listed below.
 */
export function AskTheChair({ state, dispatch, me }: AskTheChairProps) {
  const headingId = useId();
  const questionId = useId();
  const [kind, setKind] = useState<InquiryType>('parliamentary');
  const [question, setQuestion] = useState('');
  const waiting = state.inquiries.filter((i) => !i.answer && i.askerId === me.id).length;
  const answered = useMemo(
    () =>
      state.inquiries
        .filter((i) => i.answer)
        .slice(-5)
        .reverse(),
    [state.inquiries],
  );

  const ask = (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    dispatch({
      type: 'ASK_INQUIRY',
      inquiryType: kind,
      question: question.trim(),
      askedBy: me.name,
      askerId: me.id,
      inquiryId: generateId(),
      timestamp: generateTimestamp(),
    });
    setQuestion('');
  };

  return (
    <section className="card space-y-3 p-4" aria-labelledby={headingId}>
      <h3 id={headingId} className="label-caps">
        Ask the chair
      </h3>
      <form onSubmit={ask} className="space-y-3">
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Your question is</legend>
          {KINDS.map((option) => (
            <label
              key={option}
              className={`cursor-pointer rounded-lg border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gavel ${kind === option ? 'border-gavel bg-gavel-tint' : 'border-rule'}`}
            >
              <input
                type="radio"
                name={`${headingId}-kind`}
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="sr-only"
              />
              <span className="block font-medium text-ink">{INQUIRY_KINDS[option].label}</span>
              <span className="block text-xs text-ink-muted">{INQUIRY_KINDS[option].hint}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2">
          <label htmlFor={questionId} className="sr-only">
            Your question
          </label>
          <input
            id={questionId}
            className="input min-w-0 flex-1"
            placeholder="Your question"
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn-secondary shrink-0" disabled={!question.trim()}>
            Ask
          </button>
        </div>
      </form>
      {waiting > 0 && (
        <p role="status" className="text-sm text-ink-muted">
          The chair has your question.
        </p>
      )}
      <AnsweredQuestions inquiries={answered} />
    </section>
  );
}
