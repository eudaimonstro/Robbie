import { useId, useState } from 'react';
import { QrCode } from '../QrCode';
import { joinUrl } from '../../utils/meetingLinks';

interface JoinInfoCardProps {
  code: string;
  qrSize?: number;
}

/** How to join: the code, the link and its QR code, to read out or show on a screen */
export function JoinInfoCard({ code, qrSize = 200 }: JoinInfoCardProps) {
  const link = joinUrl(code);
  const headingId = useId();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => setCopied(true));
  };

  return (
    <section className="card p-5" aria-labelledby={headingId}>
      <h3 id={headingId} className="label-caps mb-4">
        Join
      </h3>
      <div className="flex flex-wrap items-center gap-6">
        <div className="min-w-0 flex-1 space-y-4">
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
