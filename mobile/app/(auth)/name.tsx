import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../context/SessionContext';
import { Button, Input, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';

/** Asked once, after the first sign-in: the name other members see */
export default function NameScreen() {
  const { setName, signOut } = useSession();

  const [name, setNameText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>();

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      setValidationError('Your name must be 2 to 100 characters');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await setName(trimmed);
      // Navigation happens automatically via root layout once the name is set
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your name");
    } finally {
      setIsSaving(false);
    }
  };

  // Signed out, the root layout goes back to the sign-in screen
  const handleDifferentEmail = () => {
    void signOut();
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
            <Text style={styles.title}>Your Name</Text>
            <Text style={styles.subtitle}>This is how other members see you in meetings</Text>
          </View>

          <Card style={styles.card}>
            <Input
              label="Your name"
              value={name}
              onChangeText={(text) => {
                setNameText(text);
                setValidationError(undefined);
              }}
              placeholder="John Smith"
              autoCapitalize="words"
              autoComplete="name"
              maxLength={100}
              error={validationError}
              containerStyle={styles.inputContainer}
            />

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              title={isSaving ? 'Saving...' : 'Continue'}
              onPress={handleSubmit}
              loading={isSaving}
              disabled={isSaving}
              fullWidth
              size="lg"
            />
          </Card>

          <Button
            title="Use a different email"
            onPress={handleDifferentEmail}
            disabled={isSaving}
            variant="ghost"
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
