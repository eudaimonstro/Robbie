import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSocket } from '../../context/SocketContext';
import { Card } from '../../components/ui';
import { colors, spacing, typography, borderRadius } from '../../theme';

// Meeting stage display names
const STAGE_LABELS: Record<string, string> = {
  'not-started': 'Not Started',
  'call-to-order': 'Call to Order',
  'minutes-approval': 'Approval of Minutes',
  'reports': 'Reports',
  'special-orders': 'Special Orders',
  'unfinished-business': 'Unfinished Business',
  'new-business': 'New Business',
  'announcements': 'Announcements',
  'adjourned': 'Adjourned',
};

export default function AgendaScreen() {
  const { state } = useSocket();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Meeting Agenda</Text>

        {state.agenda.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No agenda items</Text>
          </Card>
        ) : (
          <Card padding="none">
            {state.agenda.map((item, index) => {
              const isCompleted = item.status === 'completed';
              const isCurrent = state.currentAgendaItem?.id === item.id;

              return (
                <View
                  key={item.id}
                  style={[
                    styles.agendaItem,
                    index < state.agenda.length - 1 && styles.agendaItemBorder,
                    isCompleted && styles.agendaItemCompleted,
                    isCurrent && styles.agendaItemCurrent,
                  ]}
                >
                  <View style={styles.itemNumber}>
                    <Text style={styles.itemNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.itemContent}>
                    <Text
                      style={[
                        styles.itemTitle,
                        isCompleted && styles.itemTitleCompleted,
                      ]}
                    >
                      {item.title}
                    </Text>
                  </View>
                  {isCompleted && (
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedText}>Done</Text>
                    </View>
                  )}
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentText}>Current</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        {/* Meeting Stage */}
        {state.meetingStage && state.meetingStage !== 'not-started' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Meeting Stage</Text>
            <Card>
              <Text style={styles.orderText}>
                {STAGE_LABELS[state.meetingStage] || state.meetingStage}
              </Text>
            </Card>
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
  emptyText: {
    fontSize: typography.base.fontSize,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  agendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
  },
  agendaItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  agendaItemCompleted: {
    backgroundColor: colors.gray[50],
  },
  agendaItemCurrent: {
    backgroundColor: colors.primary[50],
  },
  itemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  itemNumberText: {
    fontSize: typography.sm.fontSize,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: typography.base.fontSize,
    fontWeight: '500',
    color: colors.text.primary,
  },
  itemTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.text.muted,
  },
  itemDescription: {
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  completedBadge: {
    backgroundColor: colors.success[100],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
  completedText: {
    fontSize: typography.xs.fontSize,
    fontWeight: '500',
    color: colors.success[700],
  },
  currentBadge: {
    backgroundColor: colors.primary[100],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
  currentText: {
    fontSize: typography.xs.fontSize,
    fontWeight: '500',
    color: colors.primary[700],
  },
  section: {
    marginTop: spacing[6],
  },
  sectionTitle: {
    fontSize: typography.lg.fontSize,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  orderText: {
    fontSize: typography.base.fontSize,
    color: colors.text.secondary,
  },
});
