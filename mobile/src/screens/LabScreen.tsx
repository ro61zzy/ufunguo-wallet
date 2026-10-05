import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { WalletAddress, WalletOverview } from '../api/types';
import { AppText, Mono } from '../components/AppText';
import { Badge, ConfirmationBadge } from '../components/Badge';
import { Card, Divider, SectionTitle } from '../components/Card';
import { ExplainCard, ExplainText } from '../components/ExplainCard';
import { ListRow, KeyValueRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { Timeline } from '../components/Timeline';
import { KeychainBadge, UsedBadge } from '../components/WalletBits';
import { explain } from '../content/explanations';
import { useAddresses, useOverview, useUtxos } from '../hooks/wallet';
import type { TabScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors, radii, spacing } from '../theme/tokens';
import { formatBtc, formatSats, truncateMiddle } from '../utils/format';

type Section = 'addresses' | 'utxos' | 'paths' | 'anatomy' | 'psbt' | 'state';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'addresses', label: 'Addresses' },
  { key: 'utxos', label: 'UTXOs' },
  { key: 'paths', label: 'Derivation paths' },
  { key: 'anatomy', label: 'Transaction anatomy' },
  { key: 'psbt', label: 'PSBT' },
  { key: 'state', label: 'Wallet state' },
];

function SectionChips({
  value,
  onChange,
}: {
  value: Section;
  onChange: (section: Section) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityRole="tablist"
    >
      {SECTIONS.map(section => {
        const selected = section.key === value;
        return (
          <Pressable
            key={section.key}
            onPress={() => onChange(section.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={section.label}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && !selected && styles.chipPressed,
            ]}
          >
            <AppText variant="label">{section.label}</AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AddressesSection({
  addresses,
  onOpen,
}: {
  addresses: WalletAddress[];
  onOpen: (address: WalletAddress) => void;
}) {
  const groups = [
    { keychain: 'external' as const, title: 'Receive keychain (chain 0)' },
    { keychain: 'internal' as const, title: 'Change keychain (chain 1)' },
  ];
  return (
    <>
      <ExplainCard title="Two keychains, one wallet" defaultOpen>
        <ExplainText>
          BIP84 wallets have an external keychain for addresses you give to
          others and an internal keychain for change sent back to yourself. Each
          new address increments the index.
        </ExplainText>
      </ExplainCard>
      {groups.map(group => {
        const list = addresses.filter(a => a.keychain === group.keychain);
        return (
          <View key={group.keychain} style={styles.group}>
            <SectionTitle title={group.title} />
            {list.length === 0 ? (
              <Card tone="muted">
                <AppText color="textMuted">
                  {group.keychain === 'external'
                    ? 'No receive addresses revealed yet.'
                    : 'No change addresses yet — one is revealed the first time you send.'}
                </AppText>
              </Card>
            ) : (
              <Card style={styles.listCard}>
                {list.map(address => (
                  <ListRow
                    key={`${address.keychain}-${address.index}`}
                    title={`Index ${address.index}`}
                    subtitle={address.address}
                    monoSubtitle
                    right={<UsedBadge used={address.used} />}
                    onPress={() => onOpen(address)}
                    accessibilityLabel={`${
                      group.keychain === 'external' ? 'Receive' : 'Change'
                    } address index ${address.index}, ${
                      address.used ? 'used' : 'unused'
                    }`}
                  />
                ))}
              </Card>
            )}
          </View>
        );
      })}
    </>
  );
}

function UtxosSection({ wallet }: { wallet: string }) {
  const utxos = useUtxos(wallet);
  if (utxos.isPending) {
    return <LoadingState label="Loading UTXOs…" />;
  }
  if (utxos.isError) {
    return (
      <ErrorState
        error={utxos.error}
        onRetry={() => utxos.refetch()}
        retrying={utxos.isFetching}
      />
    );
  }
  const total = utxos.data.reduce((sum, u) => sum + u.valueSats, 0);
  return (
    <>
      <ExplainCard title="What is a UTXO?" defaultOpen>
        <ExplainText>
          An unspent transaction output is a specific amount locked to one of
          your addresses. It is identified by an outpoint: the TXID that created
          it plus the output number (txid:vout). Spending consumes whole UTXOs.
        </ExplainText>
      </ExplainCard>
      {utxos.data.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="No UTXOs yet"
          message="Receive regtest bitcoin and sync to see your coins here."
        />
      ) : (
        <>
          <Card tone="soft">
            <KeyValueRow
              label="Unspent outputs"
              value={String(utxos.data.length)}
            />
            <KeyValueRow
              label="Sum of UTXOs"
              value={formatSats(total)}
              emphasis
            />
            <AppText variant="caption" color="textMuted">
              This sum is your balance — there is no separate balance field.
            </AppText>
          </Card>
          {utxos.data.map(utxo => (
            <Card key={utxo.outpoint} style={styles.utxo}>
              <View style={styles.utxoHeader}>
                <AppText variant="heading">
                  {formatSats(utxo.valueSats)}
                </AppText>
                <ConfirmationBadge
                  confirmed={utxo.confirmed}
                  confirmations={utxo.confirmations}
                />
              </View>
              <AppText variant="caption" color="textMuted">
                {formatBtc(utxo.valueSats)}
              </AppText>
              <Divider />
              <KeyValueRow label="Outpoint" value={utxo.outpoint} mono />
              <KeyValueRow
                label="Keychain"
                value={<KeychainBadge keychain={utxo.keychain} />}
              />
              <KeyValueRow
                label="Derivation index"
                value={String(utxo.derivationIndex)}
              />
              <KeyValueRow label="Path" value={utxo.derivationPath} mono />
              {utxo.blockHeight !== null ? (
                <KeyValueRow
                  label="Created in block"
                  value={String(utxo.blockHeight)}
                />
              ) : null}
            </Card>
          ))}
        </>
      )}
    </>
  );
}

const PATH_PARTS = [
  { part: 'm', meaning: 'Master key from your 12 words' },
  { part: "84'", meaning: 'Purpose: BIP84 native SegWit (bc1q / bcrt1q)' },
  { part: "1'", meaning: 'Coin type: 1 = any test network (0 = mainnet)' },
  { part: "0'", meaning: 'Account: the first account' },
  { part: '0 | 1', meaning: 'Chain: 0 = receive, 1 = change' },
  { part: 'i', meaning: 'Index: increases with every new address' },
];

function PathsSection({ overview }: { overview: WalletOverview | undefined }) {
  return (
    <>
      <Card style={styles.pathCard}>
        <View
          style={styles.pathRow}
          accessible
          accessibilityLabel="Path m / 84 hardened / 1 hardened / 0 hardened / chain / index"
        >
          {PATH_PARTS.map((p, index) => (
            <React.Fragment key={p.part}>
              {index > 0 ? (
                <AppText color="textMuted" variant="mono">
                  /
                </AppText>
              ) : null}
              <View style={styles.pathPart}>
                <Mono selectable={false}>{p.part}</Mono>
              </View>
            </React.Fragment>
          ))}
        </View>
        {PATH_PARTS.map(p => (
          <KeyValueRow key={p.part} label={p.part} value={p.meaning} />
        ))}
      </Card>
      <Card>
        <KeyValueRow
          label="Receive descriptor path"
          value={overview?.receivePath ?? "m/84'/1'/0'/0/*"}
          mono
        />
        <KeyValueRow
          label="Change descriptor path"
          value={overview?.changePath ?? "m/84'/1'/0'/1/*"}
          mono
        />
        <KeyValueRow
          label="Receive indices revealed"
          value={overview ? String(overview.receiveAddressCount) : '—'}
        />
        <KeyValueRow
          label="Change indices revealed"
          value={overview ? String(overview.changeAddressCount) : '—'}
        />
      </Card>
      <ExplainCard title="What does the apostrophe mean?">
        <ExplainText>
          A ’ marks hardened derivation. Hardened levels cannot be derived from
          a public key, so leaking one account’s public key never exposes your
          other accounts.
        </ExplainText>
      </ExplainCard>
      <ExplainCard title="Reading the path">
        <ExplainText>{explain.derivation}</ExplainText>
      </ExplainCard>
    </>
  );
}

function AnatomySection() {
  return (
    <>
      <Card style={styles.anatomy}>
        <View style={styles.anatomyCols}>
          <View style={styles.anatomyCol}>
            <AppText variant="label" color="textMuted">
              Inputs
            </AppText>
            <View style={styles.anatomyBox}>
              <AppText variant="bodyStrong">100,000 sats</AppText>
              <AppText variant="caption" color="textMuted">
                Spends a UTXO you own
              </AppText>
            </View>
          </View>
          <View style={styles.anatomyCol}>
            <AppText variant="label" color="textMuted">
              Outputs
            </AppText>
            <View style={styles.anatomyBox}>
              <AppText variant="bodyStrong">60,000 sats</AppText>
              <AppText variant="caption" color="textMuted">
                Recipient
              </AppText>
            </View>
            <View style={[styles.anatomyBox, styles.anatomyChange]}>
              <AppText variant="bodyStrong">39,718 sats</AppText>
              <AppText variant="caption" color="textMuted">
                Change to you
              </AppText>
            </View>
          </View>
        </View>
        <View style={styles.feeLine}>
          <AppText variant="caption" color="textMuted">
            Inputs − outputs = miner fee: 100,000 − 99,718 = 282 sats
          </AppText>
        </View>
      </Card>
      <ExplainCard title="Inputs" defaultOpen>
        <ExplainText>
          Each input points at an existing UTXO (its outpoint) and carries a
          signature in the witness proving the owner authorised the spend.
        </ExplainText>
      </ExplainCard>
      <ExplainCard title="Outputs">
        <ExplainText>
          Each output locks an amount to a script — usually an address. New
          outputs become new UTXOs once the transaction is accepted.
        </ExplainText>
      </ExplainCard>
      <ExplainCard title="Change">
        <ExplainText>{explain.change}</ExplainText>
      </ExplainCard>
      <ExplainCard title="The fee is implicit">
        <ExplainText>
          There is no fee field. Whatever input value is not assigned to an
          output is collected by the miner. {explain.fees}
        </ExplainText>
      </ExplainCard>
    </>
  );
}

function PsbtSection() {
  return (
    <>
      <Card>
        <Timeline
          steps={[
            {
              key: 'create',
              title: 'Create',
              detail:
                'BDK chooses UTXOs (coin selection) and adds recipient and change outputs.',
              state: 'done',
            },
            {
              key: 'update',
              title: 'Update',
              detail:
                'Each input gets the previous output and its BIP32 derivation path.',
              state: 'done',
            },
            {
              key: 'review',
              title: 'Review',
              detail:
                'Ufunguo shows you inputs, outputs and fee. Nothing is signed yet.',
              state: 'done',
            },
            {
              key: 'sign',
              title: 'Sign',
              detail:
                'Rust derives the private keys and adds a signature per owned input.',
              state: 'done',
            },
            {
              key: 'finalize',
              title: 'Finalize',
              detail: 'Signatures move into the final witness fields.',
              state: 'done',
            },
            {
              key: 'extract',
              title: 'Extract & broadcast',
              detail:
                'The network transaction is extracted and sent to Bitcoin Core.',
              state: 'done',
            },
          ]}
        />
      </Card>
      <ExplainCard title="What is a PSBT?" defaultOpen>
        <ExplainText>{explain.psbt}</ExplainText>
      </ExplainCard>
      <ExplainCard title="Why not sign immediately?">
        <ExplainText>
          Separating building from signing lets a wallet show you exactly what
          will be signed, and lets the signer live somewhere else — a hardware
          wallet, another device, or a co-signer.
        </ExplainText>
      </ExplainCard>
      <ExplainCard title="Signing in Ufunguo">
        <ExplainText>{explain.signing}</ExplainText>
      </ExplainCard>
    </>
  );
}

function StateSection({
  overview,
  wallet,
}: {
  overview: WalletOverview | undefined;
  wallet: string;
}) {
  return (
    <>
      <Card>
        <KeyValueRow label="Wallet file" value={`${wallet}.sqlite`} mono />
        <KeyValueRow label="Network" value="regtest" />
        <KeyValueRow
          label="Synchronized height"
          value={overview ? String(overview.walletHeight) : '—'}
        />
        {overview ? (
          <KeyValueRow
            label="Tip hash"
            value={truncateMiddle(overview.tipHash, 12, 10)}
            mono
          />
        ) : null}
        <KeyValueRow
          label="Revealed addresses"
          value={overview ? String(overview.revealedAddresses) : '—'}
        />
        <KeyValueRow
          label="Used addresses"
          value={overview ? String(overview.usedAddresses) : '—'}
        />
        <KeyValueRow
          label="Known transactions"
          value={overview ? String(overview.transactionCount) : '—'}
        />
        <KeyValueRow
          label="UTXOs (confirmed)"
          value={
            overview
              ? `${overview.utxoCount} (${overview.confirmedUtxoCount})`
              : '—'
          }
        />
      </Card>
      <Card tone="muted" style={styles.stored}>
        <AppText variant="bodyStrong">Stored in SQLite</AppText>
        {[
          'Public descriptors (no private keys)',
          'Last revealed index per keychain',
          'Block checkpoints',
          'Relevant transactions and outputs',
        ].map(item => (
          <View key={item} style={styles.bullet}>
            <Badge label="Yes" tone="success" />
            <AppText style={styles.bulletText}>{item}</AppText>
          </View>
        ))}
        {['Recovery phrase', 'Private keys'].map(item => (
          <View key={item} style={styles.bullet}>
            <Badge label="Never" tone="danger" />
            <AppText style={styles.bulletText}>{item}</AppText>
          </View>
        ))}
      </Card>
      <ExplainCard title="What the database is for" defaultOpen>
        <ExplainText>{explain.walletState}</ExplainText>
      </ExplainCard>
      <ExplainCard title="Synchronizing">
        <ExplainText>{explain.afterSync}</ExplainText>
      </ExplainCard>
    </>
  );
}

export function LabScreen({ navigation }: TabScreenProps<'Lab'>) {
  const { selectedWallet } = useAppSettings();
  const [section, setSection] = useState<Section>('addresses');
  const overview = useOverview(selectedWallet);
  const addresses = useAddresses(selectedWallet);

  return (
    <Screen
      title="Bitcoin Lab"
      subtitle="See the moving parts behind your balance."
      refreshing={overview.isRefetching}
      onRefresh={() => {
        overview.refetch();
        addresses.refetch();
      }}
    >
      <SectionChips value={section} onChange={setSection} />

      {!selectedWallet ? (
        <EmptyState
          icon="wallet"
          title="No wallet selected"
          message="Choose a wallet to explore its internals."
        />
      ) : section === 'addresses' ? (
        addresses.isPending ? (
          <LoadingState label="Loading addresses…" />
        ) : addresses.isError ? (
          <ErrorState
            error={addresses.error}
            onRetry={() => addresses.refetch()}
            retrying={addresses.isFetching}
          />
        ) : (
          <AddressesSection
            addresses={addresses.data}
            onOpen={address =>
              navigation.navigate('AddressDetail', { address })
            }
          />
        )
      ) : section === 'utxos' ? (
        <UtxosSection wallet={selectedWallet} />
      ) : section === 'paths' ? (
        <PathsSection overview={overview.data} />
      ) : section === 'anatomy' ? (
        <AnatomySection />
      ) : section === 'psbt' ? (
        <PsbtSection />
      ) : (
        <StateSection overview={overview.data} wallet={selectedWallet} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.xs, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
  group: { gap: spacing.sm },
  listCard: { paddingVertical: spacing.xs },
  utxo: { gap: 2 },
  utxoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pathCard: { gap: spacing.xs },
  pathRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  pathPart: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  anatomy: { gap: spacing.sm },
  anatomyCols: { flexDirection: 'row', gap: spacing.sm },
  anatomyCol: { flex: 1, gap: spacing.xs },
  anatomyBox: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  anatomyChange: { borderColor: colors.primary },
  feeLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  stored: { gap: spacing.xs },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bulletText: { flex: 1 },
});
