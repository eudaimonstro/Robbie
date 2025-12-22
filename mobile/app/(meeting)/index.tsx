import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSocket } from '../../context/SocketContext';
import { useQuorumStatus } from '../../hooks/useQuorumStatus';
import { Card, Button } from '../../components/ui';
import { VotingButtons } from '../../components/VotingButtons';
import { MotionCard } from '../../components/MotionCard';
import { QuorumBanner } from '../../components/QuorumBanner';
import { SpeakerQueueSection } from '../../components/SpeakerQueue';
import { colors, spacing, typography, borderRadius } from '../../theme';
import type { MeetingAction, DebateStance } from '@robbie/shared/types';

export default function MeetingScreen() {
  const router = useRouter();
  const { state, dispatch, currentUser, isConnected, logout, reconnect } = useSocket();

  // Get quorum status
  const { presentCount, hasQuorum } = useQuorumStatus(
    state.members,
    state.quorum,
    { proxiesCountForQuorum: state.proxiesCountForQuorum, proxies: state.proxies }
  );

  // Check if user has voted
  const currentVote = useMemo(() => {
    if (!state.currentMotion || !currentUser || !state.votingOpen) {
      return null;
    }
    return state.voterChoices[currentUser.id] || null;
  }, [state.currentMotion, currentUser, state.votingOpen, state.voterChoices]);

  // Check if voting is open for this user
  const canVote = useMemo(() => {
    if (!state.currentMotion || !currentUser) return false;
    if (!state.votingOpen) return false;
    // Check if member has voting rights
    return currentUser.present;
  }, [state.currentMotion, currentUser, state.votingOpen]);

  // Handle vote
  const handleVote = useCallback(
    async (vote: 'yea' | 'nay' | 'abstain') => {
      if (!state.currentMotion || !currentUser) return;

      const action: MeetingAction = {
        type: 'CAST_VOTE',
        vote,
        voterId: currentUser.id,
        timestamp: new Date().toISOString(),
      };

      await dispatch(action);
    },
    [state.currentMotion, currentUser, dispatch]
  );

  // Handle raise/lower hand
  const isHandRaised = useMemo(() => {
    if (!currentUser) return false;
    return state.speakerQueue.some((s) => s.member.id === currentUser.id);
  }, [state.speakerQueue, currentUser]);

  // Refresh handler
  const onRefresh = useCallback(() => {
    if (!isConnected) {
      reconnect();
    }
  }, [isConnected, reconnect]);

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} />
        }
      >
        {/* Connection status */}
        {!isConnected && (
          <View style={styles.disconnectedBanner}>
            <Text style={styles.disconnectedText}>Disconnected</Text>
            <Button title="Reconnect" onPress={reconnect} size="sm" />
          </View>
        )}

        {/* Meeting status */}
        {!state.meetingActive && (
          <Card style={styles.statusCard}>
            <Text style={styles.statusTitle}>Meeting Not Started</Text>
            <Text style={styles.statusSubtitle}>
              Waiting for the chair to start the meeting
            </Text>
          </Card>
        )}

        {/* Quorum warning */}
        {state.meetingActive && (
          <QuorumBanner
            presentCount={presentCount}
            quorum={state.quorum}
            hasQuorum={hasQuorum}
          />
        )}

        {/* Current motion and voting */}
        {state.currentMotion && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Motion</Text>
            <MotionCard motion={state.currentMotion} votingOpen={state.votingOpen} />

            {/* Voting buttons if voting is open */}
            {state.votingOpen && canVote && (
              <View style={styles.votingSection}>
                <Text style={styles.votingTitle}>Cast Your Vote</Text>
                <VotingButtons
                  onVote={handleVote}
                  currentVote={currentVote}
                  disabled={!hasQuorum}
                  hasQuorum={hasQuorum}
                />
              </View>
            )}

            {/* Voting status messages */}
            {state.votingOpen && !canVote && (
              <View style={styles.infoCard}>
                <Text style={styles.infoText}>
                  Voting in progress - you cannot vote at this time
                </Text>
              </View>
            )}

            {!state.votingOpen && state.currentMotion.status === 'active' && (
              <View style={styles.infoCard}>
                <Text style={styles.infoText}>
                  Motion is being debated
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Pending second */}
        {state.pendingSecond && (
          <Card style={styles.pendingSecondCard}>
            <Text style={styles.pendingSecondTitle}>Motion Needs a Second</Text>
            <Text style={styles.pendingSecondText}>
              {state.pendingSecond.text || state.pendingSecond.name}
            </Text>
            <Button
              title="Second This Motion"
              onPress={async () => {
                if (!currentUser) return;
                const action: MeetingAction = {
                  type: 'SECOND_MOTION',
                  seconder: currentUser.name,
                  timestamp: new Date().toISOString(),
                };
                await dispatch(action);
              }}
              disabled={state.pendingSecond.moverId === currentUser.id}
              fullWidth
            />
          </Card>
        )}

        {/* Speaker queue */}
        {state.meetingActive && (
          <SpeakerQueueSection
            state={state}
            currentUser={currentUser}
            dispatch={dispatch}
            isHandRaised={isHandRaised}
          />
        )}

        {/* Actions row */}
        <View style={styles.actionsRow}>
          <Button
            title="Make Motion"
            onPress={() => router.push('/(meeting)/motions')}
            variant="secondary"
            style={styles.actionButton}
          />
          <Button
            title="View Agenda"
            onPress={() => router.push('/(meeting)/agenda')}
            variant="secondary"
            style={styles.actionButton}
          />
        </View>

        {/* User info / Logout */}
        <View style={styles.userSection}>
          <Text style={styles.userName}>{currentUser.name}</Text>
          <Text style={styles.userRole}>{currentUser.role}</Text>
          <Pressable onPress={logout}>
            <Text style={styles.logoutText}>Leave Meeting</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[4],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.base.fontSize,
    color: colors.text.secondary,
  },
  disconnectedBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.danger[50],
    padding: spacing[3],
    borderRadius: borderRadius.default,
    marginBottom: spacing[3],
  },
  disconnectedText: {
    color: colors.danger[700],
    fontWeight: '600',
  },
  statusCard: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  statusTitle: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  statusSubtitle: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
  },
  section: {
    marginBottom: spacing[4],
  },
  sectionTitle: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  votingSection: {
    marginTop: spacing[3],
  },
  votingTitle: {
    fontSize: typography.base.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  infoCard: {
    backgroundColor: colors.gray[100],
    padding: spacing[3],
    borderRadius: borderRadius.default,
    marginTop: spacing[3],
  },
  infoText: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  pendingSecondCard: {
    marginBottom: spacing[4],
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  pendingSecondTitle: {
    fontSize: typography.base.fontSize,
    fontWeight: '600',
    color: colors.warning[800],
    marginBottom: spacing[2],
  },
  pendingSecondText: {
    fontSize: typography.sm.fontSize,
    color: colors.warning[700],
    marginBottom: spacing[3],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[6],
  },
  actionButton: {
    flex: 1,
  },
  userSection: {
    alignItems: 'center',
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  userName: {
    fontSize: typography.base.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
  },
  userRole: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    textTransform: 'capitalize',
    marginBottom: spacing[3],
  },
  logoutText: {
    fontSize: typography.sm.fontSize,
    color: colors.danger[600],
    fontWeight: '500',
  },
});
