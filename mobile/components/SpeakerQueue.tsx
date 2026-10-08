import { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type {
  MeetingState,
  Member,
  MeetingAction,
  DebateStance,
} from '@robbie-bylawyer/shared/types';
import { sortSpeakerQueue } from '@robbie-bylawyer/shared/utils';
import { Card, Button } from './ui';
import { colors, spacing, typography, borderRadius, stanceColors } from '../theme';

// Stance labels for accessibility
const STANCE_LABELS: Record<DebateStance, string> = {
  pro: 'For',
  con: 'Against',
  neutral: 'Neutral',
};

interface SpeakerQueueSectionProps {
  state: MeetingState;
  currentUser: Member;
  dispatch: (action: MeetingAction) => Promise<boolean>;
  isHandRaised: boolean;
}

export const SpeakerQueueSection = memo(function SpeakerQueueSection({
  state,
  currentUser,
  dispatch,
  isHandRaised,
}: SpeakerQueueSectionProps) {
  const [selectedStance, setSelectedStance] = useState<DebateStance>('neutral');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The queue in the order the chair will call it, as the web screens show it
  const queue = useMemo(() => sortSpeakerQueue(state), [state]);
  const queuePosition = queue.findIndex((s) => s.member.id === currentUser.id);

  // Handle raise hand
  const handleRaiseHand = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const action: MeetingAction = {
        type: 'RAISE_HAND',
        member: currentUser,
        stance: selectedStance,
      };
      await dispatch(action);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUser, selectedStance, dispatch]);

  // Handle lower hand
  const handleLowerHand = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const action: MeetingAction = {
        type: 'LOWER_HAND',
        member: currentUser,
      };
      await dispatch(action);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUser, dispatch]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Speaker Recognition</Text>

      <Card style={styles.card}>
        {isHandRaised ? (
          // Hand is raised - show position and lower option
          <View style={styles.raisedState}>
            <View style={styles.positionBadge}>
              <Text style={styles.positionNumber}>{queuePosition + 1}</Text>
              <Text style={styles.positionLabel}>in queue</Text>
            </View>
            <Text style={styles.raisedText}>Your hand is raised</Text>
            <Button
              title="Lower Hand"
              onPress={handleLowerHand}
              variant="secondary"
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
            />
          </View>
        ) : (
          // Hand not raised - show stance selector and raise option
          <View>
            <Text style={styles.stanceLabel}>Select your stance:</Text>
            <View style={styles.stanceRow}>
              <StanceButton
                stance="pro"
                label="For"
                isSelected={selectedStance === 'pro'}
                onPress={() => setSelectedStance('pro')}
              />
              <StanceButton
                stance="con"
                label="Against"
                isSelected={selectedStance === 'con'}
                onPress={() => setSelectedStance('con')}
              />
              <StanceButton
                stance="neutral"
                label="Neutral"
                isSelected={selectedStance === 'neutral'}
                onPress={() => setSelectedStance('neutral')}
              />
            </View>
            <Button
              title="Raise Hand"
              onPress={handleRaiseHand}
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
              size="lg"
            />
          </View>
        )}
      </Card>

      {/* Show current speaker */}
      {state.recognizedSpeaker && (
        <View style={styles.currentSpeaker}>
          <Text style={styles.currentSpeakerLabel}>Now Speaking:</Text>
          <Text style={styles.currentSpeakerName}>{state.recognizedSpeaker.name}</Text>
        </View>
      )}

      {/* Show queue preview */}
      {queue.length > 0 && (
        <View style={styles.queuePreview}>
          <Text style={styles.queueTitle}>Queue ({queue.length})</Text>
          {queue.slice(0, 3).map((entry, index) => (
            <View
              key={entry.member.id}
              style={styles.queueItem}
              accessibilityLabel={`Position ${index + 1}: ${entry.member.name}, speaking ${STANCE_LABELS[entry.stance]}`}
            >
              <Text style={styles.queuePosition}>{index + 1}.</Text>
              <Text style={styles.queueName}>{entry.member.name}</Text>
              <View style={styles.stanceIndicatorRow}>
                <View
                  style={[styles.stanceDot, { backgroundColor: stanceColors[entry.stance] }]}
                  accessibilityElementsHidden
                />
                <Text style={styles.queueStanceText}>{STANCE_LABELS[entry.stance]}</Text>
              </View>
            </View>
          ))}
          {queue.length > 3 && <Text style={styles.queueMore}>+{queue.length - 3} more</Text>}
        </View>
      )}
    </View>
  );
});

interface StanceButtonProps {
  stance: DebateStance;
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const StanceButton = memo(function StanceButton({
  stance,
  label,
  isSelected,
  onPress,
}: StanceButtonProps) {
  const color = stanceColors[stance];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={`${label} stance${isSelected ? ', selected' : ''}`}
      style={[
        styles.stanceButton,
        isSelected && { borderColor: color, backgroundColor: `${color}10` },
      ]}
    >
      <View
        style={[styles.stanceIndicator, { backgroundColor: color }]}
        accessibilityElementsHidden
      />
      <Text style={[styles.stanceButtonText, isSelected && { color, fontWeight: '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  sectionTitle: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  card: {
    marginBottom: spacing[3],
  },
  raisedState: {
    alignItems: 'center',
  },
  positionBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  positionNumber: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: '700',
    color: colors.primary[600],
  },
  positionLabel: {
    fontSize: typography.xs.fontSize,
    color: colors.primary[600],
  },
  raisedText: {
    fontSize: typography.base.fontSize,
    color: colors.text.secondary,
    marginBottom: spacing[4],
  },
  stanceLabel: {
    fontSize: typography.sm.fontSize,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  stanceRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  stanceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.default,
    borderWidth: 2,
    borderColor: colors.gray[200],
    gap: spacing[2],
  },
  stanceIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stanceButtonText: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
  },
  currentSpeaker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50],
    padding: spacing[3],
    borderRadius: borderRadius.default,
    marginBottom: spacing[3],
  },
  currentSpeakerLabel: {
    fontSize: typography.sm.fontSize,
    color: colors.primary[600],
    marginRight: spacing[2],
  },
  currentSpeakerName: {
    fontSize: typography.base.fontSize,
    fontWeight: '600',
    color: colors.primary[700],
  },
  queuePreview: {
    backgroundColor: colors.gray[50],
    padding: spacing[3],
    borderRadius: borderRadius.default,
  },
  queueTitle: {
    fontSize: typography.sm.fontSize,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[1.5],
  },
  queuePosition: {
    width: 24,
    fontSize: typography.sm.fontSize,
    color: colors.text.muted,
  },
  queueName: {
    flex: 1,
    fontSize: typography.sm.fontSize,
    color: colors.text.primary,
  },
  stanceIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  stanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  queueStanceText: {
    fontSize: typography.xs.fontSize,
    color: colors.text.muted,
  },
  queueMore: {
    fontSize: typography.xs.fontSize,
    color: colors.text.muted,
    marginTop: spacing[1],
  },
});
