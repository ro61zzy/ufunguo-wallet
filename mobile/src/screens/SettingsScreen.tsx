import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import type { DataSource } from '../api';
import { AppText } from '../components/AppText';
import { Badge } from '../components/Badge';
import { Card, Divider, SectionTitle } from '../components/Card';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Inputs';
import { API_BASE_URL } from '../config';
import { KeyValueRow, ListRow } from '../components/Rows';
import { Screen } from '../components/Screen';
import { useHealth } from '../hooks/wallet';
import type { TabScreenProps } from '../navigation/types';
import { useAppSettings } from '../state/AppSettings';
import { colors, spacing } from '../theme/tokens';

const BOUNDARIES = [
  'Regtest only — never use real bitcoin.',
  'The Rust API listens on localhost only; it is a development bridge.',
  'Recovery phrases are sent to the local API only to create, restore or sign, and are never stored by the app.',
  'Bitcoin Core credentials stay in rust/.env and are never sent to the app.',
  'Wallet databases are unencrypted SQLite files.',
];

export function SettingsScreen({ navigation }: TabScreenProps<'Settings'>) {
  const {
    explainMode,
    setExplainMode,
    selectedWallet,
    dataSource,
    setDataSource,
  } = useAppSettings();
  const health = useHealth();

  return (
    <Screen title="Settings">
      <Card>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Explain Mode</AppText>
            <AppText variant="caption" color="textMuted">
              Show “What just happened?” after each wallet action.
            </AppText>
          </View>
          <Switch
            value={explainMode}
            onValueChange={setExplainMode}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
            accessibilityLabel="Explain Mode"
          />
        </View>
      </Card>

      <SectionTitle title="Wallet" />
      <Card>
        <ListRow
          title={selectedWallet ?? 'No wallet selected'}
          subtitle="Switch, create or restore wallets"
          left={<Icon name="wallet" />}
          onPress={() => navigation.navigate('WalletSwitcher')}
        />
      </Card>

      <SectionTitle title="Connection" />
      <Card style={styles.connection}>
        <Segmented<DataSource>
          accessibilityLabel="Data source"
          value={dataSource}
          onChange={setDataSource}
          options={[
            { value: 'api', label: 'Rust API', caption: 'Real wallet' },
            { value: 'mock', label: 'Mock data', caption: 'UI development' },
          ]}
        />
        {dataSource === 'mock' ? (
          <AppText variant="caption" color="warning">
            Mock mode shows canned fixtures. Nothing reaches Rust or Bitcoin
            Core.
          </AppText>
        ) : null}
        <KeyValueRow label="API address" value={API_BASE_URL} mono />
        <KeyValueRow label="Network" value="regtest" />
        <KeyValueRow
          label="Bitcoin Core"
          value={
            health.isError ? (
              <Badge label="API unreachable" tone="danger" />
            ) : health.data?.node.reachable ? (
              <Badge
                label={`Block ${health.data.node.blocks ?? '?'}`}
                tone="success"
              />
            ) : health.data ? (
              <Badge label="Node unreachable" tone="danger" />
            ) : (
              <Badge label="Checking…" />
            )
          }
        />
      </Card>

      <SectionTitle title="Development-only boundaries" />
      <Card tone="muted" style={styles.boundaries}>
        {BOUNDARIES.map((line, index) => (
          <React.Fragment key={line}>
            {index > 0 ? <Divider /> : null}
            <AppText>{line}</AppText>
          </React.Fragment>
        ))}
      </Card>

      <AppText variant="caption" color="textMuted" align="center">
        Ufunguo — “key” in Swahili. Educational regtest capstone.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  boundaries: { gap: 0 },
  connection: { gap: spacing.xs },
});
