import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSocket } from '../../context/SocketContext';
import { Button, Card } from '../../components/ui';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { MOTIONS, CATEGORY_INFO } from '@robbie-bylawyer/shared/constants';
import { generateId } from '@robbie-bylawyer/shared/utils/idGenerators';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';

// Motion categories in display order
const CATEGORY_ORDER = ['privileged', 'subsidiary', 'incidental', 'main'] as const;

export default function MotionsScreen() {
  const router = useRouter();
  const { dispatch, currentUser } = useSocket();
  const [selectedMotion, setSelectedMotion] = useState<string | null>(null);
  const [motionText, setMotionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!selectedMotion || !currentUser) return;

    setIsSubmitting(true);
    try {
      const action: MeetingAction = {
        type: 'MAKE_MOTION',
        motionId: generateId(),
        motionType: selectedMotion,
        mover: currentUser.name,
        moverId: currentUser.id,
        text: motionText || '',
        timestamp: new Date().toISOString(),
      };

      const success = await dispatch(action);
      if (success) {
        router.back();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedMotion, currentUser, motionText, dispatch, router]);

  // Group motions by category
  const groupedMotions = useMemo(() => {
    return CATEGORY_ORDER.map((categoryId) => {
      const categoryInfo = CATEGORY_INFO[categoryId];
      const motions = Object.entries(MOTIONS)
        .filter(([, def]) => def.category === categoryId)
        .map(([type, def]) => ({ type, ...def }));
      return {
        id: categoryId,
        label: categoryInfo?.label || categoryId,
        motions,
      };
    }).filter((group) => group.motions.length > 0);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Select a Motion</Text>

        {groupedMotions.map((group) => (
          <View key={group.id} style={styles.category}>
            <Text style={styles.categoryTitle}>{group.label}</Text>
            <Card padding="none">
              {group.motions.map((motion, index) => (
                <View
                  key={motion.type}
                  style={[
                    styles.motionItem,
                    index < group.motions.length - 1 && styles.motionItemBorder,
                    selectedMotion === motion.type && styles.motionItemSelected,
                  ]}
                >
                  <Button
                    title={motion.name}
                    onPress={() => setSelectedMotion(motion.type)}
                    variant={selectedMotion === motion.type ? 'primary' : 'ghost'}
                    fullWidth
                    style={styles.motionButton}
                  />
                </View>
              ))}
            </Card>
          </View>
        ))}

        {selectedMotion && MOTIONS[selectedMotion] && (
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>Motion: {MOTIONS[selectedMotion].name}</Text>
            <TextInput
              style={styles.textInput}
              value={motionText}
              onChangeText={setMotionText}
              placeholder="Enter motion details (optional)"
              placeholderTextColor={colors.gray[400]}
              multiline
              maxLength={500}
            />
            <Text style={styles.charCount}>{motionText.length}/500</Text>

            <View style={styles.buttonRow}>
              <Button
                title="Cancel"
                onPress={() => router.back()}
                variant="secondary"
                style={styles.cancelButton}
              />
              <Button
                title="Submit Motion"
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
                style={styles.submitButton}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[4],
  },
  title: {
    fontSize: typography.xl.fontSize,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
  category: {
    marginBottom: spacing[4],
  },
  categoryTitle: {
    fontSize: typography.sm.fontSize,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing[2],
  },
  motionItem: {
    overflow: 'hidden',
  },
  motionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  motionItemSelected: {
    backgroundColor: colors.primary[50],
  },
  motionButton: {
    justifyContent: 'flex-start',
  },
  formSection: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  formTitle: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  textInput: {
    minHeight: 100,
    padding: spacing[3],
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: borderRadius.default,
    fontSize: typography.base.fontSize,
    color: colors.text.primary,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: typography.xs.fontSize,
    color: colors.text.muted,
    textAlign: 'right',
    marginTop: spacing[1],
    marginBottom: spacing[4],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  cancelButton: {
    flex: 1,
  },
  submitButton: {
    flex: 2,
  },
});
