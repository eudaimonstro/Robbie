import React, { useState, useCallback } from 'react';
import { CheckCircle } from 'lucide-react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { DraggableAgendaList } from '../DraggableAgendaList';

interface AgendaPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The presiding officer, who moves an agenda item to a vote */
  presiding?: Member;
}

export const AgendaPanel = React.memo(function AgendaPanel({
  state,
  dispatch,
  presiding,
}: AgendaPanelProps) {
  const [newAgendaItem, setNewAgendaItem] = useState('');

  const handleAddAgendaItem = useCallback(() => {
    dispatch({ type: 'ADD_AGENDA_ITEM', title: newAgendaItem, itemId: generateId() });
    setNewAgendaItem('');
  }, [newAgendaItem, dispatch]);

  const handlePutToVote = useCallback(() => {
    if (presiding && state.currentAgendaItem) {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: `Approve: ${state.currentAgendaItem.title}`,
        mover: 'Chair',
        moverId: presiding.id,
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
    }
  }, [presiding, state.currentAgendaItem, dispatch]);

  // Show adoption panel if not adopted and no motion pending
  if (state.meetingActive && !state.agendaAdopted && !state.currentMotion && !state.pendingSecond) {
    return (
      <section
        className="bg-surface rounded-lg p-4 shadow-sm"
        aria-labelledby="agenda-adoption-heading"
      >
        <h3 id="agenda-adoption-heading" className="font-semibold mb-3 text-ink">
          {state.agendaObjection ? 'Agenda (Objection)' : 'Adopt Agenda'}
        </h3>
        <p className="text-sm text-ink-muted mb-3">Drag items to reorder before adoption.</p>

        <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={false} />

        <div className="flex gap-2 my-3">
          <input
            type="text"
            value={newAgendaItem}
            onChange={(e) => setNewAgendaItem(e.target.value)}
            placeholder="Add item..."
            className="flex-1 p-2 border rounded-lg text-sm"
            aria-label="New agenda item"
          />
          <button
            onClick={handleAddAgendaItem}
            disabled={!newAgendaItem.trim()}
            className="bg-rule text-ink px-4 rounded-lg disabled:opacity-50 text-sm"
          >
            Add
          </button>
        </div>

        {!state.agendaObjection ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => dispatch({ type: 'ADOPT_AGENDA', timestamp: generateTimestamp() })}
              className="bg-carried text-paper py-3 rounded-lg font-medium"
            >
              No Objection
            </button>
            <button
              onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
              className="bg-gavel text-paper py-3 rounded-lg font-medium"
            >
              Objection Raised
            </button>
          </div>
        ) : (
          <div
            className="bg-caution-tint border border-caution/40 rounded-lg p-3 text-ink text-sm"
            role="alert"
          >
            <strong>Objection noted.</strong> A member must move to adopt or amend the agenda.
          </div>
        )}
      </section>
    );
  }

  // Show current agenda item panel
  if (
    state.agendaAdopted &&
    state.currentAgendaItem &&
    !state.currentMotion &&
    !state.pendingSecond
  ) {
    return (
      <section
        className="bg-surface rounded-lg p-4 shadow-sm"
        aria-labelledby="current-item-heading"
      >
        <h3 id="current-item-heading" className="font-semibold mb-2 text-ink">
          Current Item
        </h3>
        <div className="bg-gavel-tint border border-rule rounded-lg p-3 mb-3 font-medium text-ink">
          {state.currentAgendaItem.title}
        </div>
        <div className="space-y-2">
          <button
            onClick={handlePutToVote}
            className="w-full bg-gavel text-paper py-2 rounded-lg hover:bg-gavel/90"
          >
            Put to Vote
          </button>
          <button
            onClick={() =>
              dispatch({
                type: 'COMPLETE_AGENDA_ITEM',
                id: state.currentAgendaItem!.id,
                timestamp: generateTimestamp(),
              })
            }
            className="w-full bg-carried text-paper py-2 rounded-lg hover:bg-carried/90"
          >
            Mark Complete (No Vote)
          </button>
        </div>
      </section>
    );
  }

  // Show agenda list panel (after adoption, no current item)
  if (
    state.agendaAdopted &&
    !state.currentAgendaItem &&
    !state.currentMotion &&
    !state.pendingSecond
  ) {
    return (
      <section
        className="bg-surface rounded-lg p-4 shadow-sm"
        aria-labelledby="agenda-list-heading"
      >
        <h3 id="agenda-list-heading" className="font-semibold mb-3 text-ink">
          Agenda
        </h3>
        <ul className="space-y-2" role="list">
          {state.agenda.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                item.status === 'completed' ? 'bg-carried-tint' : 'bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-2">
                {item.status === 'completed' && (
                  <CheckCircle size={16} className="text-carried" aria-hidden="true" />
                )}
                <span className={item.status === 'completed' ? 'line-through text-ink-muted' : ''}>
                  {i + 1}. {item.title}
                </span>
              </div>
              {item.status === 'pending' && (
                <button
                  onClick={() =>
                    dispatch({
                      type: 'CALL_AGENDA_ITEM',
                      id: item.id,
                      timestamp: generateTimestamp(),
                    })
                  }
                  className="bg-gavel text-paper px-3 py-1 rounded-sm text-sm"
                >
                  Call
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return null;
});
