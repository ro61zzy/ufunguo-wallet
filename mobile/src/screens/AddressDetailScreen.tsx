import React from 'react';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { Screen } from '../components/Screen';
import { explain } from '../content/explanations';
import type { RootScreenProps } from '../navigation/types';
import { AddressCard } from './ReceiveScreen';

export function AddressDetailScreen({
  route,
}: RootScreenProps<'AddressDetail'>) {
  const { address } = route.params;
  const isChange = address.keychain === 'internal';

  return (
    <Screen edges={['left', 'right']}>
      <AddressCard address={address} />
      <ExplainCard
        title={
          isChange ? 'What is a change address?' : 'What is a receive address?'
        }
        defaultOpen
      >
        <ExplainText>
          {isChange
            ? explain.change
            : 'Receive addresses come from the external keychain (chain 0). You hand them to people who pay you.'}
        </ExplainText>
        <ExplainText>
          {address.used
            ? 'This address has appeared in a transaction output. Reusing it would link those payments together, so Ufunguo hands out a new one instead.'
            : 'No transaction has paid this address yet.'}
        </ExplainText>
      </ExplainCard>
      <ExplainCard title="Reading the derivation path">
        <ExplainText>{explain.derivation}</ExplainText>
      </ExplainCard>
    </Screen>
  );
}
