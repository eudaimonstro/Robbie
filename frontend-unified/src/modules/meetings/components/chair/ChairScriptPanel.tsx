import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getChairScript } from '../../utils/chairScriptHelper';

interface ChairScriptPanelProps {
  state: MeetingState;
}

export const ChairScriptPanel = React.memo(function ChairScriptPanel({
  state,
}: ChairScriptPanelProps) {
  const [showScript, setShowScript] = useState(true);

  const script = getChairScript(state);

  if (!script) {
    return null;
  }

  if (!showScript) {
    return (
      <button onClick={() => setShowScript(true)} className="text-gavel text-sm">
        Show script
      </button>
    );
  }

  return (
    <div className="bg-gavel-tint border border-rule rounded-lg p-4" role="note">
      <div className="flex justify-between">
        <div>
          <p className="text-ink font-medium mb-1">Say:</p>
          <p className="text-ink text-lg">{script.text}</p>
          <p className="text-ink-muted text-sm mt-2 italic">{script.note}</p>
        </div>
        <button
          onClick={() => setShowScript(false)}
          className="text-gavel"
          aria-label="Hide script"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
});
