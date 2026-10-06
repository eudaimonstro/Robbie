import { memo, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors, spacing, typography, borderRadius, touchTargets } from '../theme';
import type {
  MeetingState,
  MeetingAction,
  Member,
  PendingProxyRequest,
} from '@robbie-bylawyer/shared/types';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import { Card, Button } from './ui';

interface ProxyRequestPanelProps {
  state: MeetingState;
  currentUser: Member;
  dispatch: (action: MeetingAction) => Promise<boolean>;
}

export const ProxyRequestPanel = memo(function ProxyRequestPanel({
  state,
  currentUser,
  dispatch,
}: ProxyRequestPanelProps) {
  const [selectedHolder, setSelectedHolder] = useState<number | null>(null);
  const [proxyScope, setProxyScope] = useState<'all' | 'single-vote'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user already has an active proxy
  const hasActiveProxy = useMemo(() => {
    return state.proxies.some((p) => p.grantedBy === currentUser.id);
  }, [state.proxies, currentUser.id]);

  // Get user's active proxy details
  const activeProxy = useMemo(() => {
    return state.proxies.find((p) => p.grantedBy === currentUser.id);
  }, [state.proxies, currentUser.id]);

  // Check if user has a pending proxy request
  const pendingRequest = useMemo(() => {
    return state.pendingProxyRequests.find(
      (r) => r.requestedBy === currentUser.id && r.status === 'pending',
    );
  }, [state.pendingProxyRequests, currentUser.id]);

  // Get eligible proxy holders
  const eligibleHolders = useMemo(() => {
    return state.members.filter((m) => {
      if (!m.present) return false;
      if (m.id === currentUser.id) return false;
      if (state.maxProxiesPerMember === 0) return true;
      const currentCount = state.proxies.filter((p) => p.grantedTo === m.id).length;
      return currentCount < state.maxProxiesPerMember;
    });
  }, [state.members, state.proxies, state.maxProxiesPerMember, currentUser.id]);

  // Don't show if proxy voting or member grants aren't enabled
  if (!state.allowProxyVoting || !state.allowMemberProxyGrant) {
    return null;
  }

  // Don't show if user is present
  if (currentUser.present) {
    return null;
  }

  const handleRequestProxy = useCallback(async () => {
    if (!selectedHolder || isSubmitting) return;

    const holder = state.members.find((m) => m.id === selectedHolder);
    if (!holder) return;

    setIsSubmitting(true);
    try {
      await dispatch({
        type: 'REQUEST_PROXY',
        requestId: generateId(),
        requestedBy: currentUser.id,
        requestedByName: currentUser.name,
        requestedFor: selectedHolder,
        requestedForName: holder.name,
        scope: proxyScope,
        timestamp: generateTimestamp(),
      });
      setSelectedHolder(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [dispatch, currentUser, selectedHolder, proxyScope, state.members, isSubmitting]);

  const handleCancelRequest = useCallback(async () => {
    if (!pendingRequest) return;

    await dispatch({
      type: 'CANCEL_PROXY_REQUEST',
      requestId: pendingRequest.id,
      timestamp: generateTimestamp(),
    });
  }, [dispatch, pendingRequest]);

  // Show active proxy status
  if (hasActiveProxy && activeProxy) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Proxy Active</Text>
        <Card style={styles.activeCard}>
          <Text style={styles.activeText}>
            <Text style={styles.holderName}>{activeProxy.grantedToName}</Text>
            {' holds your proxy'}
          </Text>
          <Text style={styles.scopeText}>
            {activeProxy.scope === 'single-vote' ? 'Single vote only' : 'All votes'}
          </Text>
        </Card>
      </View>
    );
  }

  // Show pending request status
  if (pendingRequest) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Proxy Request Pending</Text>
        <Card style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            Waiting for <Text style={styles.holderName}>{pendingRequest.requestedForName}</Text> to
            accept
          </Text>
          <Text style={styles.scopeText}>
            {pendingRequest.scope === 'single-vote' ? 'Single vote only' : 'All votes'}
          </Text>
          <Button title="Cancel Request" onPress={handleCancelRequest} variant="secondary" />
        </Card>
      </View>
    );
  }

  // Show request form
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Request Proxy</Text>
      <Card>
        <Text style={styles.description}>
          You're marked as absent. Request another member to vote on your behalf.
        </Text>

        {eligibleHolders.length === 0 ? (
          <Text style={styles.noHoldersText}>
            No eligible members available to hold your proxy.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Select Proxy Holder</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedHolder}
                onValueChange={(value) => setSelectedHolder(value)}
                style={styles.picker}
                accessibilityLabel="Select proxy holder"
              >
                <Picker.Item label="Select a member..." value={null} />
                {eligibleHolders.map((m) => {
                  const proxyCount = state.proxies.filter((p) => p.grantedTo === m.id).length;
                  const label =
                    proxyCount > 0
                      ? `${m.name} (${proxyCount} proxy${proxyCount > 1 ? 'ies' : ''})`
                      : m.name;
                  return <Picker.Item key={m.id} label={label} value={m.id} />;
                })}
              </Picker>
            </View>

            <Text style={styles.label}>Scope</Text>
            <View style={styles.scopeRow}>
              <ScopeButton
                label="All Votes"
                isSelected={proxyScope === 'all'}
                onPress={() => setProxyScope('all')}
              />
              <ScopeButton
                label="Single Vote"
                isSelected={proxyScope === 'single-vote'}
                onPress={() => setProxyScope('single-vote')}
              />
            </View>

            <Button
              title={isSubmitting ? 'Sending...' : 'Send Request'}
              onPress={handleRequestProxy}
              disabled={!selectedHolder || isSubmitting}
              loading={isSubmitting}
              fullWidth
            />
          </>
        )}

        <DeclinedRequestsHistory
          requests={state.pendingProxyRequests.filter(
            (r) => r.requestedBy === currentUser.id && r.status === 'declined',
          )}
        />
      </Card>
    </View>
  );
});

// Scope selection button
interface ScopeButtonProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const ScopeButton = memo(function ScopeButton({ label, isSelected, onPress }: ScopeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={`${label}${isSelected ? ', selected' : ''}`}
      style={[styles.scopeButton, isSelected && styles.scopeButtonSelected]}
    >
      <Text style={[styles.scopeButtonText, isSelected && styles.scopeButtonTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
});

// Declined requests history
function DeclinedRequestsHistory({ requests }: { requests: PendingProxyRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <View style={styles.historyContainer}>
      <Text style={styles.historyTitle}>Recent declined requests:</Text>
      {requests.slice(0, 3).map((req) => (
        <Text key={req.id} style={styles.historyItem}>
          {req.requestedForName} declined
          {req.declineReason && `: "${req.declineReason}"`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  title: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  description: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  label: {
    fontSize: typography.sm.fontSize,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.default,
    marginBottom: spacing[3],
    overflow: 'hidden',
  },
  picker: {
    height: touchTargets.button,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  scopeButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.default,
    borderWidth: 2,
    borderColor: colors.gray[200],
    alignItems: 'center',
  },
  scopeButtonSelected: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  scopeButtonText: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
  },
  scopeButtonTextSelected: {
    color: colors.primary[600],
    fontWeight: '600',
  },
  activeCard: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
    borderWidth: 1,
  },
  activeText: {
    fontSize: typography.base.fontSize,
    color: colors.success[800],
    marginBottom: spacing[1],
  },
  holderName: {
    fontWeight: '600',
  },
  scopeText: {
    fontSize: typography.sm.fontSize,
    color: colors.text.muted,
  },
  pendingCard: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
    borderWidth: 1,
  },
  pendingText: {
    fontSize: typography.base.fontSize,
    color: colors.warning[800],
    marginBottom: spacing[1],
  },
  noHoldersText: {
    fontSize: typography.sm.fontSize,
    color: colors.text.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing[4],
  },
  historyContainer: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  historyTitle: {
    fontSize: typography.xs.fontSize,
    color: colors.text.muted,
    marginBottom: spacing[1],
  },
  historyItem: {
    fontSize: typography.xs.fontSize,
    color: colors.gray[400],
  },
});
