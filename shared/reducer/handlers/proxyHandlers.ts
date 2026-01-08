import type { MeetingState, MeetingAction, MeetingLogEntry, PendingProxyRequest } from '../../types/index.js';
import type { ActionHandler } from './types.js';

type ProxyAction = Extract<MeetingAction,
  | { type: 'SET_PROXY_SETTINGS' }
  | { type: 'GRANT_PROXY' }
  | { type: 'REVOKE_PROXY' }
  | { type: 'CAST_PROXY_VOTE' }
  | { type: 'REQUEST_PROXY' }
  | { type: 'ACCEPT_PROXY' }
  | { type: 'DECLINE_PROXY' }
  | { type: 'CANCEL_PROXY_REQUEST' }
>;

/**
 * Handles proxy voting actions including:
 * - SET_PROXY_SETTINGS: Enable/disable proxy voting and set limits
 * - GRANT_PROXY: Authorize a member to vote on behalf of an absent member
 * - REVOKE_PROXY: Remove a proxy authorization
 * - CAST_PROXY_VOTE: Cast a vote on behalf of another member
 * - REQUEST_PROXY: Member requests another member to be their proxy
 * - ACCEPT_PROXY: Designated proxy holder accepts the request
 * - DECLINE_PROXY: Designated proxy holder declines the request
 * - CANCEL_PROXY_REQUEST: Member cancels their pending proxy request
 */
export const proxyHandler: ActionHandler = (
  state: MeetingState,
  action: MeetingAction,
  log: (timestamp: string, msg: string) => MeetingLogEntry[]
): MeetingState => {
  const typedAction = action as ProxyAction;

  switch (typedAction.type) {
    case 'SET_PROXY_SETTINGS': {
      const quorumNote = typedAction.proxiesCountForQuorum ? ', proxies count for quorum' : '';
      const memberGrantNote = typedAction.allowMemberProxyGrant ? ', member requests enabled' : '';
      return {
        ...state,
        allowProxyVoting: typedAction.allowProxyVoting,
        maxProxiesPerMember: typedAction.maxProxiesPerMember,
        proxiesCountForQuorum: typedAction.proxiesCountForQuorum,
        allowMemberProxyGrant: typedAction.allowMemberProxyGrant ?? state.allowMemberProxyGrant,
        meetingLog: log(typedAction.timestamp,
          typedAction.allowProxyVoting
            ? `Proxy voting enabled (max ${typedAction.maxProxiesPerMember === 0 ? 'unlimited' : typedAction.maxProxiesPerMember} per member${quorumNote}${memberGrantNote})`
            : 'Proxy voting disabled'
        )
      };
    }

    case 'GRANT_PROXY': {
      // Validate proxy voting is enabled
      if (!state.allowProxyVoting) {
        return state;
      }

      // Check if granting member exists and is not present
      const grantingMember = state.members.find(m => m.id === typedAction.grantedBy);
      if (!grantingMember) {
        return state;
      }

      // Check if receiving member exists and is present
      const receivingMember = state.members.find(m => m.id === typedAction.grantedTo);
      if (!receivingMember || !receivingMember.present) {
        return state;
      }

      // Check max proxies limit (0 = unlimited)
      if (state.maxProxiesPerMember > 0) {
        const currentProxyCount = state.proxies.filter(p => p.grantedTo === typedAction.grantedTo).length;
        if (currentProxyCount >= state.maxProxiesPerMember) {
          return state;
        }
      }

      // Check if this member already has a proxy
      const existingProxy = state.proxies.find(p => p.grantedBy === typedAction.grantedBy);
      if (existingProxy) {
        return state;
      }

      const newProxy = {
        id: typedAction.proxyId,
        grantedBy: typedAction.grantedBy,
        grantedTo: typedAction.grantedTo,
        grantedByName: typedAction.grantedByName,
        grantedToName: typedAction.grantedToName,
        grantedAt: typedAction.timestamp,
        scope: typedAction.scope
      };

      return {
        ...state,
        proxies: [...state.proxies, newProxy],
        meetingLog: log(typedAction.timestamp,
          `Proxy granted: ${typedAction.grantedByName} authorized ${typedAction.grantedToName} to vote on their behalf (scope: ${typedAction.scope})`
        )
      };
    }

    case 'REVOKE_PROXY': {
      const proxy = state.proxies.find(p => p.id === typedAction.proxyId);
      if (!proxy) {
        return state;
      }

      return {
        ...state,
        proxies: state.proxies.filter(p => p.id !== typedAction.proxyId),
        meetingLog: log(typedAction.timestamp,
          `Proxy revoked: ${proxy.grantedToName} no longer authorized to vote for ${proxy.grantedByName}`
        )
      };
    }

    case 'CAST_PROXY_VOTE': {
      // Validate proxy voting is enabled
      if (!state.allowProxyVoting) {
        return state;
      }

      // Validate voting is open
      if (!state.votingOpen) {
        return state;
      }

      // Validate the caster has proxy authority for this member
      const proxy = state.proxies.find(
        p => p.grantedBy === typedAction.forMemberId && p.grantedTo === typedAction.castById
      );
      if (!proxy) {
        return state;
      }

      // Check if this member has already voted (directly or by proxy)
      if (state.voters.includes(typedAction.forMemberId)) {
        // Allow changing proxy vote (same as regular vote changing)
        const previousVote = state.voterChoices[typedAction.forMemberId];
        const newVotes = { ...state.votes };

        if (previousVote) {
          newVotes[previousVote]--;
        }
        newVotes[typedAction.vote]++;

        // Update proxy vote record
        const newProxyVotes = state.proxyVotes.filter(pv => pv.memberId !== typedAction.forMemberId);
        newProxyVotes.push({
          memberId: typedAction.forMemberId,
          castBy: typedAction.castById,
          vote: typedAction.vote
        });

        return {
          ...state,
          votes: newVotes,
          voterChoices: { ...state.voterChoices, [typedAction.forMemberId]: typedAction.vote },
          proxyVotes: newProxyVotes
        };
      }

      // Cast new proxy vote
      const newVotes = { ...state.votes };
      newVotes[typedAction.vote]++;

      const absentMember = state.members.find(m => m.id === typedAction.forMemberId);
      const proxyHolder = state.members.find(m => m.id === typedAction.castById);

      // For roll call votes, log the proxy vote
      const updatedLog = state.votingMethod === 'rollcall'
        ? log(typedAction.timestamp,
            `${absentMember?.name || 'Unknown'} (proxy via ${proxyHolder?.name || 'Unknown'}): ${typedAction.vote.toUpperCase()}`
          )
        : state.meetingLog;

      // Handle single-vote scope - revoke proxy after use
      let updatedProxies = state.proxies;
      if (proxy.scope === 'single-vote') {
        updatedProxies = state.proxies.filter(p => p.id !== proxy.id);
      }

      return {
        ...state,
        votes: newVotes,
        voters: [...state.voters, typedAction.forMemberId],
        voterChoices: { ...state.voterChoices, [typedAction.forMemberId]: typedAction.vote },
        proxyVotes: [...state.proxyVotes, {
          memberId: typedAction.forMemberId,
          castBy: typedAction.castById,
          vote: typedAction.vote
        }],
        proxies: updatedProxies,
        meetingLog: updatedLog
      };
    }

    case 'REQUEST_PROXY': {
      // Validate proxy voting and member grants are enabled
      if (!state.allowProxyVoting || !state.allowMemberProxyGrant) {
        return state;
      }

      // Check if requesting member exists
      const requestingMember = state.members.find(m => m.id === typedAction.requestedBy);
      if (!requestingMember) {
        return state;
      }

      // Check if designated proxy holder exists
      const designatedHolder = state.members.find(m => m.id === typedAction.requestedFor);
      if (!designatedHolder) {
        return state;
      }

      // Cannot request yourself as proxy
      if (typedAction.requestedBy === typedAction.requestedFor) {
        return state;
      }

      // Check for existing pending request from this member
      const existingRequest = state.pendingProxyRequests.find(
        r => r.requestedBy === typedAction.requestedBy && r.status === 'pending'
      );
      if (existingRequest) {
        return state;
      }

      // Check for existing active proxy from this member
      const existingProxy = state.proxies.find(p => p.grantedBy === typedAction.requestedBy);
      if (existingProxy) {
        return state;
      }

      const newRequest: PendingProxyRequest = {
        id: typedAction.requestId,
        requestedBy: typedAction.requestedBy,
        requestedByName: typedAction.requestedByName,
        requestedFor: typedAction.requestedFor,
        requestedForName: typedAction.requestedForName,
        requestedAt: typedAction.timestamp,
        scope: typedAction.scope,
        status: 'pending'
      };

      return {
        ...state,
        pendingProxyRequests: [...state.pendingProxyRequests, newRequest],
        meetingLog: log(typedAction.timestamp,
          `${typedAction.requestedByName} requested proxy authorization to ${typedAction.requestedForName} (scope: ${typedAction.scope})`
        )
      };
    }

    case 'ACCEPT_PROXY': {
      // Find the pending request
      const request = state.pendingProxyRequests.find(
        r => r.id === typedAction.requestId && r.status === 'pending'
      );
      if (!request) {
        return state;
      }

      // Check max proxies limit (0 = unlimited)
      if (state.maxProxiesPerMember > 0) {
        const currentProxyCount = state.proxies.filter(p => p.grantedTo === request.requestedFor).length;
        if (currentProxyCount >= state.maxProxiesPerMember) {
          return state;
        }
      }

      // Update request status to accepted
      const updatedRequests = state.pendingProxyRequests.map(r =>
        r.id === typedAction.requestId
          ? { ...r, status: 'accepted' as const, respondedAt: typedAction.timestamp }
          : r
      );

      // Create the actual proxy authorization
      const newProxy = {
        id: typedAction.proxyId,
        grantedBy: request.requestedBy,
        grantedTo: request.requestedFor,
        grantedByName: request.requestedByName,
        grantedToName: request.requestedForName,
        grantedAt: typedAction.timestamp,
        scope: request.scope
      };

      return {
        ...state,
        pendingProxyRequests: updatedRequests,
        proxies: [...state.proxies, newProxy],
        meetingLog: log(typedAction.timestamp,
          `${request.requestedForName} accepted proxy request from ${request.requestedByName}`
        )
      };
    }

    case 'DECLINE_PROXY': {
      // Find the pending request
      const request = state.pendingProxyRequests.find(
        r => r.id === typedAction.requestId && r.status === 'pending'
      );
      if (!request) {
        return state;
      }

      // Update request status to declined
      const updatedRequests = state.pendingProxyRequests.map(r =>
        r.id === typedAction.requestId
          ? {
              ...r,
              status: 'declined' as const,
              respondedAt: typedAction.timestamp,
              declineReason: typedAction.reason
            }
          : r
      );

      return {
        ...state,
        pendingProxyRequests: updatedRequests,
        meetingLog: log(typedAction.timestamp,
          `${request.requestedForName} declined proxy request from ${request.requestedByName}${typedAction.reason ? `: ${typedAction.reason}` : ''}`
        )
      };
    }

    case 'CANCEL_PROXY_REQUEST': {
      // Find the pending request
      const request = state.pendingProxyRequests.find(
        r => r.id === typedAction.requestId && r.status === 'pending'
      );
      if (!request) {
        return state;
      }

      // Update request status to cancelled
      const updatedRequests = state.pendingProxyRequests.map(r =>
        r.id === typedAction.requestId
          ? { ...r, status: 'cancelled' as const, respondedAt: typedAction.timestamp }
          : r
      );

      return {
        ...state,
        pendingProxyRequests: updatedRequests,
        meetingLog: log(typedAction.timestamp,
          `${request.requestedByName} cancelled their proxy request to ${request.requestedForName}`
        )
      };
    }

    default:
      return state;
  }
};
