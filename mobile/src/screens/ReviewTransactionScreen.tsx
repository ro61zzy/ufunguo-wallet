import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState, StyleSheet, View } from 'react-native';
import { errorCode } from '../api/errors';
import type { PreviewOutput, TransactionPreview } from '../api/types';
import { AppText, Mono } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, Divider, SectionTitle } from '../components/Card';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { Icon } from '../components/Icon';
import {
  emptyPhrase,
  filledWordCount,
  phraseToString,
  RecoveryPhraseInput,
} from '../components/RecoveryPhraseInput';
import { AmountRow, KeyValueRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { ErrorState } from '../components/StateViews';
import { explain } from '../content/explanations';
import { invalidateWallet } from '../hooks/wallet';
import type { RootScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors, radii, spacing } from '../theme/tokens';
import { formatSats, truncateMiddle } from '../utils/format';
import { FEE_SOURCE_LABEL } from './SendScreen';

type Step = 'review' | 'sign';

function FlowArrow({ label }: { label?: string }) {
  return (
    <View style={styles.arrow} accessibilityElementsHidden>
      <Icon
        name="chevronDown"
        size={22}
        color={colors.primary}
        strokeWidth={2.4}
      />
      {label ? (
        <AppText variant="caption" color="textMuted">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

function FlowNode({
  title,
  children,
  tone = 'default',
}: {
  title: string;
  children?: React.ReactNode;
  tone?: 'default' | 'soft' | 'muted';
}) {
  return (
    <View
      style={[
        styles.node,
        tone === 'soft' && styles.nodeSoft,
        tone === 'muted' && styles.nodeMuted,
      ]}
    >
      <AppText variant="label" color="textMuted">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function OutputChip({ output }: { output: PreviewOutput }) {
  const label =
    output.role === 'recipient'
      ? 'Recipient'
      : output.role === 'change'
      ? 'Change (back to you)'
      : 'Other output';
  return (
    <View
      style={[styles.output, output.role === 'change' && styles.outputChange]}
    >
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="bodyStrong">{formatSats(output.valueSats)}</AppText>
      <Mono color="textMuted" selectable={false}>
        {output.address ? truncateMiddle(output.address, 10, 6) : 'script'}
      </Mono>
    </View>
  );
}

/** Selected UTXO → outputs + fee → PSBT → local signature → network. */
export function TransactionFlow({ preview }: { preview: TransactionPreview }) {
  return (
    <View
      accessible
      accessibilityLabel={`Transaction flow: ${preview.inputs.length} input${
        preview.inputs.length === 1 ? '' : 's'
      } worth ${formatSats(preview.inputTotalSats)} become a ${formatSats(
        preview.amountSats,
      )} recipient output, ${formatSats(
        preview.changeSats,
      )} change and a ${formatSats(
        preview.feeSats,
      )} miner fee. Then a PSBT is built, signed locally and broadcast.`}
    >
      <FlowNode
        title={
          preview.inputs.length === 1
            ? 'Selected UTXO'
            : `Selected UTXOs (${preview.inputs.length})`
        }
      >
        {preview.inputs.map(input => (
          <View key={input.outpoint} style={styles.inputRow}>
            <AppText variant="bodyStrong">
              {formatSats(input.valueSats)}
            </AppText>
            <Mono color="textMuted" selectable={false}>
              {truncateMiddle(input.outpoint, 10, 6)}
            </Mono>
          </View>
        ))}
      </FlowNode>
      <FlowArrow label="split into" />
      <View style={styles.outputs}>
        {preview.outputs.map(output => (
          <OutputChip key={output.vout} output={output} />
        ))}
        <View style={[styles.output, styles.outputFee]}>
          <AppText variant="caption" color="textMuted">
            Miner fee
          </AppText>
          <AppText variant="bodyStrong">{formatSats(preview.feeSats)}</AppText>
          <AppText variant="caption" color="textMuted">
            {preview.feeRateSatPerVb} sat/vB
          </AppText>
        </View>
      </View>
      <FlowArrow label="packaged as" />
      <FlowNode title="PSBT (unsigned)" tone="muted">
        <Mono color="textMuted" selectable={false}>
          {truncateMiddle(preview.psbtBase64, 18, 8)}
        </Mono>
      </FlowNode>
      <FlowArrow label="after you confirm" />
      <FlowNode title="Local signature" tone="soft">
        <AppText variant="caption">
          Rust signs with keys derived from your recovery phrase.
        </AppText>
      </FlowNode>
      <FlowArrow />
      <FlowNode title="Bitcoin network" tone="soft">
        <AppText variant="caption">
          Bitcoin Core validates and relays the finalized transaction.
        </AppText>
      </FlowNode>
    </View>
  );
}

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        seconds - Math.floor((Date.now() - started) / 1000),
      );
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);
  return remaining;
}

export function ReviewTransactionScreen({
  route,
  navigation,
}: RootScreenProps<'ReviewTransaction'>) {
  const { preview } = route.params;
  const { selectedWallet, repository, dataSource } = useAppSettings();
  const client = useQueryClient();
  const [step, setStep] = useState<Step>('review');
  // The recovery phrase lives only in this component's state. It is never
  // put in navigation params, query caches, storage or logs.
  const [words, setWords] = useState<string[]>(emptyPhrase);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const remaining = useCountdown(preview.expiresInSeconds);
  const expired = remaining === 0;

  // Clear the phrase if the app is backgrounded.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        setWords(emptyPhrase());
      }
    });
    return () => subscription.remove();
  }, []);

  const wordCount = filledWordCount(words);
  const change = preview.outputs.find(o => o.role === 'change');

  const signAndBroadcast = async () => {
    if (!selectedWallet) {
      return;
    }
    const phrase = phraseToString(words);
    setWords(emptyPhrase());
    setSending(true);
    setSendError(null);
    try {
      const result = await repository.sendTransaction(
        selectedWallet,
        preview.previewId,
        phrase,
      );
      invalidateWallet(client, dataSource, selectedWallet);
      navigation.replace('TransactionDetail', {
        txid: result.txid,
        justSent: true,
      });
    } catch (error) {
      setSendError(error);
    } finally {
      setSending(false);
    }
  };

  const footer =
    step === 'review' ? (
      <>
        <Button
          label="I’ve checked it — continue to signing"
          onPress={() => setStep('sign')}
          disabled={expired}
          accessibilityHint="Shows the recovery phrase field. Nothing is signed yet."
          testID="review-confirm"
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => navigation.goBack()}
        />
      </>
    ) : (
      <>
        <Button
          label="Sign locally and broadcast"
          onPress={signAndBroadcast}
          loading={sending}
          loadingLabel="Signing and broadcasting…"
          disabled={expired || wordCount < 12}
          accessibilityHint="Signs this exact transaction in Rust and sends it to Bitcoin Core"
          testID="review-sign"
        />
        <Button
          label="Back to review"
          variant="ghost"
          disabled={sending}
          onPress={() => {
            setWords(emptyPhrase());
            setStep('review');
          }}
        />
      </>
    );

  return (
    <Screen edges={['left', 'right', 'bottom']} footer={footer}>
      <Card style={styles.summary}>
        <AppText variant="label" color="textMuted">
          You are sending
        </AppText>
        <AppText variant="title">{formatSats(preview.amountSats)}</AppText>
        <AppText variant="caption" color="textMuted">
          to
        </AppText>
        <Mono>{preview.destination}</Mono>
        <View style={styles.badges}>
          <Badge label={`Fee ${formatSats(preview.feeSats)}`} tone="primary" />
          <Badge
            label={
              expired
                ? 'Review expired'
                : `Valid for ${Math.floor(remaining / 60)}:${String(
                    remaining % 60,
                  ).padStart(2, '0')}`
            }
            tone={expired ? 'danger' : 'neutral'}
          />
        </View>
      </Card>

      {expired ? (
        <ErrorState
          title="This review expired"
          error={
            new Error(
              'Go back and review the transaction again so Rust can rebuild it with fresh wallet state.',
            )
          }
        />
      ) : null}

      <SectionTitle title="How this transaction is built" />
      <Card>
        <TransactionFlow preview={preview} />
      </Card>

      <SectionTitle title="Details" />
      <Card>
        <KeyValueRow label="Recipient" value={preview.destination} mono />
        <AmountRow label="Amount" sats={preview.amountSats} />
        <Divider />
        {preview.inputs.map((input, index) => (
          <View key={input.outpoint}>
            <KeyValueRow
              label={`Input ${index + 1} outpoint`}
              value={input.outpoint}
              mono
            />
            <AmountRow
              label={`Input ${index + 1} value`}
              sats={input.valueSats}
            />
            {input.derivationPath ? (
              <KeyValueRow
                label="Signed with key"
                value={input.derivationPath}
                mono
              />
            ) : null}
          </View>
        ))}
        <Divider />
        {change ? (
          <>
            <KeyValueRow
              label="Change address"
              value={change.address ?? '—'}
              mono
            />
            {change.derivationPath ? (
              <KeyValueRow
                label="Change path"
                value={change.derivationPath}
                mono
              />
            ) : null}
            <AmountRow label="Change amount" sats={change.valueSats} />
          </>
        ) : (
          <KeyValueRow
            label="Change"
            value="None — the leftover was too small to be worth an output, so it goes to the miner."
          />
        )}
        <Divider />
        <KeyValueRow
          label="Fee rate"
          value={`${preview.feeRateSatPerVb} sat/vB (${
            FEE_SOURCE_LABEL[preview.feeSource]
          })`}
        />
        <AmountRow label="Absolute fee" sats={preview.feeSats} />
        <KeyValueRow label="Estimated size" value={`${preview.vsize} vB`} />
        <KeyValueRow
          label="Inputs / outputs"
          value={`${preview.inputs.length} in · ${preview.outputs.length} out`}
        />
      </Card>

      <ExplainCard title="Why is there a change output?">
        <ExplainText>{explain.change}</ExplainText>
      </ExplainCard>
      <ExplainCard title="What is a PSBT?">
        <ExplainText>{explain.psbt}</ExplainText>
      </ExplainCard>
      <ExplainCard title="What does signing do?">
        <ExplainText>{explain.signing}</ExplainText>
      </ExplainCard>

      {step === 'sign' ? (
        <Card style={styles.signCard}>
          <SectionTitle title="Sign with your recovery phrase" />
          <RecoveryPhraseInput
            value={words}
            onChange={setWords}
            hiddenByDefault
            testIDPrefix="review-word"
          />
          <View style={styles.devNote}>
            <Icon name="info" size={18} color={colors.warning} />
            <AppText
              variant="caption"
              color="textMuted"
              style={styles.devNoteText}
            >
              Development bridge: the phrase is sent once over localhost to the
              Rust API, used to sign this exact transaction and then wiped. A
              production app would sign inside a native Rust library with keys
              in secure hardware storage.
            </AppText>
          </View>
          {sendError ? (
            <ErrorState
              error={sendError}
              title={
                errorCode(sendError) === 'preview_not_found'
                  ? 'Review expired'
                  : 'Signing or broadcast failed'
              }
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.xxs },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  node: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 4,
    backgroundColor: colors.surface,
  },
  nodeSoft: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  nodeMuted: { backgroundColor: colors.surfaceMuted },
  inputRow: { gap: 2 },
  arrow: { alignItems: 'center', paddingVertical: 4 },
  outputs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  output: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
    backgroundColor: colors.surface,
  },
  outputChange: { borderColor: colors.primary },
  outputFee: { backgroundColor: colors.surfaceMuted },
  signCard: { gap: spacing.sm, borderColor: colors.primary },
  devNote: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  devNoteText: { flex: 1 },
});
