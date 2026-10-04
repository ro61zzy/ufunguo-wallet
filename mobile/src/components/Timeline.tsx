import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export type StepState = 'done' | 'active' | 'pending';

export interface TimelineStep {
  key: string;
  title: string;
  detail?: string;
  state: StepState;
}

/** Vertical progress list used for confirmations and the send pipeline. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View accessibilityRole="list">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <View
            key={step.key}
            style={styles.row}
            accessible
            accessibilityLabel={`${step.title}: ${
              step.state === 'done'
                ? 'complete'
                : step.state === 'active'
                ? 'in progress'
                : 'waiting'
            }. ${step.detail ?? ''}`}
          >
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  step.state === 'done' && styles.nodeDone,
                  step.state === 'active' && styles.nodeActive,
                ]}
              >
                {step.state === 'done' ? (
                  <Icon
                    name="check"
                    size={14}
                    color={colors.ink}
                    strokeWidth={2.5}
                  />
                ) : null}
              </View>
              {!last ? (
                <View
                  style={[
                    styles.line,
                    step.state === 'done' && styles.lineDone,
                  ]}
                />
              ) : null}
            </View>
            <View style={[styles.text, !last && styles.textSpacing]}>
              <AppText
                variant="bodyStrong"
                color={step.state === 'pending' ? 'textMuted' : 'ink'}
              >
                {step.title}
              </AppText>
              {step.detail ? (
                <AppText variant="caption" color="textMuted">
                  {step.detail}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const NODE = 22;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  rail: { alignItems: 'center', width: NODE },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  nodeActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  line: { flex: 1, width: 2, backgroundColor: colors.border, minHeight: 18 },
  lineDone: { backgroundColor: colors.primary },
  text: { flex: 1, gap: 2 },
  textSpacing: { paddingBottom: spacing.md },
});
