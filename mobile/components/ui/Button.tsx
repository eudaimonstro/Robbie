import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { colors, spacing, borderRadius, typography, touchTargets } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`${size}Size`],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles[`${variant}Pressed`],
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'ghost' || variant === 'secondary' ? colors.primary[600] : colors.white
          }
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.text,
            styles[`${variant}Text`],
            styles[`${size}Text`],
            isDisabled && styles.disabledText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.default,
    minHeight: touchTargets.button,
  },
  fullWidth: {
    width: '100%',
  },

  // Variants
  primary: {
    backgroundColor: colors.primary[600],
  },
  primaryPressed: {
    backgroundColor: colors.primary[700],
  },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  secondaryPressed: {
    backgroundColor: colors.gray[50],
  },
  danger: {
    backgroundColor: colors.danger[600],
  },
  dangerPressed: {
    backgroundColor: colors.danger[700],
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostPressed: {
    backgroundColor: colors.gray[100],
  },

  // Sizes
  smSize: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    minHeight: touchTargets.minimum,
  },
  mdSize: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  lgSize: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[4],
    minHeight: touchTargets.large,
  },

  // Text styles
  text: {
    fontWeight: '600',
  },
  primaryText: {
    color: colors.white,
  },
  secondaryText: {
    color: colors.gray[700],
  },
  dangerText: {
    color: colors.white,
  },
  ghostText: {
    color: colors.primary[600],
  },
  smText: {
    fontSize: typography.sm.fontSize,
  },
  mdText: {
    fontSize: typography.base.fontSize,
  },
  lgText: {
    fontSize: typography.lg.fontSize,
  },

  // Disabled state
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
});
