import React, { useState, useMemo, useCallback } from 'react';
import { UserPlus, X, Clock, Send } from 'lucide-react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type {
  MeetingState,
  MeetingAction,
  Member,
  PendingProxyRequest,
} from '@robbie-bylawyer/shared/types';

interface ProxyRequestPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
}

export const ProxyRequestPanel = React.memo(function ProxyRequestPanel({
  state,
  dispatch,
  currentUser,
}: ProxyRequestPanelProps) {
  const [selectedHolder, setSelectedHolder] = useState<number | ''>('');
  const [proxyScope, setProxyScope] = useState<'all' | 'single-vote'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user already has an active proxy
  const hasActiveProxy = useMemo(() => {
    return state.proxies.some((p) => p.grantedBy === currentUser.id);
  }, [state.proxies, currentUser.id]);

  // Check if user has a pending proxy request
  const pendingRequest = useMemo(() => {
    return state.pendingProxyRequests.find(
      (r) => r.requestedBy === currentUser.id && r.status === 'pending',
    );
  }, [state.pendingProxyRequests, currentUser.id]);

  // Get eligible proxy holders (present members who can hold more proxies, excluding self)
  const eligibleHolders = useMemo(() => {
    return state.members.filter((m) => {
      if (!m.present) return false;
      if (m.id === currentUser.id) return false;
      // Check if they've reached max proxies (0 = unlimited)
      if (state.maxProxiesPerMember === 0) return true;
      const currentCount = state.proxies.filter((p) => p.grantedTo === m.id).length;
      return currentCount < state.maxProxiesPerMember;
    });
  }, [state.members, state.proxies, state.maxProxiesPerMember, currentUser.id]);

  const handleRequestProxy = useCallback(async () => {
    if (selectedHolder === '' || isSubmitting) return;

    const holder = state.members.find((m) => m.id === selectedHolder);
    if (!holder) return;

    setIsSubmitting(true);
    try {
      dispatch({
        type: 'REQUEST_PROXY',
        requestId: generateId(),
        requestedBy: currentUser.id,
        requestedByName: currentUser.name,
        requestedFor: selectedHolder,
        requestedForName: holder.name,
        scope: proxyScope,
        timestamp: generateTimestamp(),
      });
      setSelectedHolder('');
    } finally {
      setIsSubmitting(false);
    }
  }, [dispatch, currentUser, selectedHolder, proxyScope, state.members, isSubmitting]);

  const handleCancelRequest = useCallback(() => {
    if (!pendingRequest) return;

    dispatch({
      type: 'CANCEL_PROXY_REQUEST',
      requestId: pendingRequest.id,
      timestamp: generateTimestamp(),
    });
  }, [dispatch, pendingRequest]);

  // Don't show panel if proxy voting or member grants aren't enabled
  if (!state.allowProxyVoting || !state.allowMemberProxyGrant) {
    return null;
  }

  // Don't show if user is present (they can vote themselves)
  if (currentUser.present) {
    return null;
  }

  // If user already has an active proxy, show that status
  if (hasActiveProxy) {
    const proxy = state.proxies.find((p) => p.grantedBy === currentUser.id);
    return (
      <section
        className="bg-green-50 border border-green-200 rounded-lg p-4"
        aria-labelledby="proxy-status-heading"
      >
        <h3
          id="proxy-status-heading"
          className="font-semibold flex items-center gap-2 text-green-800 mb-2"
        >
          <UserPlus size={18} aria-hidden="true" /> Proxy Active
        </h3>
        <p className="text-green-700 text-sm">
          <strong>{proxy?.grantedToName}</strong> holds your proxy
          <span className="text-green-600 text-xs ml-1">
            ({proxy?.scope === 'single-vote' ? 'single vote only' : 'all votes'})
          </span>
        </p>
      </section>
    );
  }

  // If there's a pending request, show that status
  if (pendingRequest) {
    return (
      <section
        className="bg-amber-50 border border-amber-200 rounded-lg p-4"
        aria-labelledby="proxy-pending-heading"
      >
        <h3
          id="proxy-pending-heading"
          className="font-semibold flex items-center gap-2 text-amber-800 mb-2"
        >
          <Clock size={18} aria-hidden="true" /> Proxy Request Pending
        </h3>
        <p className="text-amber-700 text-sm mb-3">
          Waiting for <strong>{pendingRequest.requestedForName}</strong> to accept your proxy
          request
          <span className="text-amber-600 text-xs ml-1">
            ({pendingRequest.scope === 'single-vote' ? 'single vote only' : 'all votes'})
          </span>
        </p>
        <button
          onClick={handleCancelRequest}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-amber-700 border border-amber-300 rounded-sm hover:bg-amber-100"
        >
          <X size={14} /> Cancel Request
        </button>
      </section>
    );
  }

  // Show request form
  return (
    <section className="bg-white rounded-lg p-4 shadow-sm" aria-labelledby="proxy-request-heading">
      <h3
        id="proxy-request-heading"
        className="font-semibold flex items-center gap-2 text-gray-800 mb-3"
      >
        <UserPlus size={18} aria-hidden="true" /> Request Proxy
      </h3>

      <p className="text-sm text-gray-600 mb-3">
        You're marked as absent. Request another member to vote on your behalf.
      </p>

      {eligibleHolders.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No eligible members available to hold your proxy.
        </p>
      ) : (
        <>
          <div className="mb-3">
            <label htmlFor="proxy-holder-select" className="block text-sm text-gray-600 mb-1">
              Select Proxy Holder
            </label>
            <select
              id="proxy-holder-select"
              value={selectedHolder}
              onChange={(e) => setSelectedHolder(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full p-2 border rounded-sm text-sm"
            >
              <option value="">Select a member...</option>
              {eligibleHolders.map((m) => {
                const proxyCount = state.proxies.filter((p) => p.grantedTo === m.id).length;
                return (
                  <option key={m.id} value={m.id}>
                    {m.name}{' '}
                    {proxyCount > 0 ? `(${proxyCount} proxy${proxyCount > 1 ? 'ies' : ''})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="mb-4">
            <span className="block text-sm text-gray-600 mb-1">Scope</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="proxy-scope"
                  value="all"
                  checked={proxyScope === 'all'}
                  onChange={() => setProxyScope('all')}
                  className="text-indigo-600"
                />
                All votes
              </label>
              <label className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="proxy-scope"
                  value="single-vote"
                  checked={proxyScope === 'single-vote'}
                  onChange={() => setProxyScope('single-vote')}
                  className="text-indigo-600"
                />
                Single vote only
              </label>
            </div>
          </div>

          <button
            onClick={handleRequestProxy}
            disabled={selectedHolder === '' || isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-sm hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
          >
            <Send size={14} />
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </button>
        </>
      )}

      {/* Show declined requests for context */}
      <DeclinedRequestsHistory
        requests={state.pendingProxyRequests.filter(
          (r) => r.requestedBy === currentUser.id && r.status === 'declined',
        )}
      />
    </section>
  );
});

// Sub-component to show declined request history
function DeclinedRequestsHistory({ requests }: { requests: PendingProxyRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs text-gray-500 mb-1">Recent declined requests:</p>
      <ul className="text-xs text-gray-400 space-y-1">
        {requests.slice(0, 3).map((req) => (
          <li key={req.id}>
            {req.requestedForName} declined
            {req.declineReason && `: "${req.declineReason}"`}
          </li>
        ))}
      </ul>
    </div>
  );
}
