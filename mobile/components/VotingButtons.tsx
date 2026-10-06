import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography, touchTargets, voteColors } from '../theme';

type VoteType = 'yea' | 'nay' | 'abstain';

interface VotingButtonsProps {
  onVote: (vote: VoteType) => void;
  currentVote?: VoteType | null;
  disabled?: boolean;
  hasQuorum?: boolean;
}

export const VotingButtons = memo(function VotingButtons({
  onVote,
  currentVote,
  disabled = false,
  hasQuorum = true,
}: VotingButtonsProps) {
  // Without quorum the vote still goes ahead if the chair holds it (the server allows it), so
  // members are warned rather than blocked
  const handleVote = (vote: VoteType) => {
    if (disabled) return;
    onVote(vote);
  };

  return (
    <View style={styles.container}>
      {!hasQuorum && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Quorum not met - this vote may need to be ratified later
          </Text>
        </View>
      )}
      <View style={styles.buttonRow}>
        <VoteButton
          type="yea"
          label="YEA"
          onPress={() => handleVote('yea')}
          isSelected={currentVote === 'yea'}
          disabled={disabled}
        />
        <VoteButton
          type="nay"
          label="NAY"
          onPress={() => handleVote('nay')}
          isSelected={currentVote === 'nay'}
          disabled={disabled}
        />
        <VoteButton
          type="abstain"
          label="ABSTAIN"
          onPress={() => handleVote('abstain')}
          isSelected={currentVote === 'abstain'}
          disabled={disabled}
        />
      </View>
      {currentVote && <Text style={styles.voteStatus}>Your vote: {currentVote.toUpperCase()}</Text>}
    </View>
  );
});

interface VoteButtonProps {
  type: VoteType;
  label: string;
  onPress: () => void;
  isSelected: boolean;
  disabled: boolean;
}

const VoteButton = memo(function VoteButton({
  type,
  label,
  onPress,
  isSelected,
  disabled,
}: VoteButtonProps) {
  const buttonColors = {
    yea: {
      bg: isSelected ? voteColors.yea : voteColors.yeaBg,
      text: isSelected ? colors.white : voteColors.yea,
      pressed: voteColors.yeaPressed,
    },
    nay: {
      bg: isSelected ? voteColors.nay : voteColors.nayBg,
      text: isSelected ? colors.white : voteColors.nay,
      pressed: voteColors.nayPressed,
    },
    abstain: {
      bg: isSelected ? voteColors.abstain : voteColors.abstainBg,
      text: isSelected ? colors.white : voteColors.abstain,
      pressed: voteColors.abstainPressed,
    },
  };

  const colorScheme = buttonColors[type];

  // Accessibility labels for screen readers
  const accessibilityLabel = `Vote ${label}${isSelected ? ', currently selected' : ''}`;
  const accessibilityHint = isSelected
    ? 'Double tap to change your vote'
    : `Double tap to vote ${label}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected: isSelected }}
      style={({ pressed }) => [
        styles.voteButton,
        { backgroundColor: pressed ? colorScheme.pressed : colorScheme.bg },
        isSelected && styles.voteButtonSelected,
        disabled && styles.voteButtonDisabled,
      ]}
    >
      <Text
        style={[
          styles.voteButtonText,
          { color: colorScheme.text },
          disabled && styles.voteButtonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  warningBanner: {
    backgroundColor: colors.warning[100],
    padding: spacing[3],
    borderRadius: borderRadius.default,
    marginBottom: spacing[3],
  },
  warningText: {
    color: colors.warning[700],
    fontSize: typography.sm.fontSize,
    textAlign: 'center',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  voteButton: {
    flex: 1,
    minHeight: touchTargets.large,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.default,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  voteButtonSelected: {
    transform: [{ scale: 1.02 }],
  },
  voteButtonDisabled: {
    opacity: 0.5,
  },
  voteButtonText: {
    fontSize: typography.lg.fontSize,
    fontWeight: '700',
    letterSpacing: 1,
  },
  voteButtonTextDisabled: {
    opacity: 0.7,
  },
  voteStatus: {
    marginTop: spacing[3],
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    textAlign: 'center',
    fontWeight: '500',
  },
});
