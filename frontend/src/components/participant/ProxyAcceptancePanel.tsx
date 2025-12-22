import React, { useState, useMemo, useCallback } from 'react';
import { UserCheck, Check, X, AlertCircle } from 'lucide-react';
import { generateId, generateTimestamp } from '@robbie/shared/utils';
import type { MeetingState, MeetingAction, Member, PendingProxyRequest } from '@robbie/shared/types';

interface ProxyAcceptancePanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
}

export const ProxyAcceptancePanel = React.memo(function ProxyAcceptancePanel({
  state,
  dispatch,
  currentUser
}: ProxyAcceptancePanelProps) {
  // Get pending requests directed to this user
  const pendingRequestsToMe = useMemo(() => {
    return state.pendingProxyRequests.filter(
      r => r.requestedFor === currentUser.id && r.status === 'pending'
    );
  }, [state.pendingProxyRequests, currentUser.id]);

  // Don't show if proxy voting or member grants aren't enabled
  if (!state.allowProxyVoting || !state.allowMemberProxyGrant) {
    return null;
  }

  // Don't show if no pending requests
  if (pendingRequestsToMe.length === 0) {
    return null;
  }

  // Check if user can accept more proxies
  const currentProxyCount = state.proxies.filter(p => p.grantedTo === currentUser.id).length;
  const canAcceptMore = state.maxProxiesPerMember === 0 || currentProxyCount < state.maxProxiesPerMember;

  return (
    <section
      className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 shadow"
      aria-labelledby="proxy-acceptance-heading"
      role="alert"
    >
      <h3 id="proxy-acceptance-heading" className="font-semibold flex items-center gap-2 text-blue-800 mb-3">
        <AlertCircle size={18} aria-hidden="true" />
        Proxy Request{pendingRequestsToMe.length > 1 ? 's' : ''} ({pendingRequestsToMe.length})
      </h3>

      {!canAcceptMore && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          You've reached the maximum number of proxies ({state.maxProxiesPerMember}).
          You must decline these requests or wait for existing proxies to be revoked.
        </div>
      )}

      <div className="space-y-3">
        {pendingRequestsToMe.map(request => (
          <ProxyRequestCard
            key={request.id}
            request={request}
            dispatch={dispatch}
            canAccept={canAcceptMore}
            maxProxies={state.maxProxiesPerMember}
            currentProxyCount={currentProxyCount}
          />
        ))}
      </div>
    </section>
  );
});

interface ProxyRequestCardProps {
  request: PendingProxyRequest;
  dispatch: React.Dispatch<MeetingAction>;
  canAccept: boolean;
  maxProxies: number;
  currentProxyCount: number;
}

function ProxyRequestCard({
  request,
  dispatch,
  canAccept,
  maxProxies,
  currentProxyCount
}: ProxyRequestCardProps) {
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = useCallback(async () => {
    if (isSubmitting || !canAccept) return;

    setIsSubmitting(true);
    try {
      dispatch({
        type: 'ACCEPT_PROXY',
        requestId: request.id,
        proxyId: generateId(),
        timestamp: generateTimestamp()
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [dispatch, request.id, isSubmitting, canAccept]);

  const handleDecline = useCallback(async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      dispatch({
        type: 'DECLINE_PROXY',
        requestId: request.id,
        reason: declineReason.trim() || undefined,
        timestamp: generateTimestamp()
      });
    } finally {
      setIsSubmitting(false);
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  }, [dispatch, request.id, declineReason, isSubmitting]);

  const requestedAt = new Date(request.requestedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="bg-white rounded-lg p-3 border border-blue-200">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-gray-800">{request.requestedByName}</p>
          <p className="text-xs text-gray-500">
            requests you to vote on their behalf
            <span className="ml-1">({request.scope === 'single-vote' ? 'single vote only' : 'all votes'})</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Requested at {requestedAt}</p>
        </div>
        <UserCheck size={20} className="text-blue-500" aria-hidden="true" />
      </div>

      {showDeclineReason ? (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Reason for declining (optional)"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value.slice(0, 200))}
            maxLength={200}
            className="w-full p-2 border rounded text-sm"
            aria-label="Decline reason"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDecline}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-300"
            >
              <X size={14} /> Confirm Decline
            </button>
            <button
              onClick={() => {
                setShowDeclineReason(false);
                setDeclineReason('');
              }}
              className="px-3 py-2 text-gray-600 border rounded text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={isSubmitting || !canAccept}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            title={!canAccept ? `Maximum ${maxProxies} proxies reached` : undefined}
          >
            <Check size={14} /> Accept
          </button>
          <button
            onClick={() => setShowDeclineReason(true)}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-300"
          >
            <X size={14} /> Decline
          </button>
        </div>
      )}

      {!canAccept && (
        <p className="text-xs text-amber-600 mt-2">
          You currently hold {currentProxyCount}/{maxProxies} proxies.
        </p>
      )}
    </div>
  );
}
