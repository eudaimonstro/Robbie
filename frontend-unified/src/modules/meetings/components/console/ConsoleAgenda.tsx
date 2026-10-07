import { useId, useState, type FormEvent } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { DraggableAgendaList } from '../DraggableAgendaList';

interface ConsoleAgendaProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** An item was called: the console brings the Now column into view */
  onCall?: () => void;
}

/**
 * The agenda in the console's side column: reordered and added to before it is adopted, then
 * each item called and completed in turn
 */
export function ConsoleAgenda({ state, dispatch, onCall }: ConsoleAgendaProps) {
  const newItemId = useId();
  const [newItem, setNewItem] = useState('');
  // Items are called and completed between questions, not during one, and not once the meeting
  // is adjourned
  const busy =
    !!state.currentMotion ||
    !!state.pendingSecond ||
    state.votingOpen ||
    state.meetingStage === 'adjourned';

  const addItem = (e: FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    dispatch({ type: 'ADD_AGENDA_ITEM', title: newItem.trim(), itemId: generateId() });
    setNewItem('');
  };

  return (
    <section className="card space-y-3 p-5" aria-labelledby="agenda-heading">
      <h3 id="agenda-heading" className="label-caps">
        Agenda
      </h3>
      {!state.agendaAdopted && state.meetingStage !== 'adjourned' ? (
        <>
          <p className="text-sm text-ink-muted">Drag to reorder before the agenda is adopted.</p>
          <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={false} />
          <form onSubmit={addItem} className="flex gap-2">
            <label htmlFor={newItemId} className="sr-only">
              New agenda item
            </label>
            <input
              id={newItemId}
              className="input"
              placeholder="Add an item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
            />
            <button type="submit" className="btn-secondary btn-sm" disabled={!newItem.trim()}>
              Add
            </button>
          </form>
        </>
      ) : state.agenda.length === 0 ? (
        <p className="text-sm text-ink-muted">The agenda is empty.</p>
      ) : (
        <ol className="space-y-1">
          {state.agenda.map((item, index) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${item.status === 'active' ? 'border-l-2 border-gavel bg-gavel-tint' : ''}`}
            >
              <span
                className={`text-sm ${item.status === 'completed' ? 'text-ink-muted line-through' : 'text-ink'}`}
              >
                {item.status === 'active' && <span className="sr-only">Current item: </span>}
                {index + 1}. {item.title}
              </span>
              {item.status === 'pending' && !state.currentAgendaItem && !busy && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  aria-label={`Call ${item.title}`}
                  onClick={() => {
                    dispatch({
                      type: 'CALL_AGENDA_ITEM',
                      id: item.id,
                      timestamp: generateTimestamp(),
                    });
                    onCall?.();
                  }}
                >
                  Call
                </button>
              )}
              {item.status === 'active' && !busy && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  aria-label={`Complete ${item.title}`}
                  onClick={() =>
                    dispatch({
                      type: 'COMPLETE_AGENDA_ITEM',
                      id: item.id,
                      timestamp: generateTimestamp(),
                    })
                  }
                >
                  Complete
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
