import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { TextField } from '../components/Inputs';
import { Timeline } from '../components/Timeline';
import { Screen } from '../components/Screen';
import type { RootScreenProps } from '../navigation/types';

// Mirrors the Rust rule (`WalletName::parse`) for instant feedback.
// The Rust API remains the final authority.
export const WALLET_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function walletNameError(name: string): string | null {
  if (name === '') {
    return 'Choose a name for this wallet.';
  }

  if (!WALLET_NAME_PATTERN.test(name)) {
    return 'Use 1–32 lowercase letters, numbers, “-” or “_”. Start with a letter or number.';
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
      subtitle="Choose a local name to help you identify this wallet."
      edges={['left', 'right', 'bottom']}
      footer={
        <Button
          label="Create wallet"
          onPress={next}
          testID="create-continue"
        />
      }
    >
      <TextField
        label="Wallet name"
        placeholder="e.g alice"
        value={name}
        onChangeText={value => setName(value.trim().toLowerCase())}
        autoCapitalize="none"
        error={error}
        returnKeyType="next"
        onSubmitEditing={next}
        testID="create-name"
      />

      <ExplainCard title="What is this name used for?">
        <ExplainText>
          The name identifies this wallet on your device. For this regtest
          demonstration, each wallet has a separate SQLite file—for example,
          alice.sqlite.
        </ExplainText>
      </ExplainCard>

      <Card>
        <Timeline
          steps={[
            {
              key: 'entropy',
              title: '1. Generate secure randomness',
              detail:
                'Rust generates 128 random bits using the operating system’s cryptographically secure random source.',
              state: 'pending',
            },
            {
              key: 'words',
              title: '2. Create the recovery phrase',
              detail:
                'BIP39 combines the randomness with a checksum and represents it as 12 readable words.',
              state: 'pending',
            },
            {
              key: 'keys',
              title: '3. Derive the wallet keys',
              detail:
                'BIP32 creates a master key, while BIP84 defines separate keychains for receiving bitcoin and returning change.',
              state: 'pending',
            },
            {
              key: 'save',
              title: '4. Save the wallet state',
              detail:
                'SQLite stores the public descriptors and derivation state needed to discover transactions. The recovery phrase is not saved.',
              state: 'pending',
            },
          ]}
        />
      </Card>

      <ExplainCard title="Why can’t Ufunguo reset my recovery phrase?">
        <ExplainText>
          Ufunguo does not create an online account or keep a copy of your
          recovery phrase. The phrase is the backup for your wallet. If it is
          lost, the wallet cannot be recovered. Anyone who obtains it can
          recreate the wallet and spend its bitcoin.
        </ExplainText>
      </ExplainCard>
    </Screen>
  );
}