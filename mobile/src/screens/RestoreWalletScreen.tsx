import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import type { RestoredWallet } from '../api/types';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import {
  ExplainCard,
  ExplainText,
  WhatJustHappened,
} from '../components/ExplainCard';
import { TextField } from '../components/Inputs';
import { KeyValueRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { ErrorState } from '../components/StateViews';
import { explain } from '../content/explanations';
import { queryKeys } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { walletNameError } from './CreateWalletScreen';

export function RestoreWalletScreen({
  navigation,
}: RootScreenProps<'RestoreWallet'>) {
  const { repository, dataSource, selectWallet } = useAppSettings();
  const client = useQueryClient();

  const [name, setName] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [touched, setTouched] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [restored, setRestored] = useState<RestoredWallet | null>(null);

  // Remove the visible phrase when the app leaves the foreground.
  // React Native cannot guarantee secure erasure from JavaScript memory.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        setMnemonic('');
      }
    });

    return () => subscription.remove();
  }, []);

  const wordCount =
    mnemonic.trim() === '' ? 0 : mnemonic.trim().split(/\s+/).length;

  const nameError = touched ? walletNameError(name) : null;

  const phraseHint =
    wordCount === 0
      ? 'Enter the 12 words in their original order.'
      : wordCount === 12
        ? '12 words entered. Rust will verify the words and checksum.'
        : `${wordCount} of 12 words entered.`;

  const restore = async () => {
    setTouched(true);

    if (walletNameError(name) !== null || wordCount !== 12) {
      return;
    }

    const phrase = mnemonic;
    setMnemonic('');
    setRestoring(true);
    setError(null);

    try {
      const result = await repository.restoreWallet(name, phrase);

      setRestored(result);

      await client.invalidateQueries({
        queryKey: queryKeys.wallets(dataSource),
      });
    } catch (caught) {
      setError(caught);
    } finally {
      setRestoring(false);
    }
  };

  if (restored) {
    return (
      <Screen
        title="Wallet restored"
        subtitle="The same recovery phrase rebuilt the same Bitcoin wallet."
        edges={['left', 'right', 'bottom']}
        footer={
          <Button
            label="Open wallet"
            onPress={() => {
              selectWallet(restored.name);
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              });
            }}
          />
        }
      >
        <Card>
          <KeyValueRow
            label="Wallet"
            value={restored.name}
          />

          <KeyValueRow
            label="Master fingerprint"
            value={restored.masterFingerprint}
            mono
          />

          <KeyValueRow
            label="First receive address"
            value={restored.firstReceiveAddress}
            mono
          />

          <KeyValueRow
            label="Local state"
            value={
              <Badge
                label={
                  restored.alreadyExisted
                    ? 'Existing wallet matched'
                    : 'New wallet file created'
                }
                tone={restored.alreadyExisted ? 'info' : 'success'}
              />
            }
          />
        </Card>

        <WhatJustHappened>
          {`${explain.afterRestore} Synchronize the wallet to scan Bitcoin Core and rediscover its transactions.`}
        </WhatJustHappened>
      </Screen>
    );
  }

  return (
    <Screen
      title="Restore a wallet"
      subtitle="Use your recovery phrase to rebuild the wallet’s keys and addresses."
      edges={['left', 'right', 'bottom']}
      footer={
        <Button
          label="Restore wallet"
          onPress={restore}
          loading={restoring}
          disabled={wordCount !== 12}
          testID="restore-submit"
        />
      }
    >
      <TextField
        label="Wallet name"
        placeholder="bob"
        value={name}
        onChangeText={value => setName(value.trim().toLowerCase())}
        autoCapitalize="none"
        error={nameError}
        hint="This is only a local label. It does not change the wallet derived from your recovery phrase."
      />

      <TextField
        label="Recovery phrase"
        placeholder="Enter your 12 words"
        value={mnemonic}
        onChangeText={setMnemonic}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        contextMenuHidden
        hint={phraseHint}
        testID="restore-mnemonic"
      />

      {error ? (
        <ErrorState
          error={error}
          title="Could not restore wallet"
        />
      ) : null}

      <ExplainCard title="How does recovery work?">
        <ExplainText>
          The recovery phrase does not download an old wallet file. Rust
          derives the same master key, BIP84 keychains and addresses again.
          After synchronization, the wallet rediscovers its transactions from
          the blockchain.
        </ExplainText>
      </ExplainCard>

      <Card tone="muted">
        <KeyValueRow
          label="Regtest safety note"
          value="This capstone sends the phrase to a Rust API running on your development machine. It does not persist the phrase, but this bridge is not intended for real bitcoin or real recovery phrases."
        />
      </Card>
    </Screen>
  );
}