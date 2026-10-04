import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { useAppSettings } from '../state/AppSettings';
import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface ExplainCardProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /**
   * `whatHappened` cards follow Explain Mode (hidden when it is off);
   * `concept` cards are always available, e.g. in Bitcoin Lab.
   */
  kind?: 'whatHappened' | 'concept';
}

export function ExplainCard({
  title,
  children,
  defaultOpen = false,
  kind = 'concept',
}: ExplainCardProps) {
  const { explainMode } = useAppSettings();
  const [open, setOpen] = useState(defaultOpen);

  if (kind === 'whatHappened' && !explainMode) {
    return null;
  }

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(value => !value);
  };

  return (
    <View style={[styles.card, kind === 'whatHappened' && styles.highlight]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={
          open ? 'Collapses the explanation' : 'Expands the explanation'
        }
        accessibilityState={{ expanded: open }}
        style={styles.header}
        hitSlop={8}
      >
        <View style={styles.iconBubble}>
          <Icon
            name={kind === 'whatHappened' ? 'info' : 'key'}
            size={18}
            color={colors.primaryPressed}
          />
        </View>
        <AppText variant="bodyStrong" style={styles.title}>
          {title}
        </AppText>
        <View style={open && styles.rotated}>
          <Icon name="chevronDown" size={18} color={colors.textMuted} />
        </View>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

/** A paragraph inside an ExplainCard. */
export function ExplainText({ children }: { children: React.ReactNode }) {
  return <AppText color="textMuted">{children}</AppText>;
}

/** Convenience for the "What just happened?" pattern after an action. */
export function WhatJustHappened({ children }: { children: React.ReactNode }) {
  return (
    <ExplainCard title="What just happened?" kind="whatHappened" defaultOpen>
      {typeof children === 'string' ? (
        <ExplainText>{children}</ExplainText>
      ) : (
        children
      )}
    </ExplainCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  highlight: {
    borderColor: colors.primary,
    backgroundColor: '#FFFBF8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  rotated: { transform: [{ rotate: '180deg' }] },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
});
