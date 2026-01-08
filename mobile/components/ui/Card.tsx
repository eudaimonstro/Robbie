import { View, StyleSheet, ViewStyle, ViewProps } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  style,
  ...props
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        styles[variant],
        styles[`${padding}Padding`],
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
  },

  // Variants
  default: {
    ...shadows.default,
  },
  elevated: {
    ...shadows.md,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.gray[200],
  },

  // Padding
  nonePadding: {
    padding: 0,
  },
  smPadding: {
    padding: spacing[3],
  },
  mdPadding: {
    padding: spacing[4],
  },
  lgPadding: {
    padding: spacing[6],
  },
});
