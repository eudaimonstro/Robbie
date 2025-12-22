import React, { useState, useCallback, useMemo } from 'react';
import { Gavel, Hand, X, CheckCircle, ChevronRight, UserCheck } from 'lucide-react';
import { generateId, generateMeetingCode, generateTimestamp, calculateTimerEnd } from '@robbie/shared/utils';
import { DISPLAYABLE_STAGES, isLastActiveStage } from '@robbie/shared/constants';
import type { ChairViewProps, VotingMethod } from '../types';
import { MotionCard } from '../components/MotionCard';
import { DraggableAgendaList } from '../components/DraggableAgendaList';
import { CountdownTimer } from '../components/CountdownTimer';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { NominationsPanel } from '../components/NominationsPanel';
import { ElectionPanel } from '../components/ElectionPanel';
import { InquiryPanel } from '../components/InquiryPanel';
import { QuorumWarning } from '../components/QuorumWarning';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { useQuorumStatus } from '../hooks/useQuorumStatus';
import { getChairScript } from '../utils/chairScriptHelper';

export function ChairView({ state, dispatch }: ChairViewProps) {
  const [showScript, setShowScript] = useState(true);
  const [newAgendaItem, setNewAgendaItem] = useState("");
  const [showTransferConfirm, setShowTransferConfirm] = useState<number | null>(null);
  const [speakerTimeExpired, setSpeakerTimeExpired] = useState(false);
  const [voteTimeExpired, setVoteTimeExpired] = useState(false);

  // Use custom hook for sorted speaker queue with alternation
  const sortedQueue = useSortedSpeakerQueue(state.speakerQueue, state.currentMotion, state.lastSpeakerStance, state);

  // Use custom hook for quorum status
  const { presentCount, hasQuorum } = useQuorumStatus(state.members, state.quorum);

  // Memoize add agenda item callback
  const handleAddAgendaItem = useCallback(() => {
    dispatch({ type: 'ADD_AGENDA_ITEM', title: newAgendaItem, itemId: generateId() });
    setNewAgendaItem("");
  }, [newAgendaItem, dispatch]);

  // Memoize put to vote callback
  const handlePutToVote = useCallback(() => {
    const chair = state.members.find(m => m.role === 'chair');
    if (chair) {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: `Approve: ${state.currentAgendaItem?.title}`,
        mover: 'Chair',
        moverId: chair.id,
        motionId: generateId(),
        timestamp: generateTimestamp()
      });
    }
  }, [state.members, state.currentAgendaItem, dispatch]);

  // Get chair script based on current meeting state
  const script = getChairScript(state);

  // Get chair member
  const chair = state.members.find(m => m.role === 'chair');

  // Memoize objection alert data to avoid IIFE in render
  const recentObjection = useMemo(() => {
    const lastLog = state.meetingLog[state.meetingLog.length - 1];
    if (lastLog && lastLog.message.includes('objects')) {
      return lastLog;
    }
    return null;
  }, [state.meetingLog]);

  // Memoize voting panel computed values to avoid IIFE in render
  const votingData = useMemo(() => {
    if (!state.votingOpen) return null;

    const chairHasVoted = chair && state.voters.includes(chair.id);
    const { yea, nay } = state.votes;
    const total = yea + nay;
    const threshold = state.currentMotion?.vote === "2/3" ? total * 2/3 : total / 2;
    const currentlyPassing = yea > threshold;
    const isTied = yea === nay;

    // Chair can vote to break tie or create tie
    const canVoteToBreakTie = isTied && !chairHasVoted;
    const canVoteToCreateTie = !isTied && yea === nay + 1 && !chairHasVoted;

    return {
      chairHasVoted,
      yea,
      nay,
      currentlyPassing,
      isTied,
      canVoteToBreakTie,
      canVoteToCreateTie
    };
  }, [state.votingOpen, state.voters, state.votes, state.currentMotion?.vote, chair]);

  // Get non-chair members for transfer
  const transferableMember = useMemo(() => {
    return state.members.filter(m => m.role !== 'chair');
  }, [state.members]);

  const handleTransferChair = useCallback((targetMemberId: number) => {
    dispatch({
      type: 'SET_MEMBER_ROLE',
      targetMemberId,
      newRole: 'chair',
      timestamp: generateTimestamp()
    });
    setShowTransferConfirm(null);
  }, [dispatch]);

  // Reset speaker time expired state when speaker changes
  const recognizedSpeakerId = state.recognizedSpeaker?.id;
  React.useEffect(() => {
    setSpeakerTimeExpired(false);
  }, [recognizedSpeakerId]);

  // Callback when speaker time expires
  const handleSpeakerTimeExpired = useCallback(() => {
    setSpeakerTimeExpired(true);
    // Auto-yield if enabled
    if (state.autoYieldOnTimeExpired && state.recognizedSpeaker) {
      dispatch({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() });
    }
  }, [state.autoYieldOnTimeExpired, state.recognizedSpeaker, dispatch]);

  // Reset vote time expired state when voting closes
  React.useEffect(() => {
    if (!state.votingOpen) {
      setVoteTimeExpired(false);
    }
  }, [state.votingOpen]);

  // Callback when vote time expires
  const handleVoteTimeExpired = useCallback(() => {
    setVoteTimeExpired(true);
  }, []);

  return (
    <div className="space-y-4">
      <ActiveSuspensionsBanner state={state} currentUser={chair} dispatch={dispatch} />
      {state.meetingActive && (
        <QuorumWarning presentCount={presentCount} quorum={state.quorum} hasQuorum={hasQuorum} />
      )}

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Gavel size={18}/> Meeting Control</h3>
        {!state.meetingActive ? (
          <button
            onClick={() => dispatch({ type: 'START_MEETING', meetingCode: generateMeetingCode(), timestamp: generateTimestamp() })}
            className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 font-medium"
          >
            Call Meeting to Order
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-green-700 font-medium">Meeting in Progress</span>
              <span className="text-green-600 font-mono">{state.meetingCode}</span>
            </div>
            <button
              onClick={() => dispatch({ type: 'END_MEETING', timestamp: generateTimestamp() })}
              className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600"
            >
              Adjourn
            </button>

            {/* Chair Transfer */}
            {transferableMember.length > 0 && (
              <div className="border-t pt-3 mt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <UserCheck size={16} />
                  Transfer Chair Role
                </h4>
                <div className="space-y-2">
                  {transferableMember.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm">{member.name}</span>
                      {showTransferConfirm === member.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleTransferChair(member.id)}
                            className="bg-purple-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-purple-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setShowTransferConfirm(null)}
                            className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-medium hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowTransferConfirm(member.id)}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          Transfer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  You will become a regular member after transferring.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {state.meetingActive && state.meetingStage !== 'adjourned' && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Order of Business</h3>
          <div className="space-y-2">
            {DISPLAYABLE_STAGES.map((item) => (
              <div
                key={item.stage}
                className={`flex items-center justify-between p-2 rounded ${
                  state.meetingStage === item.stage
                    ? 'bg-indigo-100 border-2 border-indigo-300'
                    : 'bg-gray-50'
                }`}
              >
                <span className={`flex items-center gap-2 ${state.meetingStage === item.stage ? 'font-semibold text-indigo-900' : 'text-gray-600'}`}>
                  <span>{item.icon}</span>
                  {item.label}
                </span>
                {state.meetingStage === item.stage && (
                  <ChevronRight size={18} className="text-indigo-600"/>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => dispatch({ type: 'ADVANCE_MEETING_STAGE', timestamp: generateTimestamp() })}
            className="w-full mt-3 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium"
            disabled={isLastActiveStage(state.meetingStage)}
          >
            Proceed to Next Stage
          </button>
        </div>
      )}

      {state.meetingStage === 'minutes-approval' && !state.minutesApproved && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">📝 Minutes from Previous Meeting</h3>
          <div className="bg-gray-50 rounded-lg p-4 mb-3 max-h-64 overflow-y-auto">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{state.minutesFromPreviousMeeting}</pre>
          </div>
          <p className="text-sm text-gray-600 mb-3">Say: "Are there any corrections to the minutes?"</p>
          <button
            onClick={() => dispatch({ type: 'APPROVE_MINUTES', timestamp: generateTimestamp() })}
            className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 font-medium"
          >
            Approve Minutes (No Corrections)
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">If corrections are needed, they should be made before approval</p>
        </div>
      )}

      {state.meetingStage === 'minutes-approval' && state.minutesApproved && (
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="flex items-center gap-2 text-green-700 mb-2">
            <CheckCircle size={20}/>
            <span className="font-semibold">Minutes Approved</span>
          </div>
          <p className="text-sm text-gray-600">Minutes from the previous meeting have been approved. Click "Proceed to Next Stage" to continue.</p>
        </div>
      )}

      {state.meetingStage === 'reports' && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">📊 Committee Reports</h3>
          {state.committeeReports.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No committee reports scheduled</p>
          ) : (
            <div className="space-y-3">
              {state.committeeReports.map((report) => (
                <div
                  key={report.id}
                  className={`border rounded-lg p-4 ${
                    report.presented
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">{report.committee}</h4>
                      <p className="text-sm text-gray-600">Presenter: {report.presenter}</p>
                    </div>
                    {report.presented && (
                      <CheckCircle size={18} className="text-green-600"/>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{report.summary}</p>
                  {report.recommendations && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                      <p className="text-xs font-semibold text-amber-800 mb-1">Recommendations:</p>
                      <p className="text-xs text-amber-900">{report.recommendations}</p>
                    </div>
                  )}
                  {!report.presented && (
                    <button
                      onClick={() => dispatch({ type: 'PRESENT_COMMITTEE_REPORT', reportId: report.id, timestamp: generateTimestamp() })}
                      className="w-full mt-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
                    >
                      Present Report
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3 text-center">
            After all reports, click "Proceed to Next Stage"
          </p>
        </div>
      )}

      {script && showScript && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex justify-between">
            <div>
              <p className="text-indigo-800 font-medium mb-1">Say:</p>
              <p className="text-indigo-900 text-lg">{script.text}</p>
              <p className="text-indigo-600 text-sm mt-2 italic">{script.note}</p>
            </div>
            <button onClick={() => setShowScript(false)} className="text-indigo-400"><X size={18}/></button>
          </div>
        </div>
      )}
      {!showScript && <button onClick={() => setShowScript(true)} className="text-indigo-600 text-sm">Show script</button>}

      {state.meetingActive && !state.agendaAdopted && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">{state.agendaObjection ? "Agenda (Objection)" : "Adopt Agenda"}</h3>
          <p className="text-sm text-gray-600 mb-3">Drag items to reorder before adoption.</p>
          <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={false}/>
          <div className="flex gap-2 my-3">
            <input type="text" value={newAgendaItem} onChange={(e) => setNewAgendaItem(e.target.value)} placeholder="Add item..." className="flex-1 p-2 border rounded-lg text-sm"/>
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
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
              <strong>Objection noted.</strong> A member must move to adopt or amend the agenda.
            </div>
          )}
        </div>
      )}

      {state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2 text-amber-700">Awaiting Second</h3>
          <MotionCard motion={state.pendingSecond}/>
          <button
            onClick={() => dispatch({ type: 'DECLINE_SECOND', timestamp: generateTimestamp() })}
            className="mt-3 w-full bg-gray-200 text-gray-700 py-2 rounded-lg"
          >
            Declare "No Second"
          </button>
        </div>
      )}

      {state.currentMotion && !state.votingOpen && !state.pendingSecond && !state.unanimousConsentPending && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Pending Motion</h3>

          {/* Show objection alert if recent log entry indicates objection */}
          {recentObjection && (
            <div className="mb-3 p-3 bg-amber-50 border-2 border-amber-300 rounded-lg">
              <p className="text-amber-800 font-semibold mb-1">⚠️ Objection Raised</p>
              <p className="text-amber-700 text-sm">{recentObjection.message}</p>
              <p className="text-amber-600 text-xs mt-2">Motion requires debate and/or formal vote.</p>
            </div>
          )}

          <MotionCard motion={state.currentMotion}/>

          {/* Special notice for Appeal */}
          {state.currentMotion.type === 'appeal' && state.lastChairRuling && (
            <div className="mt-3 p-4 bg-purple-50 border-2 border-purple-300 rounded-lg">
              <p className="text-purple-800 font-semibold mb-2">⚖️ Appeal of Chair's Ruling</p>
              <p className="text-purple-700 text-sm mb-1">
                <strong>Ruling being appealed:</strong> "{state.lastChairRuling.ruling}"
              </p>
              <p className="text-purple-600 text-xs">
                Vote YEA to sustain the chair's decision, NAY to overturn it. Majority sustains.
              </p>
            </div>
          )}

          {/* Motions with vote: 'none' don't require voting - chair makes a ruling */}
          {state.currentMotion.vote === 'none' ? (
            <div className="mt-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-3">
                <p className="text-blue-800 font-medium mb-2">⚖️ Chair Ruling Required</p>
                <p className="text-blue-700 text-sm">
                  {state.currentMotion.type === 'pointOrder' && 'Rule on whether the point of order is valid.'}
                  {state.currentMotion.type === 'questionPrivilege' && 'Determine if this is a legitimate question of privilege.'}
                  {state.currentMotion.type === 'pointInfo' && 'Provide or allow response to the inquiry.'}
                  {state.currentMotion.type === 'withdrawMotion' && 'Allow or deny the request to withdraw.'}
                </p>
              </div>

              {state.currentMotion.type === 'pointOrder' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => dispatch({ type: 'CHAIR_RULING', ruling: 'sustain', timestamp: generateTimestamp() })}
                    className="bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
                  >
                    Sustain Point
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'CHAIR_RULING', ruling: 'overrule', timestamp: generateTimestamp() })}
                    className="bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700"
                  >
                    Overrule Point
                  </button>
                </div>
              )}

              {(state.currentMotion.type === 'questionPrivilege' || state.currentMotion.type === 'withdrawMotion') && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => dispatch({ type: 'CHAIR_RULING', ruling: 'allow', timestamp: generateTimestamp() })}
                    className="bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
                  >
                    Allow Request
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'CHAIR_RULING', ruling: 'deny', timestamp: generateTimestamp() })}
                    className="bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700"
                  >
                    Deny Request
                  </button>
                </div>
              )}

              {state.currentMotion.type === 'pointInfo' && (
                <button
                  onClick={() => dispatch({ type: 'CHAIR_RULING', ruling: 'allow', timestamp: generateTimestamp() })}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                >
                  Acknowledge & Respond
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Voting Method</label>
                <select
                  value={state.votingMethod}
                  onChange={(e) => dispatch({ type: 'SET_VOTING_METHOD', method: e.target.value as VotingMethod })}
                  className="w-full p-2 border rounded-lg mb-3 bg-white"
                >
                  <option value="standard">Standard Vote (Yea/Nay/Abstain)</option>
                  <option value="ballot">Secret Ballot (anonymous)</option>
                  <option value="rollcall">Roll Call Vote (recorded)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => dispatch({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: generateTimestamp() })}
                  className="bg-green-500 text-white py-3 rounded-lg font-medium"
                >
                  Ask for Consent
                </button>
                <button
                  onClick={() => dispatch({ type: 'OPEN_VOTING', voteTimerEnd: calculateTimerEnd(state.voteTimeLimit), timestamp: generateTimestamp() })}
                  className="bg-indigo-600 text-white py-3 rounded-lg font-medium"
                >
                  Call the Question
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {state.unanimousConsentPending && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Unanimous Consent Requested</h3>
          <MotionCard motion={state.currentMotion}/>
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium mb-2">Waiting for objections...</p>
            <p className="text-green-700 text-sm">If no one objects, motion passes without a vote.</p>
          </div>
          <div className={`mt-3 ${state.currentMotion?.vote === 'none' ? '' : 'grid grid-cols-2 gap-2'}`}>
            <button
              onClick={() => dispatch({ type: 'UNANIMOUS_CONSENT_PASSED', timestamp: generateTimestamp() })}
              className="bg-green-500 text-white py-3 rounded-lg font-medium w-full"
            >
              No Objection - Pass
            </button>
            {state.currentMotion?.vote !== 'none' && (
              <button
                onClick={() => dispatch({ type: 'OPEN_VOTING', voteTimerEnd: calculateTimerEnd(state.voteTimeLimit), timestamp: generateTimestamp() })}
                className="bg-indigo-600 text-white py-3 rounded-lg font-medium"
              >
                Proceed to Vote
              </button>
            )}
          </div>
        </div>
      )}

      {state.votingOpen && votingData && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Voting</h3>
          {!hasQuorum && (
            <div className="mb-3 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg">
              <p className="text-amber-800 font-semibold">⚠️ Voting Without Quorum</p>
              <p className="text-amber-700 text-sm">Only {presentCount} of {state.quorum} required members are present. This vote may need to be ratified later.</p>
            </div>
          )}
          {state.voteTimerEnd && (
            <div className="mb-3">
              <CountdownTimer
                endTime={state.voteTimerEnd}
                label="Voting Time"
                onExpired={handleVoteTimeExpired}
              />
              {voteTimeExpired && (
                <div className="mt-2 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg animate-pulse">
                  <p className="text-amber-800 font-semibold">⏰ Voting time has expired</p>
                  <p className="text-amber-700 text-sm">Consider closing the vote or extending the voting period.</p>
                </div>
              )}
            </div>
          )}

          {/* Vote counts - hidden for secret ballots until closed */}
          {state.votingMethod === 'ballot' ? (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-gray-600 mb-2">🔒 Secret Ballot in Progress</p>
              <p className="text-2xl font-bold text-gray-700">{state.voters.length}</p>
              <p className="text-gray-500 text-sm">votes cast</p>
              <p className="text-gray-400 text-xs mt-1">Results hidden until voting closes</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-green-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-green-700">{votingData.yea}</p><p className="text-green-600">Yea</p></div>
              <div className="bg-red-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-red-700">{votingData.nay}</p><p className="text-red-600">Nay</p></div>
              <div className="bg-gray-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-gray-700">{state.votes.abstain}</p><p className="text-gray-600">Abstain</p></div>
            </div>
          )}

          {/* Chair voting rules */}
          {state.votingMethod !== 'ballot' && !votingData.chairHasVoted && (votingData.canVoteToBreakTie || votingData.canVoteToCreateTie) && chair && (
            <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-purple-800 font-medium mb-2">
                {votingData.canVoteToBreakTie && "Chair may vote to break the tie"}
                {votingData.canVoteToCreateTie && "Chair may vote to create a tie (defeat motion)"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: chair.id, isChairDecidingVote: true })}
                  className="bg-green-500 text-white py-2 rounded-lg font-medium"
                >
                  Vote Yea
                </button>
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: chair.id, isChairDecidingVote: true })}
                  className="bg-red-500 text-white py-2 rounded-lg font-medium"
                >
                  Vote Nay
                </button>
              </div>
            </div>
          )}
          {state.votingMethod === 'ballot' && !votingData.chairHasVoted && chair && (
            <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
              🔒 Secret Ballot - Chair votes like other members
            </p>
          )}

          <button
            onClick={() => dispatch({ type: 'CLOSE_VOTING', timestamp: generateTimestamp() })}
            className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium"
          >
            Close & Announce
          </button>
        </div>
      )}

      {state.agendaAdopted && state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2 text-gray-800">Current Item</h3>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3 font-medium text-indigo-900">{state.currentAgendaItem.title}</div>
          <div className="space-y-2">
            <button
              onClick={handlePutToVote}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
            >
              Put to Vote
            </button>
            <button
              onClick={() => dispatch({ type: 'COMPLETE_AGENDA_ITEM', id: state.currentAgendaItem.id, timestamp: generateTimestamp() })}
              className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
            >
              Mark Complete (No Vote)
            </button>
          </div>
        </div>
      )}

      {state.agendaAdopted && !state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Agenda</h3>
          <ul className="space-y-2">
            {state.agenda.map((item, i) => (
              <li key={item.id} className={`flex items-center justify-between p-3 rounded-lg ${item.status === 'completed' ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  {item.status === 'completed' && <CheckCircle size={16} className="text-green-600"/>}
                  <span className={item.status === 'completed' ? 'line-through text-gray-400' : ''}>{i + 1}. {item.title}</span>
                </div>
                {item.status === 'pending' && (
                  <button
                    onClick={() => dispatch({ type: 'CALL_AGENDA_ITEM', id: item.id, timestamp: generateTimestamp() })}
                    className="bg-indigo-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Call
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-lg p-4 shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2 text-gray-800"><Hand size={18}/> Speaker Queue <span className="bg-gray-200 text-gray-700 text-sm px-2 py-0.5 rounded-full">{state.speakerQueue.length}</span></h3>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={state.autoYieldOnTimeExpired}
              onChange={(e) => dispatch({ type: 'SET_AUTO_YIELD', enabled: e.target.checked })}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Auto-yield on timeout
          </label>
        </div>
        {state.recognizedSpeaker && (
          <div className="mb-3 p-3 bg-green-100 rounded-lg">
            <div className="text-green-800 font-medium mb-2"><strong>{state.recognizedSpeaker.name}</strong> has the floor</div>
            {state.speakerTimerEnd && (
              <CountdownTimer
                endTime={state.speakerTimerEnd}
                label="Speaking Time"
                onExpired={handleSpeakerTimeExpired}
              />
            )}
            {speakerTimeExpired && (
              <div className="mt-2 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg animate-pulse">
                <p className="text-amber-800 font-semibold">⏰ Speaking time has expired</p>
                <p className="text-amber-700 text-sm">Consider asking the speaker to yield the floor or extend their time.</p>
              </div>
            )}
          </div>
        )}
        {state.speakerQueue.length === 0 ? <p className="text-gray-500 text-center py-4">No one waiting</p> : (
          <ul className="space-y-2">
            {sortedQueue.map((entry, i) => {
              const motionMakerId = state.currentMotion?.moverId;
              const moverHasSpoken = state.currentMotion?.moverHasSpoken;
              const isMotionMaker = motionMakerId === entry.member.id && !moverHasSpoken;
              const stanceIcon = entry.stance === 'pro' ? '✓' : entry.stance === 'con' ? '✗' : '○';
              const stanceColor = entry.stance === 'pro' ? 'text-green-600' : entry.stance === 'con' ? 'text-red-600' : 'text-gray-500';
              const stanceLabel = entry.stance === 'pro' ? 'For' : entry.stance === 'con' ? 'Against' : 'Neutral';
              return (
                <li key={entry.member.id} className={`flex items-center justify-between p-3 rounded-lg ${isMotionMaker ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-gray-50'}`}>
                  <span className="flex items-center gap-2">
                    <span>{i + 1}. {entry.member.name}</span>
                    <span className={`text-xs font-medium ${stanceColor}`} title={stanceLabel}>
                      {stanceIcon} {stanceLabel}
                    </span>
                    {isMotionMaker && <span className="ml-2 text-xs text-indigo-600 font-medium">(Motion Maker - speaks first)</span>}
                  </span>
                  <button
                    onClick={() => dispatch({
                      type: 'RECOGNIZE_SPEAKER',
                      member: entry.member,
                      stance: entry.stance,
                      speakerTimerEnd: calculateTimerEnd(state.speakerTimeLimit),
                      timestamp: generateTimestamp()
                    })}
                    className={`px-4 py-1 rounded text-sm text-white ${isMotionMaker ? 'bg-indigo-600' : 'bg-blue-500'}`}
                  >
                    Recognize
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Nominations and Elections */}
      {(state.nominationsOpen || state.currentElection || state.currentNominationPosition || state.electedOfficers.length > 0) && (
        <>
          <NominationsPanel
            state={state}
            dispatch={dispatch}
            currentUser={state.members.find(m => m.role === 'chair')!}
            isChair={true}
          />
          {(state.currentElection || (!state.nominationsOpen && state.currentNominationPosition)) && (
            <ElectionPanel
              state={state}
              dispatch={dispatch}
              currentUser={state.members.find(m => m.role === 'chair')!}
              isChair={true}
            />
          )}
        </>
      )}

      {/* Inquiries Panel */}
      <InquiryPanel
        state={state}
        dispatch={dispatch}
        currentUser={state.members.find(m => m.role === 'chair')!}
        isChair={true}
      />

      {state.motionStack.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Motion Stack</h3>
          <ul className="space-y-2">
            {[...state.motionStack].reverse().map((m, i) => (
              <li key={m.id} className={`text-sm p-3 rounded-lg ${i === 0 ? 'bg-indigo-100 border-2 border-indigo-300' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">{i === 0 && <ChevronRight size={16} className="text-indigo-600"/>}<span className="font-medium">{m.name}</span></div>
                <p className="text-gray-600 ml-6">"{m.text}"</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
