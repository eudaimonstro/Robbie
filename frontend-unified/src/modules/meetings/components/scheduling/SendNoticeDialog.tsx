import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Printer } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import { HttpError, meetingPackets, type MeetingNotice } from '../../../../api/client';
import { formatDateTime } from '../../../../utils/dates';
import { count as plural } from '../../../../utils/plural';

interface SendNoticeDialogProps {
  /** The meeting's code */
  code: string;
  isOpen: boolean;
  onClose: () => void;
  /** After sending: what to tell the secretary ("Sent to 138; 4 couldn't be delivered.") */
  onSent: (message: string) => void;
  /** The organization's time zone, for when it was last sent */
  timeZone?: string;
}

/** What sending came to, in a sentence */
export function sentMessage(sent: number, failed: number): string {
  const to = `The notice was sent to ${plural(sent, 'person', 'people')}.`;
  return failed > 0 ? `${to} ${plural(failed, 'email')} couldn't be delivered.` : to;
}

/**
 * Send notice: the email as it will go out (to whom, the subject and the text), then Send. A
 * notice sent before says when and by whom, and Send it again sends it once more.
 */
export function SendNoticeDialog({
  code,
  isOpen,
  onClose,
  onSent,
  timeZone,
}: SendNoticeDialogProps) {
  const [notice, setNotice] = useState<MeetingNotice | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // The server said it was sent meanwhile: the next Send confirms sending it again
  const [sentMeanwhile, setSentMeanwhile] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let canceled = false;
    setNotice(null);
    setProblem(null);
    setSentMeanwhile(false);
    meetingPackets
      .notice(code)
      .then((loaded) => {
        if (!canceled) setNotice(loaded);
      })
      .catch((err: unknown) => {
        if (!canceled) setProblem(err instanceof Error ? err.message : "Couldn't load the notice");
      });
    return () => {
      canceled = true;
    };
  }, [code, isOpen]);

  const again = !!notice?.noticeSentAt || sentMeanwhile;
  const full = !!notice && notice.sentToday >= notice.limit;
  const blocked = !notice || !notice.sendable || full;

  const send = async () => {
    setSending(true);
    setProblem(null);
    try {
      const result = await meetingPackets.sendNotice(code, again);
      onSent(sentMessage(result.sent, result.failed));
    } catch (err) {
      if (err instanceof HttpError && err.status === 409 && err.code === 'NOTICE_SENT_BEFORE') {
        setSentMeanwhile(true);
      }
      setProblem(err instanceof Error ? err.message : "Couldn't send the notice");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send the meeting notice"
      size="lg"
      initialFocusRef={cancelRef}
    >
      {!notice ? (
        <p role={problem ? 'alert' : undefined} className="text-sm text-ink-muted">
          {problem ?? 'Loading the notice...'}
        </p>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-muted">To</dt>
            <dd className="text-ink">
              {plural(notice.recipients, 'person', 'people')}: every member with an email, and the
              people added who haven&apos;t signed in yet
            </dd>
            <dt className="text-ink-muted">Subject</dt>
            <dd className="text-ink">{notice.subject}</dd>
          </dl>
          <pre
            aria-label="The email"
            tabIndex={0}
            className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-rule bg-surface-2 p-4 font-sans text-sm leading-relaxed text-ink"
          >
            {notice.text}
          </pre>
          {again && notice.noticeSentAt && (
            <p className="rounded-lg bg-caution-tint px-3 py-2 text-sm text-caution-ink">
              {`The notice was sent on ${formatDateTime(notice.noticeSentAt, timeZone)}${notice.noticeSentBy ? ` by ${notice.noticeSentBy}` : ''}. Sending it again emails everyone again.`}
            </p>
          )}
          {!notice.sendable && notice.reason && (
            <p className="rounded-lg bg-caution-tint px-3 py-2 text-sm text-caution-ink">
              {notice.reason}.
            </p>
          )}
          {notice.sendable && full && (
            <p className="rounded-lg bg-caution-tint px-3 py-2 text-sm text-caution-ink">
              {`Your organization has sent ${notice.limit} notices in the last day, the most it can. Try again tomorrow.`}
            </p>
          )}
          {problem && (
            <p role="alert" className="text-sm text-gavel">
              {problem}
            </p>
          )}
          <p className="text-xs text-ink-muted">{notice.footer}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to={`/meetings/${code}/notice`}
              className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print the notice for posting and mailing
            </Link>
            <div className="flex gap-2">
              <button ref={cancelRef} type="button" className="btn-secondary" onClick={onClose}>
                Not now
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={blocked || sending}
                onClick={() => void send()}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {sending ? 'Sending...' : again ? 'Send it again' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
