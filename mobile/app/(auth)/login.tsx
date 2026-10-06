import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../context/SessionContext';
import { Button, Input, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';

export default function LoginScreen() {
  const router = useRouter();
  const { requestCode } = useSession();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string }>({});

  const validateForm = () => {
    const errors: typeof validationErrors = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);
    try {
      const address = email.trim();
      await requestCode(address);
      router.push({ pathname: '/(auth)/verify', params: { email: address } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't send the code";
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Sign In</Text>
            <Text style={styles.subtitle}>Enter your email to sign in</Text>
          </View>

          <Card style={styles.card}>
            <Input
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setValidationErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={validationErrors.email}
              containerStyle={styles.inputContainer}
            />

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              title={isLoading ? 'Sending Code...' : 'Send Verification Code'}
              onPress={handleSubmit}
              loading={isLoading}
              disabled={isLoading}
              fullWidth
              size="lg"
            />
          </Card>

          <Text style={styles.footer}>A 6-digit code will be sent to your email</Text>
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    padding: spacing[4],
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
    marginBottom: spacing[4],
  },
  inputContainer: {
    marginBottom: spacing[4],
  },
  errorBanner: {
    backgroundColor: colors.danger[50],
    borderRadius: 8,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorText: {
    color: colors.danger[600],
    fontSize: typography.sm.fontSize,
    textAlign: 'center',
  },
  footer: {
    fontSize: typography.sm.fontSize,
    color: colors.text.muted,
    textAlign: 'center',
  },
});
