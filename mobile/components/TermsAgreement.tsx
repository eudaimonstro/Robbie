import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getWebUrl } from '../lib/api';
import { colors, spacing, typography } from '../theme';

const AGREEMENT = "I'm 13 or older and I agree to the Terms of Service and Privacy Policy";

/** The agreement to the current terms. The links open the documents on the web. */
export function TermsAgreement({
  agreed,
  onChange,
}: {
  agreed: boolean;
  onChange: (agreed: boolean) => void;
}) {
  const open = (path: string) => {
    void Linking.openURL(`${getWebUrl()}${path}`);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel={AGREEMENT}
        onPress={() => onChange(!agreed)}
        hitSlop={8}
        style={[styles.box, agreed && styles.boxChecked]}
      >
        {agreed && <Text style={styles.check}>✓</Text>}
      </Pressable>
      <Text style={styles.text}>
        I'm 13 or older and I agree to the{' '}
        <Text style={styles.link} accessibilityRole="link" onPress={() => open('/terms')}>
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text style={styles.link} accessibilityRole="link" onPress={() => open('/privacy')}>
          Privacy Policy
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  check: {
    color: colors.white,
    fontWeight: '700',
  },
  text: {
    flex: 1,
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
  },
  link: {
    color: colors.primary[600],
    textDecorationLine: 'underline',
  },
});
