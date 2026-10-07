import { useState } from 'react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getChairScript } from '../../utils/chairScriptHelper';

/** What the chair says now, as one muted line under the question; it can be hidden */
export function ChairScriptLine({ state }: { state: MeetingState }) {
  const [hidden, setHidden] = useState(false);
  const script = getChairScript(state);
  if (!script) return null;

  if (hidden) {
    return (
      <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => setHidden(false)}>
        Show the script
      </button>
    );
  }
  return (
    <div role="note" className="mt-3 flex items-start gap-3 text-sm text-ink-muted">
      <p className="flex-1">
        <span className="font-semibold">Say: </span>
        {script.text}
      </p>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setHidden(true)}>
        Hide the script
      </button>
    </div>
  );
}
