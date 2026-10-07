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
        className="bg-carried-tint border border-carried/40 rounded-lg p-4"
        aria-labelledby="proxy-status-heading"
      >
        <h3
          id="proxy-status-heading"
          className="font-semibold flex items-center gap-2 text-ink mb-2"
        >
          <UserPlus size={18} aria-hidden="true" /> Proxy Active
        </h3>
        <p className="text-carried text-sm">
          <strong>{proxy?.grantedToName}</strong> holds your proxy
          <span className="text-carried text-xs ml-1">
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
        className="bg-caution-tint border border-caution/40 rounded-lg p-4"
        aria-labelledby="proxy-pending-heading"
      >
        <h3
          id="proxy-pending-heading"
          className="font-semibold flex items-center gap-2 text-ink mb-2"
        >
          <Clock size={18} aria-hidden="true" /> Proxy Request Pending
        </h3>
        <p className="text-caution-ink text-sm mb-3">
          Waiting for <strong>{pendingRequest.requestedForName}</strong> to accept your proxy
          request
          <span className="text-caution-ink text-xs ml-1">
            ({pendingRequest.scope === 'single-vote' ? 'single vote only' : 'all votes'})
          </span>
        </p>
        <button
          onClick={handleCancelRequest}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-caution-ink border border-caution/40 rounded-sm hover:bg-caution-tint"
        >
          <X size={14} /> Cancel Request
        </button>
      </section>
    );
  }

  // Show request form
  return (
    <section
      className="bg-surface rounded-lg p-4 shadow-sm"
      aria-labelledby="proxy-request-heading"
    >
      <h3
        id="proxy-request-heading"
        className="font-semibold flex items-center gap-2 text-ink mb-3"
      >
        <UserPlus size={18} aria-hidden="true" /> Request Proxy
      </h3>

      <p className="text-sm text-ink-muted mb-3">
        You're marked as absent. Request another member to vote on your behalf.
      </p>

      {eligibleHolders.length === 0 ? (
        <p className="text-sm text-ink-muted italic">
          No eligible members available to hold your proxy.
        </p>
      ) : (
        <>
          <div className="mb-3">
            <label htmlFor="proxy-holder-select" className="block text-sm text-ink-muted mb-1">
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
            <span className="block text-sm text-ink-muted mb-1">Scope</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="proxy-scope"
                  value="all"
                  checked={proxyScope === 'all'}
                  onChange={() => setProxyScope('all')}
                  className="accent-gavel"
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
                  className="accent-gavel"
                />
                Single vote only
              </label>
            </div>
          </div>

          <button
            onClick={handleRequestProxy}
            disabled={selectedHolder === '' || isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2 bg-gavel text-paper rounded-sm hover:bg-gavel-700 dark:hover:bg-gavel-300 disabled:bg-rule disabled:cursor-not-allowed text-sm font-medium"
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
    <div className="mt-3 pt-3 border-t border-rule">
      <p className="text-xs text-ink-muted mb-1">Recent declined requests:</p>
      <ul className="text-xs text-ink-muted space-y-1">
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
