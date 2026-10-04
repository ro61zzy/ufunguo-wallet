import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { TextField } from '../components/Inputs';
import { Timeline } from '../components/Timeline';
import { Screen } from '../components/Screen';
import type { RootScreenProps } from '../navigation/types';

// Mirrors the Rust rule (`WalletName::parse`) for instant feedback only; the
// API is the authority and rejects anything else.
export const WALLET_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function walletNameError(name: string): string | null {
  if (name === '') {
    return 'Choose a name for this wallet.';
  }
  if (!WALLET_NAME_PATTERN.test(name)) {
    return 'Use 1–32 lowercase letters, numbers, “-” or “_”, starting with a letter or number.';
  }
  return null;
}

export function CreateWalletScreen({
  navigation,
}: RootScreenProps<'CreateWallet'>) {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched ? walletNameError(name) : null;

  const next = () => {
    setTouched(true);
    if (walletNameError(name) === null) {
      navigation.navigate('RecoveryPhrase', { walletName: name });
    }
  };

  return (
    <Screen
      title="Name your wallet"
      subtitle="The name becomes the wallet’s SQLite file, for example alice.sqlite."
      edges={['left', 'right', 'bottom']}
      footer={
        <Button label="Continue" onPress={next} testID="create-continue" />
      }
    >
      <TextField
        label="Wallet name"
        placeholder="alice"
        value={name}
        onChangeText={value => setName(value.trim().toLowerCase())}
        autoCapitalize="none"
        error={error}
        returnKeyType="next"
        onSubmitEditing={next}
        testID="create-name"
      />
      <Card>
        <Timeline
          steps={[
            {
              key: 'entropy',
              title: 'Generate randomness',
              detail:
                'Rust draws 128 bits from a cryptographically secure random number generator.',
              state: 'pending',
            },
            {
              key: 'words',
              title: 'Encode as 12 words',
              detail: 'BIP39 turns the randomness plus a checksum into words.',
              state: 'pending',
            },
            {
              key: 'keys',
              title: 'Derive keys',
              detail:
                'BIP32 derives a master key; BIP84 defines receive and change keychains.',
              state: 'pending',
            },
            {
              key: 'save',
              title: 'Save public descriptors',
              detail:
                'SQLite stores what the wallet needs to watch the chain — not the words.',
              state: 'pending',
            },
          ]}
        />
      </Card>
      <ExplainCard title="Why can’t Ufunguo reset my phrase?">
        <ExplainText>
          There is no server account. The words are the wallet: if you lose
          them, nobody can recover your funds — and anyone who finds them can
          spend them.
        </ExplainText>
      </ExplainCard>
    </Screen>
  );
}
