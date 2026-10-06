import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../context/SessionContext';
import { Button, Card } from '../../components/ui';
import { colors, spacing, typography, borderRadius } from '../../theme';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const router = useRouter();
  const { verify, requestCode } = useSession();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = (Array.isArray(params.email) ? params.email[0] : params.email) ?? '';
  const { width: screenWidth } = useWindowDimensions();

  // Calculate responsive input size based on screen width
  // Account for: padding (16*2), gaps between inputs (8*5), and card padding (16*2)
  const availableWidth = screenWidth - 32 - 32 - 40; // screen padding + card padding + gaps
  const inputSize = Math.min(Math.floor(availableWidth / CODE_LENGTH), 56); // Max 56, scale down on small screens

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<Array<TextInput | null>>(Array(CODE_LENGTH).fill(null));
  // Set while a code is being checked. A ref, since the auto-submit can run from a render whose
  // isLoading is already stale.
  const isSubmittingRef = useRef(false);

  // Start resend cooldown on mount
  useEffect(() => {
    setResendCooldown(60);
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleCodeChange = (value: string, index: number) => {
    // Only allow digits
    const digit = value.replace(/[^0-9]/g, '').slice(-1);

    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Auto-advance to next input
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (digit && index === CODE_LENGTH - 1) {
      const fullCode = newCode.join('');
      if (fullCode.length === CODE_LENGTH) {
        handleSubmit(fullCode);
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (codeToSubmit?: string) => {
    const fullCode = codeToSubmit || code.join('');
    if (fullCode.length !== CODE_LENGTH) {
      Alert.alert('Error', 'Please enter the complete 6-digit code');
      return;
    }
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      await verify(email, fullCode);
      // Navigation happens automatically via root layout once signed in
    } catch (err) {
      // Show the server's message ("That code is wrong or has expired") and start over
      setError(err instanceof Error ? err.message : 'Verification failed');
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    try {
      await requestCode(email);
      setError(null);
      // Reset cooldown on successful resend
      setResendCooldown(60);
      // Clear any existing code
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to resend code. Please try logging in again.',
        [
          { text: 'OK', style: 'cancel' },
          { text: 'Go Back', onPress: () => router.back() },
        ],
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Enter Verification Code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{email ? `\n${email}` : ' your email'}
            </Text>
          </View>

          <Card style={styles.card}>
            <View style={styles.codeContainer}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.codeInput,
                    { width: inputSize, height: inputSize + 12 },
                    digit && styles.codeInputFilled,
                  ]}
                  value={digit}
                  accessibilityLabel={`Digit ${index + 1}`}
                  onChangeText={(value) => handleCodeChange(value, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              title={isLoading ? 'Verifying...' : 'Verify'}
              onPress={() => handleSubmit()}
              loading={isLoading}
              disabled={isLoading || code.join('').length !== CODE_LENGTH}
              fullWidth
              size="lg"
            />
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Didn't receive the code?</Text>
            <Pressable onPress={handleResend} disabled={resendCooldown > 0 || isResending}>
              <Text
                style={[
                  styles.resendText,
                  (resendCooldown > 0 || isResending) && styles.resendDisabled,
                ]}
              >
                {isResending
                  ? 'Sending...'
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend Code'}
              </Text>
            </Pressable>
          </View>

          <Button title="Back to Login" onPress={() => router.back()} variant="ghost" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing[4],
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing[6],
    alignItems: 'center',
  },
  title: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontSize: typography.base.fontSize,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  card: {
    marginBottom: spacing[6],
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[6],
  },
  codeInput: {
    // width and height set dynamically based on screen size
    borderWidth: 2,
    borderColor: colors.gray[300],
    borderRadius: borderRadius.default,
    fontSize: typography['2xl'].fontSize,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text.primary,
    backgroundColor: colors.white,
  },
  codeInputFilled: {
    borderColor: colors.primary[600],
  },
  errorBanner: {
    backgroundColor: colors.danger[50],
    borderRadius: borderRadius.default,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorText: {
    color: colors.danger[600],
    fontSize: typography.sm.fontSize,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  footerText: {
    fontSize: typography.sm.fontSize,
    color: colors.text.muted,
    marginBottom: spacing[1],
  },
  resendText: {
    fontSize: typography.sm.fontSize,
    color: colors.primary[600],
    fontWeight: '600',
  },
  resendDisabled: {
    color: colors.gray[400],
  },
});
