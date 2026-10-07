import React, { useState } from 'react';
import { HelpCircle, X, CheckCircle, XCircle } from 'lucide-react';
import type { HelpTooltipProps } from '../types';

export const HelpTooltip = React.memo(function HelpTooltip({ motion }: HelpTooltipProps) {
  const [show, setShow] = useState<boolean>(false);

  return (
    <div className="relative">
      <button onClick={() => setShow(!show)} className="text-ink-muted hover:text-ink">
        <HelpCircle size={16} />
      </button>
      {show && (
        <div className="absolute z-50 left-0 sm:left-auto sm:right-0 top-6 w-[calc(100vw-2rem)] sm:w-72 max-w-sm bg-surface border rounded-lg shadow-xl p-4 text-sm">
          <div className="flex justify-between mb-2">
            <span className="font-semibold">{motion.name}</span>
            <button onClick={() => setShow(false)} className="text-ink-muted hover:text-ink">
              <X size={14} />
            </button>
          </div>
          <p className="text-ink-muted mb-2">{motion.help}</p>
          <p className="text-ink-muted italic text-xs mb-2">"{motion.phrase}"</p>
          <p className="text-xs text-ink-muted">
            <strong>When to use:</strong> {motion.whenToUse}
          </p>
          <div className="grid grid-cols-2 gap-1 mt-2 text-xs border-t pt-2">
            <span className={motion.needsSecond ? 'text-carried' : 'text-ink-muted'}>
              {motion.needsSecond ? (
                <CheckCircle size={12} className="inline mr-1" />
              ) : (
                <XCircle size={12} className="inline mr-1" />
              )}
              Second
            </span>
            <span className={motion.debatable ? 'text-carried' : 'text-ink-muted'}>
              {motion.debatable ? (
                <CheckCircle size={12} className="inline mr-1" />
              ) : (
                <XCircle size={12} className="inline mr-1" />
              )}
              Debatable
            </span>
            <span className={motion.amendable ? 'text-carried' : 'text-ink-muted'}>
              {motion.amendable ? (
                <CheckCircle size={12} className="inline mr-1" />
              ) : (
                <XCircle size={12} className="inline mr-1" />
              )}
              Amendable
            </span>
            <span className="text-ink">
              Vote: {motion.vote === '2/3' ? '⅔' : motion.vote === 'majority' ? 'Majority' : 'None'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
