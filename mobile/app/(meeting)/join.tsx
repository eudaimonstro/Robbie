import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../context/SessionContext';
import { useSocket } from '../../context/SocketContext';
import { Button, Input, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';

const MEETING_CODE = /^[A-Z0-9]{4,8}$/;

/** Join a live meeting by its code */
export default function JoinScreen() {
  const { user, signOut } = useSession();
  const { joinMeeting, meetingCode, isConnected, error } = useSocket();

  const [code, setCode] = useState('');
  const [validationError, setValidationError] = useState<string | undefined>();

  // A code is set but the meeting hasn't answered yet
  const isJoining = !!meetingCode && !isConnected && !error;

  const handleSubmit = () => {
    const normalized = code.trim().toUpperCase();
    if (!MEETING_CODE.test(normalized)) {
      setValidationError('Meeting codes are 4 to 8 letters or digits');
      return;
    }
    joinMeeting(normalized);
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
              {user?.name ? `Signed in as ${user.name}. ` : ''}Enter the code from the chair
            </Text>
          </View>

          <Card style={styles.card}>
            <Input
              label="Meeting code"
              value={code}
              onChangeText={(text) => {
                setCode(text.toUpperCase());
                setValidationError(undefined);
              }}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              error={validationError}
              containerStyle={styles.inputContainer}
            />

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              title={isJoining ? 'Joining...' : 'Join meeting'}
              onPress={handleSubmit}
              loading={isJoining}
              disabled={isJoining}
              fullWidth
              size="lg"
            />
          </Card>

          <Button
            title="Sign out"
            onPress={() => void signOut()}
            variant="ghost"
            style={styles.signOut}
          />
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
  signOut: {
    marginTop: spacing[2],
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
});
