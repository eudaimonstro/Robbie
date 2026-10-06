import React, { useState, useMemo, useCallback } from 'react';
import { Users, UserPlus, UserMinus, Settings, Clock, X } from 'lucide-react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type {
  MeetingState,
  MeetingAction,
  Member,
  PendingProxyRequest,
} from '@robbie-bylawyer/shared/types';

interface ProxyManagementPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const ProxyManagementPanel = React.memo(function ProxyManagementPanel({
  state,
  dispatch,
}: ProxyManagementPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [maxProxies, setMaxProxies] = useState(state.maxProxiesPerMember);
  const [countForQuorum, setCountForQuorum] = useState(state.proxiesCountForQuorum);
  const [allowMemberGrant, setAllowMemberGrant] = useState(state.allowMemberProxyGrant);
  const [selectedAbsentMember, setSelectedAbsentMember] = useState<number | ''>('');
  const [selectedProxyHolder, setSelectedProxyHolder] = useState<number | ''>('');
  const [proxyScope, setProxyScope] = useState<'all' | 'single-vote'>('all');

  // Get pending proxy requests
  const pendingRequests = useMemo(() => {
    return state.pendingProxyRequests.filter((r) => r.status === 'pending');
  }, [state.pendingProxyRequests]);

  // Get absent members who don't already have a proxy
  const absentMembersWithoutProxy = useMemo(() => {
    const membersWithProxy = new Set(state.proxies.map((p) => p.grantedBy));
    return state.members.filter((m) => !m.present && !membersWithProxy.has(m.id));
  }, [state.members, state.proxies]);

  // Get present members who can hold proxies
  const eligibleProxyHolders = useMemo(() => {
    return state.members.filter((m) => {
      if (!m.present) return false;
      // Check if they've reached max proxies (0 = unlimited)
      if (state.maxProxiesPerMember === 0) return true;
      const currentCount = state.proxies.filter((p) => p.grantedTo === m.id).length;
      return currentCount < state.maxProxiesPerMember;
    });
  }, [state.members, state.proxies, state.maxProxiesPerMember]);

  // Group proxies by holder for display
  const proxiesByHolder = useMemo(() => {
    const grouped: Record<number, { holder: Member; proxies: typeof state.proxies }> = {};
    for (const proxy of state.proxies) {
      if (!grouped[proxy.grantedTo]) {
        const holder = state.members.find((m) => m.id === proxy.grantedTo);
        if (holder) {
          grouped[proxy.grantedTo] = { holder, proxies: [] };
        }
      }
      if (grouped[proxy.grantedTo]) {
        grouped[proxy.grantedTo].proxies.push(proxy);
      }
    }
    return Object.values(grouped);
  }, [state.proxies, state.members]);

  const handleToggleProxyVoting = useCallback(() => {
    dispatch({
      type: 'SET_PROXY_SETTINGS',
      allowProxyVoting: !state.allowProxyVoting,
      maxProxiesPerMember: state.maxProxiesPerMember,
      proxiesCountForQuorum: state.proxiesCountForQuorum,
      timestamp: generateTimestamp(),
    });
  }, [dispatch, state.allowProxyVoting, state.maxProxiesPerMember, state.proxiesCountForQuorum]);

  const handleSaveSettings = useCallback(() => {
    dispatch({
      type: 'SET_PROXY_SETTINGS',
      allowProxyVoting: state.allowProxyVoting,
      maxProxiesPerMember: maxProxies,
      proxiesCountForQuorum: countForQuorum,
      allowMemberProxyGrant: allowMemberGrant,
      timestamp: generateTimestamp(),
    });
    setShowSettings(false);
  }, [dispatch, state.allowProxyVoting, maxProxies, countForQuorum, allowMemberGrant]);

  const handleCancelRequest = useCallback(
    (requestId: number) => {
      dispatch({
        type: 'CANCEL_PROXY_REQUEST',
        requestId,
        timestamp: generateTimestamp(),
      });
    },
    [dispatch],
  );

  const handleGrantProxy = useCallback(() => {
    if (selectedAbsentMember === '' || selectedProxyHolder === '') return;

    const absentMember = state.members.find((m) => m.id === selectedAbsentMember);
    const holder = state.members.find((m) => m.id === selectedProxyHolder);
    if (!absentMember || !holder) return;

    dispatch({
      type: 'GRANT_PROXY',
      proxyId: generateId(),
      grantedBy: selectedAbsentMember,
      grantedTo: selectedProxyHolder,
      grantedByName: absentMember.name,
      grantedToName: holder.name,
      scope: proxyScope,
      timestamp: generateTimestamp(),
    });

    setSelectedAbsentMember('');
    setSelectedProxyHolder('');
  }, [dispatch, selectedAbsentMember, selectedProxyHolder, proxyScope, state.members]);

  const handleRevokeProxy = useCallback(
    (proxyId: number) => {
      dispatch({
        type: 'REVOKE_PROXY',
        proxyId,
        timestamp: generateTimestamp(),
      });
    },
    [dispatch],
  );

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="proxy-heading">
      <div className="flex items-center justify-between mb-3">
        <h3 id="proxy-heading" className="font-semibold flex items-center gap-2 text-gray-800">
          <Users size={18} aria-hidden="true" /> Proxy Voting
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 text-gray-500 hover:text-gray-700 rounded"
            title="Proxy settings"
          >
            <Settings size={16} />
          </button>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={state.allowProxyVoting}
              onChange={handleToggleProxyVoting}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span
              className={state.allowProxyVoting ? 'text-green-700 font-medium' : 'text-gray-500'}
            >
              {state.allowProxyVoting ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>
      </div>

      {/* Warning about Robert's Rules */}
      {state.allowProxyVoting && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          <strong>Note:</strong> Proxy voting is not standard under Robert's Rules of Order. Only
          use if authorized by your organization's bylaws.
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Proxy Settings</h4>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm text-gray-600">Max proxies per member:</label>
            <input
              type="number"
              min="0"
              max="10"
              value={maxProxies}
              onChange={(e) => setMaxProxies(parseInt(e.target.value) || 0)}
              className="w-20 p-1.5 border rounded text-sm"
            />
            <span className="text-xs text-gray-500">(0 = unlimited)</span>
          </div>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={countForQuorum}
              onChange={(e) => setCountForQuorum(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-600">Proxies count toward quorum</span>
          </label>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowMemberGrant}
              onChange={(e) => setAllowMemberGrant(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-600">
              Allow members to request their own proxies
            </span>
          </label>
          {allowMemberGrant && (
            <p className="text-xs text-amber-600 mb-3">
              Members can send proxy requests to other members, who must accept before the proxy is
              active.
            </p>
          )}
          <button
            onClick={handleSaveSettings}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
          >
            Save Settings
          </button>
        </div>
      )}

      {state.allowProxyVoting && (
        <>
          {/* Grant Proxy Form */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
              <UserPlus size={14} /> Grant Proxy
            </h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Absent Member</label>
                <select
                  value={selectedAbsentMember}
                  onChange={(e) =>
                    setSelectedAbsentMember(e.target.value ? parseInt(e.target.value) : '')
                  }
                  className="w-full p-2 border rounded text-sm"
                  disabled={absentMembersWithoutProxy.length === 0}
                >
                  <option value="">Select member...</option>
                  {absentMembersWithoutProxy.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Proxy Holder</label>
                <select
                  value={selectedProxyHolder}
                  onChange={(e) =>
                    setSelectedProxyHolder(e.target.value ? parseInt(e.target.value) : '')
                  }
                  className="w-full p-2 border rounded text-sm"
                  disabled={eligibleProxyHolders.length === 0}
                >
                  <option value="">Select holder...</option>
                  {eligibleProxyHolders.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({state.proxies.filter((p) => p.grantedTo === m.id).length} proxies)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4 mb-2">
              <label className="text-xs text-gray-600">Scope:</label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  value="all"
                  checked={proxyScope === 'all'}
                  onChange={() => setProxyScope('all')}
                  className="text-indigo-600"
                />
                All votes
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  value="single-vote"
                  checked={proxyScope === 'single-vote'}
                  onChange={() => setProxyScope('single-vote')}
                  className="text-indigo-600"
                />
                Single vote only
              </label>
            </div>
            <button
              onClick={handleGrantProxy}
              disabled={selectedAbsentMember === '' || selectedProxyHolder === ''}
              className="w-full py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300"
            >
              Grant Proxy
            </button>
          </div>

          {/* Active Proxies */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Active Proxies ({state.proxies.length})
            </h4>
            {state.proxies.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-3">No active proxies</p>
            ) : (
              <div className="space-y-2">
                {proxiesByHolder.map(({ holder, proxies }) => (
                  <div key={holder.id} className="p-2 bg-gray-50 rounded border">
                    <p className="text-sm font-medium text-gray-800 mb-1">
                      {holder.name}{' '}
                      <span className="text-gray-500">holds {proxies.length} proxy(ies)</span>
                    </p>
                    <ul className="space-y-1">
                      {proxies.map((proxy) => (
                        <li key={proxy.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            • {proxy.grantedByName}
                            <span className="text-xs text-gray-400 ml-1">
                              ({proxy.scope === 'single-vote' ? 'single vote' : 'all votes'})
                            </span>
                          </span>
                          <button
                            onClick={() => handleRevokeProxy(proxy.id)}
                            className="text-red-600 hover:text-red-700 p-1"
                            title="Revoke proxy"
                          >
                            <UserMinus size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Proxy Requests (when member grants enabled) */}
          {state.allowMemberProxyGrant && pendingRequests.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Clock size={14} /> Pending Requests ({pendingRequests.length})
              </h4>
              <div className="space-y-2">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="p-2 bg-amber-50 rounded border border-amber-200 flex items-center justify-between"
                  >
                    <div className="text-sm">
                      <span className="font-medium text-gray-800">{request.requestedByName}</span>
                      <span className="text-gray-500"> → </span>
                      <span className="font-medium text-gray-800">{request.requestedForName}</span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({request.scope === 'single-vote' ? 'single vote' : 'all votes'})
                      </span>
                    </div>
                    <button
                      onClick={() => handleCancelRequest(request.id)}
                      className="text-red-600 hover:text-red-700 p-1"
                      title="Cancel request"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
});
