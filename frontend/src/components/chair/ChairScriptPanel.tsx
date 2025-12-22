import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { MeetingState } from '@robbie/shared/types';
import { getChairScript } from '../../utils/chairScriptHelper';

interface ChairScriptPanelProps {
  state: MeetingState;
}

export const ChairScriptPanel = React.memo(function ChairScriptPanel({
  state
}: ChairScriptPanelProps) {
  const [showScript, setShowScript] = useState(true);

  const script = getChairScript(state);

  if (!script) {
    return null;
  }

  if (!showScript) {
    return (
      <button
        onClick={() => setShowScript(true)}
        className="text-indigo-600 text-sm"
      >
        Show script
      </button>
    );
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4" role="note">
      <div className="flex justify-between">
        <div>
          <p className="text-indigo-800 font-medium mb-1">Say:</p>
          <p className="text-indigo-900 text-lg">{script.text}</p>
          <p className="text-indigo-600 text-sm mt-2 italic">{script.note}</p>
        </div>
        <button
          onClick={() => setShowScript(false)}
          className="text-indigo-400"
          aria-label="Hide script"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
});
