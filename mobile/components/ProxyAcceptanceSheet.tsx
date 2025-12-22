import { memo, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Pressable, ScrollView } from 'react-native';
import { colors, spacing, typography, borderRadius, touchTargets } from '../theme';
import type { MeetingState, MeetingAction, Member, PendingProxyRequest } from '@robbie/shared/types';
import { generateId, generateTimestamp } from '@robbie/shared/utils';
import { Button } from './ui';

interface ProxyAcceptanceSheetProps {
  state: MeetingState;
  currentUser: Member;
  dispatch: (action: MeetingAction) => Promise<boolean>;
}

export const ProxyAcceptanceSheet = memo(function ProxyAcceptanceSheet({
  state,
  currentUser,
  dispatch,
}: ProxyAcceptanceSheetProps) {
  // Get pending requests directed to this user
  const pendingRequestsToMe = useMemo(() => {
    return state.pendingProxyRequests.filter(
      r => r.requestedFor === currentUser.id && r.status === 'pending'
    );
  }, [state.pendingProxyRequests, currentUser.id]);

  // Don't render if proxy voting or member grants aren't enabled
  if (!state.allowProxyVoting || !state.allowMemberProxyGrant) {
    return null;
  }

  // Don't render if no pending requests
  if (pendingRequestsToMe.length === 0) {
    return null;
  }

  // Check if user can accept more proxies
  const currentProxyCount = state.proxies.filter(p => p.grantedTo === currentUser.id).length;
  const canAcceptMore = state.maxProxiesPerMember === 0 || currentProxyCount < state.maxProxiesPerMember;

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLabel={`You have ${pendingRequestsToMe.length} pending proxy request${pendingRequestsToMe.length > 1 ? 's' : ''}`}
    >
      <Text style={styles.title}>
        Proxy Request{pendingRequestsToMe.length > 1 ? 's' : ''} ({pendingRequestsToMe.length})
      </Text>

      {!canAcceptMore && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            You've reached the maximum number of proxies ({state.maxProxiesPerMember}).
          </Text>
        </View>
      )}

      <ScrollView style={styles.requestsList} nestedScrollEnabled>
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
      </ScrollView>
    </View>
  );
});

interface ProxyRequestCardProps {
  request: PendingProxyRequest;
  dispatch: (action: MeetingAction) => Promise<boolean>;
  canAccept: boolean;
  maxProxies: number;
  currentProxyCount: number;
}

const ProxyRequestCard = memo(function ProxyRequestCard({
  request,
  dispatch,
  canAccept,
  maxProxies,
  currentProxyCount,
}: ProxyRequestCardProps) {
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = useCallback(async () => {
    if (isSubmitting || !canAccept) return;

    setIsSubmitting(true);
    try {
      await dispatch({
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
      await dispatch({
        type: 'DECLINE_PROXY',
        requestId: request.id,
        reason: declineReason.trim() || undefined,
        timestamp: generateTimestamp()
      });
    } finally {
      setIsSubmitting(false);
      setShowDeclineModal(false);
      setDeclineReason('');
    }
  }, [dispatch, request.id, declineReason, isSubmitting]);

  const requestedAt = new Date(request.requestedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.requesterName}>{request.requestedByName}</Text>
          <Text style={styles.requestDescription}>
            requests you to vote on their behalf
          </Text>
          <Text style={styles.scopeBadge}>
            {request.scope === 'single-vote' ? 'Single vote only' : 'All votes'}
          </Text>
          <Text style={styles.timestamp}>Requested at {requestedAt}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <Button
          title={isSubmitting ? 'Processing...' : 'Accept'}
          onPress={handleAccept}
          disabled={isSubmitting || !canAccept}
          loading={isSubmitting}
          variant="primary"
          size="sm"
        />
        <Button
          title="Decline"
          onPress={() => setShowDeclineModal(true)}
          disabled={isSubmitting}
          variant="danger"
          size="sm"
        />
      </View>

      {!canAccept && (
        <Text style={styles.maxProxiesNote}>
          You currently hold {currentProxyCount}/{maxProxies} proxies.
        </Text>
      )}

      {/* Decline Modal */}
      <Modal
        visible={showDeclineModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeclineModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDeclineModal(false)}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Decline Proxy Request</Text>
            <Text style={styles.modalDescription}>
              Optionally provide a reason for declining {request.requestedByName}'s request.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason (optional)"
              value={declineReason}
              onChangeText={(text) => setDeclineReason(text.slice(0, 200))}
              maxLength={200}
              multiline
              numberOfLines={2}
            />
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={() => {
                  setShowDeclineModal(false);
                  setDeclineReason('');
                }}
                variant="secondary"
                size="sm"
              />
              <Button
                title="Confirm Decline"
                onPress={handleDecline}
                disabled={isSubmitting}
                loading={isSubmitting}
                variant="danger"
                size="sm"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.primary[300],
    padding: spacing[4],
  },
  title: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.primary[800],
    marginBottom: spacing[3],
  },
  warningBanner: {
    backgroundColor: colors.warning[100],
    padding: spacing[2],
    borderRadius: borderRadius.default,
    marginBottom: spacing[3],
  },
  warningText: {
    fontSize: typography.sm.fontSize,
    color: colors.warning[700],
    textAlign: 'center',
  },
  requestsList: {
    maxHeight: 300,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.default,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  cardHeader: {
    marginBottom: spacing[3],
  },
  cardInfo: {
    flex: 1,
  },
  requesterName: {
    fontSize: typography.base.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[0.5],
  },
  requestDescription: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  scopeBadge: {
    fontSize: typography.xs.fontSize,
    color: colors.primary[600],
    backgroundColor: colors.primary[100],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing[1],
  },
  timestamp: {
    fontSize: typography.xs.fontSize,
    color: colors.text.muted,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  maxProxiesNote: {
    fontSize: typography.xs.fontSize,
    color: colors.warning[600],
    marginTop: spacing[2],
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  modalDescription: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.default,
    padding: spacing[3],
    fontSize: typography.base.fontSize,
    color: colors.text.primary,
    minHeight: touchTargets.large,
    textAlignVertical: 'top',
    marginBottom: spacing[3],
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
  },
});
