import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState, StyleSheet, View } from 'react-native';
import type { CreatedWallet } from '../api/types';
import { AppText, Mono } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { WhatJustHappened } from '../components/ExplainCard';
import { Icon } from '../components/Icon';
import { TextField } from '../components/Inputs';
import { KeyValueRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { ErrorState } from '../components/StateViews';
import { explain } from '../content/explanations';
import { queryKeys } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors, radii, spacing } from '../theme/tokens';

type Step = 'intro' | 'show' | 'confirm';

function pickTwoPositions(count: number): [number, number] {
  const first = Math.floor(Math.random() * count);
  let second = Math.floor(Math.random() * (count - 1));
  if (second >= first) {
    second += 1;
  }
  return first < second ? [first, second] : [second, first];
}

export function RecoveryPhraseScreen({
  route,
  navigation,
}: RootScreenProps<'RecoveryPhrase'>) {
  const { walletName } = route.params;
  const { repository, dataSource, selectWallet } = useAppSettings();
  const client = useQueryClient();

  const [step, setStep] = useState<Step>('intro');
  // The phrase is held only in this component's state — not in navigation
  // params, the query cache or storage — and dropped when the screen closes.
  const [created, setCreated] = useState<CreatedWallet | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [answers, setAnswers] = useState(['', '']);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const words = useMemo(() => created?.mnemonic.split(' ') ?? [], [created]);
  const positions = useMemo(
    () =>
      words.length > 1
        ? pickTwoPositions(words.length)
        : ([0, 1] as [number, number]),
    [words],
  );

  // Hide the words if the app goes to the background (app switcher snapshot).
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setHidden(state !== 'active');
    });
    return () => subscription.remove();
  }, []);

  const generate = async () => {
    setCreating(true);
    setError(null);
    try {
      // Called directly rather than through useMutation so the phrase is not
      // retained in TanStack Query's mutation cache.
      const result = await repository.createWallet(walletName);
      setCreated(result);
      setStep('show');
      client.invalidateQueries({ queryKey: queryKeys.wallets(dataSource) });
    } catch (caught) {
      setError(caught);
    } finally {
      setCreating(false);
    }
  };

  const finish = () => {
    const ok = positions.every(
      (position, i) => answers[i].trim().toLowerCase() === words[position],
    );
    if (!ok) {
      setConfirmError(
        'Those words don’t match. Check your written copy and try again.',
      );
      return;
    }
    setCreated(null);
    setAnswers(['', '']);
    selectWallet(walletName);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  if (step === 'intro') {
    return (
      <Screen
        title="Before you see your words"
        edges={['left', 'right', 'bottom']}
        footer={
          <>
            <Button
              label="Generate my recovery phrase"
              onPress={generate}
              loading={creating}
              loadingLabel="Generating phrase…"
              testID="phrase-generate"
            />
            <Button
              label="Back"
              variant="ghost"
              onPress={() => navigation.goBack()}
              disabled={creating}
            />
          </>
        }
      >
        {[
          'Write the 12 words on paper, in order. Do not screenshot them.',
          'Anyone with these words can spend this wallet’s bitcoin.',
          'Ufunguo shows the words once. They are not saved by the app.',
        ].map(line => (
          <Card key={line} style={styles.rule}>
            <Icon name="key" color={colors.primaryPressed} />
            <AppText style={styles.flex}>{line}</AppText>
          </Card>
        ))}
        {error ? (
          <ErrorState error={error} title="Could not create the wallet" />
        ) : null}
      </Screen>
    );
  }

  if (step === 'show' && created) {
    return (
      <Screen
        title="Your recovery phrase"
        subtitle={`Wallet “${created.name}”`}
        edges={['left', 'right', 'bottom']}
        footer={
          <Button
            label="I’ve written them down"
            onPress={() => setStep('confirm')}
            testID="phrase-written"
          />
        }
      >
        <Card style={styles.words} accessibilityLabel="Recovery phrase words">
          {hidden ? (
            <AppText color="textMuted">
              Hidden while Ufunguo is in the background.
            </AppText>
          ) : (
            words.map((word, index) => (
              <View
                key={`${index}-${word}`}
                style={styles.word}
                accessible
                accessibilityLabel={`Word ${index + 1}: ${word}`}
              >
                <AppText
                  variant="caption"
                  color="textMuted"
                  style={styles.wordIndex}
                >
                  {index + 1}
                </AppText>
                <Mono selectable={false} style={styles.wordText}>
                  {word}
                </Mono>
              </View>
            ))
          )}
        </Card>
        <WhatJustHappened>{explain.afterCreate}</WhatJustHappened>
        <Card tone="muted">
          <KeyValueRow
            label="Master fingerprint"
            value={created.masterFingerprint}
            mono
          />
          <KeyValueRow label="Receive path" value={created.receivePath} mono />
          <KeyValueRow label="Change path" value={created.changePath} mono />
          <KeyValueRow
            label="First receive address"
            value={created.firstReceiveAddress}
            mono
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Confirm your backup"
      subtitle="Type two words from your written copy."
      edges={['left', 'right', 'bottom']}
      footer={
        <>
          <Button
            label="Confirm and open wallet"
            onPress={finish}
            testID="phrase-confirm"
          />
          <Button
            label="Show the words again"
            variant="ghost"
            onPress={() => setStep('show')}
          />
        </>
      }
    >
      {positions.map((position, i) => (
        <TextField
          key={position}
          label={`Word #${position + 1}`}
          value={answers[i]}
          onChangeText={value => {
            setConfirmError(null);
            setAnswers(current => current.map((a, j) => (j === i ? value : a)));
          }}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
          mono
          testID={`phrase-answer-${i}`}
        />
      ))}
      {confirmError ? (
        <AppText color="danger" accessibilityLiveRegion="polite">
          {confirmError}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textMuted">
        This check happens on your device only, to make sure your backup is
        readable.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rule: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  word: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  wordIndex: { width: 20, textAlign: 'right' },
  wordText: { fontSize: 16 },
});
