import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Motion } from '@robbie-bylawyer/shared/types';
import { Card } from './ui';
import { colors, spacing, typography, borderRadius } from '../theme';

interface MotionCardProps {
  motion: Motion;
  votingOpen?: boolean;
}

export const MotionCard = memo(function MotionCard({
  motion,
  votingOpen = false,
}: MotionCardProps) {
  // Determine status badge based on motion.status and votingOpen
  const getStatusBadge = () => {
    if (votingOpen) {
      return { label: 'VOTING', color: colors.primary[600], bg: colors.primary[50] };
    }
    if (motion.status === 'active') {
      return { label: 'DEBATING', color: colors.warning[600], bg: colors.warning[50] };
    }
    if (motion.status === 'pending') {
      return { label: 'PENDING', color: colors.gray[600], bg: colors.gray[100] };
    }
    return null;
  };

  const statusBadge = getStatusBadge();

  return (
    <Card variant="elevated" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.typeContainer}>
          <Text style={styles.typeLabel}>{motion.name}</Text>
          {statusBadge && (
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
              <Text style={[styles.statusText, { color: statusBadge.color }]}>
                {statusBadge.label}
              </Text>
            </View>
          )}
        </View>
        {motion.mover && <Text style={styles.mover}>Moved by: {motion.mover}</Text>}
        {motion.secondedBy && <Text style={styles.seconder}>Seconded by: {motion.secondedBy}</Text>}
      </View>

      {motion.text && (
        <View style={styles.content}>
          <Text style={styles.motionText}>{motion.text}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Vote Required:</Text>
          <Text style={styles.infoValue}>
            {motion.vote === 'majority'
              ? 'Majority'
              : motion.vote === '2/3'
                ? 'Two-Thirds'
                : 'None'}
          </Text>
        </View>
        {motion.debatable && (
          <View style={[styles.chip, styles.chipDebatable]}>
            <Text style={styles.chipText}>Debatable</Text>
          </View>
        )}
        {motion.amendable && (
          <View style={[styles.chip, styles.chipAmendable]}>
            <Text style={styles.chipText}>Amendable</Text>
          </View>
        )}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing[3],
  },
  header: {
    marginBottom: spacing[3],
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  typeLabel: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.xs.fontSize,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  mover: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
  },
  seconder: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
  },
  content: {
    backgroundColor: colors.gray[50],
    padding: spacing[3],
    borderRadius: borderRadius.default,
    marginBottom: spacing[3],
  },
  motionText: {
    fontSize: typography.base.fontSize,
    color: colors.text.primary,
    lineHeight: typography.base.lineHeight,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  infoLabel: {
    fontSize: typography.sm.fontSize,
    color: colors.text.muted,
    marginRight: spacing[1],
  },
  infoValue: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },
  chipDebatable: {
    backgroundColor: colors.primary[100],
  },
  chipAmendable: {
    backgroundColor: colors.success[100],
  },
  chipText: {
    fontSize: typography.xs.fontSize,
    fontWeight: '500',
    color: colors.text.secondary,
  },
});
