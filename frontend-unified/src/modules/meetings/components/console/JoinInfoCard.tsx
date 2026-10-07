import { useId, useState } from 'react';
import { QrCode } from '../QrCode';
import { joinUrl } from '../../utils/meetingLinks';

interface JoinInfoCardProps {
  code: string;
  qrSize?: number;
  /**
   * One line (the code, Copy the link and Show QR), once the meeting is called to order: the
   * full card is for the time before it, when everyone is joining
   */
  compact?: boolean;
}

/** How to join: the code, the link and its QR code, to read out or show on a screen */
export function JoinInfoCard({ code, qrSize = 200, compact = false }: JoinInfoCardProps) {
  const link = joinUrl(code);
  const headingId = useId();
  const qrId = useId();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => setCopied(true));
  };

  if (compact) {
    return (
      <section className="card px-4 py-2" aria-labelledby={headingId}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h3 id={headingId} className="label-caps">
            Join
          </h3>
          <p data-testid="meeting-code" className="meeting-code text-lg text-ink">
            {code}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="btn-ghost btn-sm" onClick={copy}>
              {copied ? 'Copied' : 'Copy the link'}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-expanded={showQr}
              aria-controls={qrId}
              onClick={() => setShowQr((open) => !open)}
            >
              {showQr ? 'Hide QR' : 'Show QR'}
            </button>
          </div>
        </div>
        {showQr && (
          <div id={qrId} className="flex flex-col items-center gap-2 pt-3 pb-2">
            <QrCode value={link} label={`QR code for ${link}`} size={qrSize} />
            <p className="break-all text-sm text-ink-muted">{link}</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card p-5" aria-labelledby={headingId}>
      <h3 id={headingId} className="label-caps mb-4">
        Join
      </h3>
      <div className="flex flex-wrap items-center gap-6">
        {/* The text keeps room for the link: on a narrow screen the QR code goes below it */}
        <div className="min-w-48 flex-1 space-y-4">
          <div>
            <p className="text-sm text-ink-muted">Meeting code</p>
            <p data-testid="meeting-code" className="meeting-code text-page text-ink">
              {code}
            </p>
          </div>
          <div>
            <p className="text-sm text-ink-muted">Link</p>
            <p className="break-all text-ink">{link}</p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy the link'}
          </button>
        </div>
        <QrCode value={link} label={`QR code for ${link}`} size={qrSize} />
      </div>
    </section>
  );
}
