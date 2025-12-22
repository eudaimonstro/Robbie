import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { colors, spacing, borderRadius, typography, touchTargets } from '../../theme';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  containerStyle,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          isFocused && styles.inputFocused,
          error && styles.inputError,
        ]}
        placeholderTextColor={colors.gray[400]}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: typography.sm.fontSize,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: spacing[1.5],
  },
  input: {
    minHeight: touchTargets.button,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: typography.base.fontSize,
    color: colors.text.primary,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: borderRadius.default,
  },
  inputFocused: {
    borderColor: colors.primary[600],
    borderWidth: 2,
  },
  inputError: {
    borderColor: colors.danger[500],
  },
  error: {
    fontSize: typography.sm.fontSize,
    color: colors.danger[600],
    marginTop: spacing[1],
  },
});
