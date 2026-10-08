import { useEffect, useState } from 'react';

interface QrCodeProps {
  /** What the code holds: a meeting's join link (see joinUrl) */
  value: string;
  /** What a screen reader says for it */
  label: string;
  /** Its size on screen, in CSS pixels */
  size?: number;
  className?: string;
}

/**
 * A QR code drawn in the browser as an SVG image, sharp at any size from a phone to a 4K display:
 * ink modules on a white tile with the standard 4-module quiet zone, which phones read best
 * (docs/design-brief.md: "QR on a white tile")
 */
export function QrCode({ value, label, size = 200, className = '' }: QrCodeProps) {
  const [drawn, setDrawn] = useState<{ value: string; src: string } | null>(null);

  useEffect(() => {
    let canceled = false;
    // The QR library loads with the first code drawn (the console's join card, the display), so
    // a phone never downloads it
    import('qrcode')
      .then((module) => {
        // A CommonJS package: bundled, its functions are on the default export
        const qr = 'default' in module && module.default ? module.default : module;
        return qr.toString(value, {
          type: 'svg',
          margin: 4,
          errorCorrectionLevel: 'M',
          color: { dark: '#15130f', light: '#ffffff' },
        });
      })
      .then((svg) => {
        if (!canceled) {
          setDrawn({ value, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
        }
      })
      .catch(() => {
        // A link too long for a QR code: the link itself is shown beside it
      });
    return () => {
      canceled = true;
    };
  }, [value]);

  if (drawn?.value !== value) {
    return (
      <div
        role="img"
        aria-label={label}
        className={`rounded-lg bg-surface-2 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={drawn.src}
      alt={label}
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
    />
  );
}
