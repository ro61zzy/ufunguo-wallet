import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import type { RestoredWallet } from '../api/types';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { WhatJustHappened } from '../components/ExplainCard';
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
  // Held only in component state and cleared as soon as it has been sent.
  const [mnemonic, setMnemonic] = useState('');
  const [touched, setTouched] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [restored, setRestored] = useState<RestoredWallet | null>(null);

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

  const restore = async () => {
    setTouched(true);
    if (walletNameError(name) !== null || wordCount === 0) {
      return;
    }
    const phrase = mnemonic;
    setMnemonic('');
    setRestoring(true);
    setError(null);
    try {
      const result = await repository.restoreWallet(name, phrase);
      setRestored(result);
      client.invalidateQueries({ queryKey: queryKeys.wallets(dataSource) });
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
        edges={['left', 'right', 'bottom']}
        footer={
          <Button
            label="Open wallet"
            onPress={() => {
              selectWallet(restored.name);
              navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
            }}
          />
        }
      >
        <Card>
          <KeyValueRow label="Wallet" value={`${restored.name}.sqlite`} mono />
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
            label="Database"
            value={
              <Badge
                label={
                  restored.alreadyExisted
                    ? 'Existing file matched'
                    : 'New file created'
                }
                tone={restored.alreadyExisted ? 'info' : 'success'}
              />
            }
          />
        </Card>
        <WhatJustHappened>
          {`${explain.afterRestore} Sync on the Home screen to rediscover this wallet’s transactions.`}
        </WhatJustHappened>
      </Screen>
    );
  }

  return (
    <Screen
      title="Restore a wallet"
      subtitle="Rebuild a wallet from its 12-word recovery phrase."
      edges={['left', 'right', 'bottom']}
      footer={
        <Button
          label="Restore wallet"
          onPress={restore}
          loading={restoring}
          disabled={wordCount === 0}
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
        hint="Saved as <name>.sqlite. An existing wallet is only reopened if the phrase matches it."
      />
      <TextField
        label="Recovery phrase"
        placeholder="12 words separated by spaces"
        value={mnemonic}
        onChangeText={setMnemonic}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        contextMenuHidden
        hint={`${wordCount} of 12 words entered. Typing is hidden so nobody can read over your shoulder.`}
        testID="restore-mnemonic"
      />
      {error ? <ErrorState error={error} title="Could not restore" /> : null}
      <Card tone="muted">
        <KeyValueRow
          label="Development note"
          value="The phrase is sent once over localhost to the Rust API, which derives the wallet and does not store the words."
        />
      </Card>
    </Screen>
  );
}
