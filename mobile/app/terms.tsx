import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../context/SessionContext';
import { Button, Card } from '../components/ui';
import { TermsAgreement } from '../components/TermsAgreement';
import { colors, spacing, typography } from '../theme';

/**
 * For a signed-in user who hasn't accepted the current terms: they changed since the user last
 * accepted, or the server refused the meeting connection for that reason
 */
export default function TermsScreen() {
  const { acceptTerms, signOut } = useSession();
  const [agreed, setAgreed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!agreed) return;
    setIsSaving(true);
    setError(null);
    try {
      await acceptTerms();
      // Navigation happens automatically via root layout once the terms are accepted
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record your agreement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Before you go on</Text>
          <Text style={styles.subtitle}>
            Robbie needs your agreement to its Terms of Service and Privacy Policy. If you agreed
            before, they have changed since.
          </Text>
        </View>

        <Card style={styles.card}>
          <TermsAgreement agreed={agreed} onChange={setAgreed} />

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button
            title={isSaving ? 'Saving...' : 'Continue'}
            onPress={handleContinue}
            loading={isSaving}
            disabled={isSaving || !agreed}
            fullWidth
            size="lg"
          />
        </Card>

        <Button title="Sign out" onPress={signOut} disabled={isSaving} variant="ghost" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
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
