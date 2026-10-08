import { useId, useRef, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingDispatch } from '../../types/socket';
import {
  agendaNamesTheApproval,
  minutesBody,
  minutesHeading,
  minutesItemUnderWay,
} from '../../utils/minutesApproval';

/** The longest corrections the server takes (MAX_CORRECTIONS_LENGTH) */
const MAX_CORRECTIONS = 2000;

/**
 * The approval of the previous minutes while it is the business: the minutes the secretary
 * published, the chair's question, Approve as read and Approve with corrections
 */
export function MinutesApprovalCard({
  state,
  dispatch,
}: {
  state: MeetingState;
  dispatch: MeetingDispatch;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [corrections, setCorrections] = useState('');
  // An approval sent and not refused: a second press would only be refused (approved already),
  // so the buttons wait for the state to say approved, or for the refusal
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const correctionsId = useId();
  if (!minutesItemUnderWay(state)) return null;

  if (state.minutesApproved) {
    const made = state.minutesApproval?.corrections;
    return (
      <section aria-label="Approval of the minutes" className="card p-5">
        <p className="flex items-center gap-2 font-semibold text-carried">
          <CheckCircle className="h-5 w-5" aria-hidden="true" />
          Minutes approved
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {made ? `With corrections: ${made}` : 'As read.'}
        </p>
      </section>
    );
  }

  const minutes = state.minutesFromPreviousMeeting;
  const approve = async (made?: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const approved = await dispatch({
      type: 'APPROVE_MINUTES',
      ...(made ? { corrections: made } : {}),
      timestamp: generateTimestamp(),
    });
    if (!approved) {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (corrections.trim()) void approve(corrections.trim());
  };

  return (
    <section aria-label="Approval of the minutes" className="card space-y-4 p-5">
      <div>
        {/* The Now line may say it already */}
        {!agendaNamesTheApproval(state) && (
          <p className="mb-1 label-caps">Approval of the minutes</p>
        )}
        <p className="font-serif-soft text-title font-semibold text-ink">
          {minutes ? minutesHeading(minutes) : 'No published minutes are before this meeting'}
        </p>
      </div>
      {minutes ? (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-rule bg-surface-2 p-4">
          <div className="document-content text-sm">
            <ReactMarkdown>{minutesBody(minutes)}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          The secretary publishes minutes from the Minutes page. Minutes read from paper can be
          approved here too.
        </p>
      )}
      <p className="text-sm text-ink-muted">Say: "Are there any corrections to the minutes?"</p>
      {correcting ? (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor={correctionsId} className="label">
            Corrections
          </label>
          <textarea
            id={correctionsId}
            className="textarea h-24"
            maxLength={MAX_CORRECTIONS}
            value={corrections}
            onChange={(e) => setCorrections(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={sending || !corrections.trim()}>
              Approve with these corrections
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCorrecting(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={sending}
            onClick={() => void approve()}
          >
            Approve as read
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={sending}
            onClick={() => setCorrecting(true)}
          >
            Approve with corrections
          </button>
        </div>
      )}
    </section>
  );
}
