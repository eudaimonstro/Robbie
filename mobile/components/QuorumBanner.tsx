import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../theme';

interface QuorumBannerProps {
  presentCount: number;
  quorum: number;
  hasQuorum: boolean;
}

export const QuorumBanner = memo(function QuorumBanner({ presentCount, quorum, hasQuorum }: QuorumBannerProps) {
  if (hasQuorum) return null;

  const needed = quorum - presentCount;

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLabel={`Quorum not met. ${presentCount} members present, need ${needed} more. ${quorum} required for quorum.`}
    >
      <View style={styles.iconContainer} accessibilityElementsHidden>
        <Text style={styles.icon}>!</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Quorum Not Met</Text>
        <Text style={styles.subtitle}>
          {presentCount} present, need {needed} more ({quorum} required)
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[100],
    padding: spacing[3],
    borderRadius: borderRadius.default,
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.warning[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  icon: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: typography.base.fontSize,
    fontWeight: '600',
    color: colors.warning[800],
    marginBottom: spacing[0.5],
  },
  subtitle: {
    fontSize: typography.sm.fontSize,
    color: colors.warning[700],
  },
});
