import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorCode, errorMessage } from '../api/errors';
import type { FeeSource } from '../api/types';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { Segmented, TextField } from '../components/Inputs';
import { AmountRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { ErrorState } from '../components/StateViews';
import { explain } from '../content/explanations';
import { useFees, useOverview, usePreviewTransaction } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { spacing } from '../theme/tokens';
import {
  formatBtc,
  formatSats,
  parseBtcInput,
  parseSatsInput,
} from '../utils/format';

type Unit = 'sats' | 'btc';
type FeeChoice = '1' | '3' | '6' | 'custom';

const FEE_LABELS: Record<Exclude<FeeChoice, 'custom'>, string> = {
  '1': 'Fast',
  '3': 'Normal',
  '6': 'Relaxed',
};

export const FEE_SOURCE_LABEL: Record<FeeSource, string> = {
  bitcoin_core: 'Bitcoin Core estimate',
  regtest_fallback: 'Regtest fallback',
  manual: 'Your custom rate',
};

const ADDRESS_ERRORS = new Set(['invalid_address', 'wrong_network']);
const AMOUNT_ERRORS = new Set(['invalid_amount', 'insufficient_funds']);

export function SendScreen({ navigation }: RootScreenProps<'Send'>) {
  const { selectedWallet } = useAppSettings();
  const overview = useOverview(selectedWallet);
  const fees = useFees();
  const preview = usePreviewTransaction(selectedWallet);

  const [address, setAddress] = useState('');
  const [amountText, setAmountText] = useState('');
  const [unit, setUnit] = useState<Unit>('sats');
  const [feeChoice, setFeeChoice] = useState<FeeChoice>('6');
  const [customRate, setCustomRate] = useState('');
  const [touched, setTouched] = useState(false);

  const amountSats = useMemo(
    () =>
      unit === 'sats' ? parseSatsInput(amountText) : parseBtcInput(amountText),
    [amountText, unit],
  );
  const customRateValue = parseSatsInput(customRate);

  const addressError =
    touched && address.trim() === ''
      ? 'Enter the recipient’s regtest address.'
      : preview.isError && ADDRESS_ERRORS.has(errorCode(preview.error) ?? '')
      ? errorMessage(preview.error)
      : null;
  const amountError =
    touched && (amountSats === null || amountSats <= 0)
      ? unit === 'sats'
        ? 'Enter a whole number of satoshis greater than zero.'
        : 'Enter an amount in BTC with at most 8 decimal places.'
      : preview.isError && AMOUNT_ERRORS.has(errorCode(preview.error) ?? '')
      ? errorMessage(preview.error)
      : null;
  const customError =
    touched &&
    feeChoice === 'custom' &&
    (customRateValue === null || customRateValue < 1)
      ? 'Enter a fee rate of at least 1 sat/vB.'
      : null;
  const otherError =
    preview.isError &&
    !ADDRESS_ERRORS.has(errorCode(preview.error) ?? '') &&
    !AMOUNT_ERRORS.has(errorCode(preview.error) ?? '')
      ? preview.error
      : null;

  const estimateFor = (target: number) =>
    fees.data?.estimates.find(e => e.confirmationTarget === target);

  const submit = () => {
    setTouched(true);
    if (
      address.trim() === '' ||
      amountSats === null ||
      amountSats <= 0 ||
      (feeChoice === 'custom' &&
        (customRateValue === null || customRateValue < 1))
    ) {
      return;
    }
    // Rust validates the address, selects coins and calculates the fee.
    preview.mutate(
      {
        address: address.trim(),
        amountSats,
        ...(feeChoice === 'custom'
          ? { feeRateSatPerVb: customRateValue as number }
          : { confirmationTarget: Number(feeChoice) }),
      },
      {
        onSuccess: result =>
          navigation.navigate('ReviewTransaction', { preview: result }),
      },
    );
  };

  const spendable = overview.data?.balance.spendableSats;

  return (
    <Screen
      title="Send"
      subtitle="Nothing is signed until you review and confirm."
      edges={['left', 'right', 'bottom']}
      footer={
        <Button
          label="Review transaction"
          onPress={submit}
          loading={preview.isPending}
          loadingLabel="Building transaction…"
          accessibilityHint="Asks Rust to select coins and build an unsigned transaction for review"
          testID="send-review"
        />
      }
    >
      {spendable !== undefined ? (
        <Card tone="muted">
          <AmountRow label="Available to spend" sats={spendable} />
        </Card>
      ) : null}

      <TextField
        label="Recipient address"
        placeholder="bcrt1q…"
        value={address}
        onChangeText={value => {
          setAddress(value);
          preview.reset();
        }}
        autoCapitalize="none"
        mono
        error={addressError}
        hint="A regtest address starting with bcrt1."
      />

      <View style={styles.amountBlock}>
        <TextField
          label={unit === 'sats' ? 'Amount (sats)' : 'Amount (BTC)'}
          placeholder={unit === 'sats' ? '25000' : '0.00025'}
          value={amountText}
          onChangeText={value => {
            setAmountText(value);
            preview.reset();
          }}
          keyboardType={unit === 'sats' ? 'number-pad' : 'decimal-pad'}
          error={amountError}
          hint={
            amountSats !== null && amountSats > 0
              ? unit === 'sats'
                ? `= ${formatBtc(amountSats)}`
                : `= ${formatSats(amountSats)}`
              : '1 BTC = 100,000,000 sats. Rust always works in sats.'
          }
        />
        <Segmented<Unit>
          accessibilityLabel="Amount unit"
          value={unit}
          onChange={next => {
            if (next === unit) {
              return;
            }
            // Convert what was typed so switching units keeps the same value.
            if (amountSats !== null && amountSats > 0) {
              setAmountText(
                next === 'sats'
                  ? String(amountSats)
                  : formatBtc(amountSats, { trim: true }).replace(' BTC', ''),
              );
            }
            setUnit(next);
          }}
          options={[
            { value: 'sats', label: 'sats' },
            { value: 'btc', label: 'BTC' },
          ]}
        />
      </View>

      <View style={styles.feeBlock}>
        <AppText variant="label">Fee preference</AppText>
        <Segmented<FeeChoice>
          accessibilityLabel="Fee preference"
          value={feeChoice}
          onChange={setFeeChoice}
          options={[
            ...(['1', '3', '6'] as const).map(target => {
              const estimate = estimateFor(Number(target));
              return {
                value: target,
                label: FEE_LABELS[target],
                caption: estimate
                  ? `${estimate.satPerVb} sat/vB`
                  : `${target} block${target === '1' ? '' : 's'}`,
              };
            }),
            { value: 'custom' as const, label: 'Custom', caption: 'sat/vB' },
          ]}
        />
        {feeChoice === 'custom' ? (
          <TextField
            label="Custom fee rate (sat/vB)"
            placeholder="2"
            value={customRate}
            onChangeText={setCustomRate}
            keyboardType="number-pad"
            error={customError}
          />
        ) : (
          <AppText variant="caption" color="textMuted">
            {(() => {
              const estimate = estimateFor(Number(feeChoice));
              return estimate
                ? `Target: confirm within ${feeChoice} block${
                    feeChoice === '1' ? '' : 's'
                  } · ${FEE_SOURCE_LABEL[estimate.source]}`
                : fees.isError
                ? 'Fee estimates unavailable; Rust will estimate when you review.'
                : 'Loading fee estimates…';
            })()}
          </AppText>
        )}
      </View>

      {otherError ? (
        <ErrorState
          error={otherError}
          title="Could not build the transaction"
        />
      ) : null}

      <ExplainCard title="How fees work">
        <ExplainText>{explain.fees}</ExplainText>
      </ExplainCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountBlock: { gap: spacing.xs },
  feeBlock: { gap: spacing.xs },
});
