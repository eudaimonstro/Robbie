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
import { useSocket } from '../../context/SocketContext';
import { Button, Input, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login, error } = useSocket();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [meetingCode, setMeetingCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    email?: string;
    name?: string;
    meetingCode?: string;
  }>({});

  const validateForm = () => {
    const errors: typeof validationErrors = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email';
    }

    if (!name.trim()) {
      errors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!meetingCode.trim()) {
      errors.meetingCode = 'Meeting code is required';
    } else if (!/^[A-Za-z0-9]{4,8}$/.test(meetingCode.trim())) {
      errors.meetingCode = 'Meeting code must be 4-8 alphanumeric characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await login(email.trim(), name.trim(), meetingCode.trim().toUpperCase());
      router.push('/(auth)/verify');
    } catch (err) {
      // Error is already set in context
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to send verification code'
      );
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
            <Text style={styles.title}>Join a Meeting</Text>
            <Text style={styles.subtitle}>
              Enter your details to join the meeting
            </Text>
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

            <Input
              label="Your Name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setValidationErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="John Smith"
              autoCapitalize="words"
              autoComplete="name"
              error={validationErrors.name}
              containerStyle={styles.inputContainer}
            />

            <Input
              label="Meeting Code"
              value={meetingCode}
              onChangeText={(text) => {
                setMeetingCode(text.toUpperCase());
                setValidationErrors((prev) => ({ ...prev, meetingCode: undefined }));
              }}
              placeholder="ABC123"
              autoCapitalize="characters"
              maxLength={8}
              error={validationErrors.meetingCode}
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

          <Text style={styles.footer}>
            A 6-digit code will be sent to your email
          </Text>
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
