import React, { useState, useCallback, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';
import { DraggableAgendaList } from '../DraggableAgendaList';

interface AgendaPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const AgendaPanel = React.memo(function AgendaPanel({ state, dispatch }: AgendaPanelProps) {
  const [newAgendaItem, setNewAgendaItem] = useState('');

  const handleAddAgendaItem = useCallback(() => {
    dispatch({ type: 'ADD_AGENDA_ITEM', title: newAgendaItem, itemId: generateId() });
    setNewAgendaItem('');
  }, [newAgendaItem, dispatch]);

  const chair = useMemo(() => state.members.find((m) => m.role === 'chair'), [state.members]);

  const handlePutToVote = useCallback(() => {
    if (chair && state.currentAgendaItem) {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: `Approve: ${state.currentAgendaItem.title}`,
        mover: 'Chair',
        moverId: chair.id,
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
    }
  }, [chair, state.currentAgendaItem, dispatch]);

  // Show adoption panel if not adopted and no motion pending
  if (state.meetingActive && !state.agendaAdopted && !state.currentMotion && !state.pendingSecond) {
    return (
      <section
        className="bg-white rounded-lg p-4 shadow-sm"
        aria-labelledby="agenda-adoption-heading"
      >
        <h3 id="agenda-adoption-heading" className="font-semibold mb-3 text-gray-800">
          {state.agendaObjection ? 'Agenda (Objection)' : 'Adopt Agenda'}
        </h3>
        <p className="text-sm text-gray-600 mb-3">Drag items to reorder before adoption.</p>

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
            className="bg-gray-200 text-gray-700 px-4 rounded-lg disabled:opacity-50 text-sm"
          >
            Add
          </button>
        </div>

        {!state.agendaObjection ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => dispatch({ type: 'ADOPT_AGENDA', timestamp: generateTimestamp() })}
              className="bg-green-500 text-white py-3 rounded-lg font-medium"
            >
              No Objection
            </button>
            <button
              onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
              className="bg-amber-500 text-white py-3 rounded-lg font-medium"
            >
              Objection Raised
            </button>
          </div>
        ) : (
          <div
            className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm"
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
      <section className="bg-white rounded-lg p-4 shadow-sm" aria-labelledby="current-item-heading">
        <h3 id="current-item-heading" className="font-semibold mb-2 text-gray-800">
          Current Item
        </h3>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3 font-medium text-indigo-900">
          {state.currentAgendaItem.title}
        </div>
        <div className="space-y-2">
          <button
            onClick={handlePutToVote}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
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
            className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
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
      <section className="bg-white rounded-lg p-4 shadow-sm" aria-labelledby="agenda-list-heading">
        <h3 id="agenda-list-heading" className="font-semibold mb-3 text-gray-800">
          Agenda
        </h3>
        <ul className="space-y-2" role="list">
          {state.agenda.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                item.status === 'completed' ? 'bg-green-50' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {item.status === 'completed' && (
                  <CheckCircle size={16} className="text-green-600" aria-hidden="true" />
                )}
                <span className={item.status === 'completed' ? 'line-through text-gray-400' : ''}>
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
                  className="bg-indigo-500 text-white px-3 py-1 rounded-sm text-sm"
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
