import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { WalletAddress } from '../api/types';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card, Divider } from '../components/Card';
import {
  ExplainCard,
  ExplainText,
  WhatJustHappened,
} from '../components/ExplainCard';
import { Icon } from '../components/Icon';
import { KeyValueRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  AddressQr,
  KeychainBadge,
  TechnicalValue,
  UsedBadge,
} from '../components/WalletBits';
import { explain } from '../content/explanations';
import { useAddresses, useRevealReceiveAddress } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { spacing } from '../theme/tokens';

/** Most recently revealed external address that has not received funds. */
function latestUnusedReceive(addresses: WalletAddress[] | undefined) {
  return (addresses ?? [])
    .filter(a => a.keychain === 'external' && !a.used)
    .sort((a, b) => b.index - a.index)[0];
}

export function AddressCard({ address }: { address: WalletAddress }) {
  return (
    <Card style={styles.card}>
      <AddressQr value={address.address} />
      <TechnicalValue
        label="Address"
        value={address.address}
        copyLabel="Copy address"
      />
      <Divider />
      <KeyValueRow
        label="Keychain"
        value={<KeychainBadge keychain={address.keychain} />}
      />
      <KeyValueRow label="Derivation index" value={String(address.index)} />
      <KeyValueRow
        label="Derivation path"
        value={address.derivationPath}
        mono
      />
      <KeyValueRow label="State" value={<UsedBadge used={address.used} />} />
    </Card>
  );
}

export function ReceiveScreen({ navigation }: RootScreenProps<'Receive'>) {
  const { selectedWallet } = useAppSettings();
  const addresses = useAddresses(selectedWallet);
  const reveal = useRevealReceiveAddress(selectedWallet);
  const autoRevealed = useRef(false);

  const existing = latestUnusedReceive(addresses.data);
  const shown = reveal.data ?? existing;

  // If every revealed receive address has already been used, ask Rust for a
  // fresh one automatically (once per visit).
  useEffect(() => {
    if (
      addresses.isSuccess &&
      !existing &&
      !autoRevealed.current &&
      selectedWallet
    ) {
      autoRevealed.current = true;
      reveal.mutate();
    }
  }, [addresses.isSuccess, existing, reveal, selectedWallet]);

  return (
    <Screen
      title="Receive"
      subtitle={`Into wallet “${selectedWallet ?? ''}”`}
      edges={['left', 'right', 'bottom']}
      footer={
        <Button
          label="Generate a new address"
          variant="secondary"
          icon={<Icon name="plus" size={20} />}
          loading={reveal.isPending}
          onPress={() => reveal.mutate()}
          accessibilityHint="Reveals the next address index from your receive keychain"
        />
      }
    >
      {addresses.isError ? (
        <ErrorState
          error={addresses.error}
          onRetry={() => addresses.refetch()}
        />
      ) : reveal.isError ? (
        <ErrorState error={reveal.error} onRetry={() => reveal.mutate()} />
      ) : !shown ? (
        <LoadingState label="Asking Rust for a fresh address…" />
      ) : (
        <AddressCard address={shown} />
      )}

      {reveal.isSuccess ? (
        <WhatJustHappened>
          {`${explain.afterReceive} New index: ${reveal.data.index} (${reveal.data.derivationPath}).`}
        </WhatJustHappened>
      ) : null}

      <ExplainCard title="Why a fresh address?" defaultOpen={!reveal.isSuccess}>
        <ExplainText>{explain.freshAddress}</ExplainText>
      </ExplainCard>
      <ExplainCard title="Reading the derivation path">
        <ExplainText>{explain.derivation}</ExplainText>
      </ExplainCard>

      <View style={styles.next}>
        <AppText variant="caption" color="textMuted" align="center">
          After paying this address from Polar, sync on the Home screen to see
          the incoming transaction.
        </AppText>
        <Button
          compact
          variant="ghost"
          label="Done"
          onPress={() => navigation.goBack()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  next: { gap: spacing.xs, alignItems: 'center' },
});
