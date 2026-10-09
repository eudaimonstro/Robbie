import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { HttpError, meetingPackets, type MeetingNotice } from '../../api/client';
import { LoadingPage } from '../../components/ui/LoadingSpinner';
import { PrintShell } from '../documents/components/PrintableDocument';
import { QrCode } from './components/QrCode';
import { normalizeMeetingCode } from './utils/meetingLinks';

/**
 * A meeting's notice to print, for posting in the clubhouse and mailing to owners without email:
 * /meetings/:code/notice (signed in, a secretary). The same content as the emailed notice, with
 * a QR code to the meeting's page and how to take part with a phone.
 */
export default function NoticePrintPage() {
  const { code = '' } = useParams<{ code: string }>();
  const meetingCode = normalizeMeetingCode(code);
  const [params] = useSearchParams();
  const [notice, setNotice] = useState<MeetingNotice | null>(null);
  const [loadError, setLoadError] = useState<'missing' | 'secretary' | 'failed' | null>(null);

  useEffect(() => {
    let canceled = false;
    meetingPackets
      .notice(meetingCode)
      .then((found) => {
        if (!canceled) setNotice(found);
      })
      .catch((err) => {
        if (canceled) return;
        setLoadError(
          err instanceof HttpError && err.status === 404
            ? 'missing'
            : err instanceof HttpError && err.status === 403
              ? 'secretary'
              : 'failed',
        );
      });
    return () => {
      canceled = true;
    };
  }, [meetingCode]);

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-ink">
          {loadError === 'missing'
            ? 'There is no meeting with that code.'
            : loadError === 'secretary'
              ? "The meeting's notice is printed by a secretary."
              : "Couldn't load the notice."}
        </p>
        <Link to="/meetings" className="mt-4 inline-block text-gavel hover:underline">
          Live meetings
        </Link>
      </div>
    );
  }
  if (!notice) return <LoadingPage label="Loading the notice..." />;

  const board = notice.kind === 'board';
  const heading = board ? 'Notice of a meeting of the Board of Directors' : 'Notice of a meeting';
  return (
    <PrintShell
      title={`${heading}: ${notice.title}`}
      backTo="/meetings"
      backLabel="Back to Live meetings"
      autoPrint={params.get('print') === '1'}
    >
      <article className="print-document mx-auto max-w-3xl rounded-xl border border-rule bg-surface px-6 py-10 sm:px-12">
        <div className="print-running-header" aria-hidden="true">
          {`${notice.organization} | ${heading}`}
        </div>
        <p className="label-caps">{notice.organization}</p>
        <h1 className="mt-2 font-serif-soft text-page font-semibold text-ink">{heading}</h1>
        <p className="mt-4 font-serif-soft text-title text-ink">{notice.title}</p>

        <dl className="mt-6 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="label-caps self-baseline">When</dt>
          <dd className="text-lg text-ink">{notice.when ?? 'To be announced'}</dd>
          {notice.location && (
            <>
              <dt className="label-caps self-baseline">Where</dt>
              <dd className="text-lg text-ink">{notice.location}</dd>
            </>
          )}
        </dl>

        {board && (
          <p className="mt-4 text-ink">
            This is a meeting of the board: the directors vote. Members may attend and observe.
          </p>
        )}

        {notice.agenda.length > 0 && (
          <section className="mt-8">
            <h2 className="card-title">Agenda</h2>
            <ol className="mt-3 list-decimal space-y-1 pl-6 text-ink">
              {notice.agenda.map((item, index) => (
                <li key={index}>
                  {item.title}
                  {item.attachments.length > 0 && (
                    <span className="text-ink-muted">{` (attached: ${item.attachments.join(', ')})`}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
        {notice.attachments.length > 0 && (
          <p className="mt-4 text-ink">
            <span className="font-semibold">Documents: </span>
            {notice.attachments.join(', ')}
          </p>
        )}

        <section
          aria-labelledby="take-part"
          className="mt-8 break-inside-avoid rounded-xl border-2 border-ink p-5 sm:flex sm:items-start sm:gap-6"
        >
          <QrCode
            value={notice.link}
            label={`QR code for the meeting's page, ${notice.link}`}
            size={168}
            className="mx-auto shrink-0 sm:mx-0"
          />
          <div className="mt-4 min-w-0 sm:mt-0">
            <h2 id="take-part" className="card-title flex items-center gap-2">
              <Smartphone className="h-5 w-5 shrink-0" aria-hidden="true" />
              How to take part with your phone
            </h2>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink">
              <li>Point your phone&apos;s camera at the code, or go to the address below.</li>
              <li>
                Sign in with your email address. Robbie emails you a{' '}
                <span className="whitespace-nowrap">6-digit</span> code: there is no password.
              </li>
              <li>
                {board
                  ? 'Follow the meeting on your phone as it happens.'
                  : 'At the meeting, follow along and vote on your phone.'}
              </li>
            </ol>
            <p className="mt-3 break-all font-semibold text-ink">{notice.link}</p>
            <p className="mt-1 text-sm text-ink-muted">
              Meeting code <span className="meeting-code text-ink">{notice.code}</span>. Sign in
              before the meeting so your phone is ready.
            </p>
            {!board && (
              <p className="mt-2 text-sm text-ink">
                No phone? You still count: the chair will count you in the room.
              </p>
            )}
          </div>
        </section>

        <p className="mt-8 border-t border-rule pt-4 text-sm text-ink-muted">{notice.footer}</p>
      </article>
    </PrintShell>
  );
}
