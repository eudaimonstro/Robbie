import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../context/SessionContext';
import { Button, Card } from '../components/ui';
import { colors, spacing, typography } from '../theme';

/** Shown when there is a saved session but the server can't be reached to check it */
export default function OfflineScreen() {
  const { retry, signOut } = useSession();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retry();
      // Navigation happens automatically via root layout once the session is checked
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Can't reach the server</Text>
          <Text style={styles.subtitle}>Check your connection and try again.</Text>
        </View>

        <Card style={styles.card}>
          <Button
            title={isRetrying ? 'Trying...' : 'Try again'}
            onPress={handleRetry}
            loading={isRetrying}
            disabled={isRetrying}
            fullWidth
            size="lg"
          />
        </Card>

        {/* A way out if the server stays unreachable, e.g. it moved; signing in again needs it too */}
        <Button title="Sign out" onPress={signOut} disabled={isRetrying} variant="ghost" />
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
});
