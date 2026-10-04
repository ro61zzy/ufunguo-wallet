//! JSON contract shared with `mobile/src/api/types.ts`.
//!
//! These types only translate `ufunguo-core` results into JSON: amounts become
//! integer satoshis (`*_sats`), addresses and outpoints become strings. No
//! wallet calculation happens here.

use serde::{Deserialize, Serialize};
use ufunguo_core::{
    Balance, KeychainKind, OutputRole, TransactionDetails, TransactionDirection, WalletAddress,
    WalletOverview, WalletTransaction, WalletUtxo, derivation_path,
    service::{CreatedWallet, FeeSource, ResolvedFeeRate, RestoredWallet, TransactionPreview},
};
use zeroize::Zeroizing;

use ufunguo_core::{CHANGE_PATH, RECEIVE_PATH};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Keychain {
    External,
    Internal,
}

impl From<KeychainKind> for Keychain {
    fn from(keychain: KeychainKind) -> Self {
        match keychain {
            KeychainKind::External => Self::External,
            KeychainKind::Internal => Self::Internal,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: &'static str,
    pub network: &'static str,
    pub regtest_only: bool,
    pub node: NodeHealth,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeHealth {
    pub reachable: bool,
    pub chain: Option<String>,
    pub blocks: Option<u64>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WalletSummary {
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct WalletListResponse {
    pub wallets: Vec<WalletSummary>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct RestoreWalletRequest {
    /// Zeroized when the request is dropped.
    pub mnemonic: Zeroizing<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedWalletResponse {
    pub name: String,
    /// Returned exactly once, at creation. Never logged.
    pub mnemonic: Zeroizing<String>,
    pub word_count: usize,
    pub master_fingerprint: String,
    pub first_receive_address: String,
    pub receive_path: &'static str,
    pub change_path: &'static str,
}

impl std::fmt::Debug for CreatedWalletResponse {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CreatedWalletResponse")
            .field("name", &self.name)
            .field("mnemonic", &"<redacted>")
            .finish_non_exhaustive()
    }
}

impl CreatedWalletResponse {
    pub fn new(name: String, created: &CreatedWallet) -> Self {
        Self {
            name,
            mnemonic: Zeroizing::new(created.mnemonic.to_string()),
            word_count: created.mnemonic.word_count(),
            master_fingerprint: created.master_fingerprint.to_string(),
            first_receive_address: created.first_receive_address.to_string(),
            receive_path: RECEIVE_PATH,
            change_path: CHANGE_PATH,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoredWalletResponse {
    pub name: String,
    pub master_fingerprint: String,
    pub first_receive_address: String,
    pub already_existed: bool,
    pub receive_path: &'static str,
    pub change_path: &'static str,
}

impl RestoredWalletResponse {
    pub fn new(name: String, restored: &RestoredWallet) -> Self {
        Self {
            name,
            master_fingerprint: restored.master_fingerprint.to_string(),
            first_receive_address: restored.first_receive_address.to_string(),
            already_existed: restored.already_existed,
            receive_path: RECEIVE_PATH,
            change_path: CHANGE_PATH,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceDto {
    pub confirmed_sats: u64,
    pub trusted_pending_sats: u64,
    pub untrusted_pending_sats: u64,
    pub unconfirmed_sats: u64,
    pub immature_sats: u64,
    pub spendable_sats: u64,
    pub total_sats: u64,
}

impl From<&Balance> for BalanceDto {
    fn from(balance: &Balance) -> Self {
        Self {
            confirmed_sats: balance.confirmed.to_sat(),
            trusted_pending_sats: balance.trusted_pending.to_sat(),
            untrusted_pending_sats: balance.untrusted_pending.to_sat(),
            unconfirmed_sats: (balance.trusted_pending + balance.untrusted_pending).to_sat(),
            immature_sats: balance.immature.to_sat(),
            spendable_sats: balance.trusted_spendable().to_sat(),
            total_sats: balance.total().to_sat(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Incoming,
    Outgoing,
    #[serde(rename = "self")]
    SelfTransfer,
}

impl From<TransactionDirection> for Direction {
    fn from(direction: TransactionDirection) -> Self {
        match direction {
            TransactionDirection::Incoming => Self::Incoming,
            TransactionDirection::Outgoing => Self::Outgoing,
            TransactionDirection::SelfTransfer => Self::SelfTransfer,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDto {
    pub txid: String,
    pub direction: Direction,
    /// Signed: received minus sent.
    pub net_sats: i64,
    pub sent_sats: u64,
    pub received_sats: u64,
    pub fee_sats: Option<u64>,
    pub confirmed: bool,
    pub confirmations: u32,
    pub block_height: Option<u32>,
    pub timestamp: Option<u64>,
    pub input_count: usize,
    pub output_count: usize,
}

impl From<&WalletTransaction> for TransactionDto {
    fn from(transaction: &WalletTransaction) -> Self {
        Self {
            txid: transaction.txid.to_string(),
            direction: transaction.direction().into(),
            net_sats: transaction.net().to_sat(),
            sent_sats: transaction.sent.to_sat(),
            received_sats: transaction.received.to_sat(),
            fee_sats: transaction.fee.map(|fee| fee.to_sat()),
            confirmed: transaction.status.is_confirmed(),
            confirmations: transaction.status.confirmations(),
            block_height: transaction.status.block_height(),
            timestamp: transaction.timestamp,
            input_count: transaction.input_count,
            output_count: transaction.output_count,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TransactionListResponse {
    pub transactions: Vec<TransactionDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionInputDto {
    pub outpoint: String,
    pub value_sats: Option<u64>,
    pub is_mine: bool,
    pub keychain: Option<Keychain>,
    pub derivation_index: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionOutputDto {
    pub vout: u32,
    pub address: Option<String>,
    pub value_sats: u64,
    pub is_mine: bool,
    pub keychain: Option<Keychain>,
    pub derivation_index: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDetailDto {
    #[serde(flatten)]
    pub summary: TransactionDto,
    pub vsize: u64,
    pub inputs: Vec<TransactionInputDto>,
    pub outputs: Vec<TransactionOutputDto>,
}

impl From<&TransactionDetails> for TransactionDetailDto {
    fn from(details: &TransactionDetails) -> Self {
        Self {
            summary: (&details.summary).into(),
            vsize: details.vsize,
            inputs: details
                .inputs
                .iter()
                .map(|input| TransactionInputDto {
                    outpoint: input.previous_output.to_string(),
                    value_sats: input.value.map(|value| value.to_sat()),
                    is_mine: input.derivation.is_some(),
                    keychain: input.derivation.map(|(keychain, _)| keychain.into()),
                    derivation_index: input.derivation.map(|(_, index)| index),
                })
                .collect(),
            outputs: details
                .outputs
                .iter()
                .map(|output| TransactionOutputDto {
                    vout: output.vout,
                    address: output.address.as_ref().map(ToString::to_string),
                    value_sats: output.value.to_sat(),
                    is_mine: output.derivation.is_some(),
                    keychain: output.derivation.map(|(keychain, _)| keychain.into()),
                    derivation_index: output.derivation.map(|(_, index)| index),
                })
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewResponse {
    pub name: String,
    pub network: &'static str,
    pub balance: BalanceDto,
    pub wallet_height: u32,
    pub tip_hash: String,
    pub revealed_addresses: usize,
    pub used_addresses: usize,
    pub receive_address_count: usize,
    pub change_address_count: usize,
    pub utxo_count: usize,
    pub confirmed_utxo_count: usize,
    pub transaction_count: usize,
    pub latest_transaction: Option<TransactionDto>,
    pub receive_path: &'static str,
    pub change_path: &'static str,
}

impl OverviewResponse {
    pub fn new(name: String, overview: &WalletOverview) -> Self {
        Self {
            name,
            network: "regtest",
            balance: (&overview.balance).into(),
            wallet_height: overview.wallet_height,
            tip_hash: overview.tip_hash.to_string(),
            revealed_addresses: overview.revealed_addresses,
            used_addresses: overview.used_addresses,
            receive_address_count: overview.receive_address_count,
            change_address_count: overview.change_address_count,
            utxo_count: overview.utxo_count,
            confirmed_utxo_count: overview.confirmed_utxo_count,
            transaction_count: overview.transaction_count,
            latest_transaction: overview.latest_transaction.as_ref().map(Into::into),
            receive_path: RECEIVE_PATH,
            change_path: CHANGE_PATH,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub blocks_scanned: u64,
    pub mempool_transactions: usize,
    pub wallet_height: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressDto {
    pub address: String,
    pub keychain: Keychain,
    pub index: u32,
    pub derivation_path: String,
    pub used: bool,
}

impl From<&WalletAddress> for AddressDto {
    fn from(address: &WalletAddress) -> Self {
        Self {
            address: address.address.to_string(),
            keychain: address.keychain.into(),
            index: address.derivation_index,
            derivation_path: derivation_path(address.keychain, address.derivation_index),
            used: address.used,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AddressListResponse {
    pub addresses: Vec<AddressDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UtxoDto {
    pub outpoint: String,
    pub txid: String,
    pub vout: u32,
    pub value_sats: u64,
    pub address: Option<String>,
    pub keychain: Keychain,
    pub derivation_index: u32,
    pub derivation_path: String,
    pub confirmed: bool,
    pub confirmations: u32,
    pub block_height: Option<u32>,
}

impl From<&WalletUtxo> for UtxoDto {
    fn from(utxo: &WalletUtxo) -> Self {
        Self {
            outpoint: utxo.outpoint.to_string(),
            txid: utxo.outpoint.txid.to_string(),
            vout: utxo.outpoint.vout,
            value_sats: utxo.value.to_sat(),
            address: utxo.address.as_ref().map(ToString::to_string),
            keychain: utxo.keychain.into(),
            derivation_index: utxo.derivation_index,
            derivation_path: derivation_path(utxo.keychain, utxo.derivation_index),
            confirmed: utxo.status.is_confirmed(),
            confirmations: utxo.status.confirmations(),
            block_height: utxo.status.block_height(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct UtxoListResponse {
    pub utxos: Vec<UtxoDto>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FeeSourceDto {
    BitcoinCore,
    RegtestFallback,
    Manual,
}

impl From<FeeSource> for FeeSourceDto {
    fn from(source: FeeSource) -> Self {
        match source {
            FeeSource::BitcoinCore => Self::BitcoinCore,
            FeeSource::RegtestFallback => Self::RegtestFallback,
            FeeSource::Manual => Self::Manual,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeEstimateDto {
    pub confirmation_target: u16,
    pub sat_per_vb: u64,
    pub source: FeeSourceDto,
}

impl FeeEstimateDto {
    pub fn new(confirmation_target: u16, resolved: &ResolvedFeeRate) -> Self {
        Self {
            confirmation_target,
            sat_per_vb: resolved.sat_per_vb(),
            source: resolved.source.into(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeEstimatesResponse {
    pub estimates: Vec<FeeEstimateDto>,
    pub fallback_sat_per_vb: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewRequest {
    pub address: String,
    pub amount_sats: u64,
    pub confirmation_target: Option<u16>,
    pub fee_rate_sat_per_vb: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OutputRoleDto {
    Recipient,
    Change,
    External,
}

impl From<OutputRole> for OutputRoleDto {
    fn from(role: OutputRole) -> Self {
        match role {
            OutputRole::Recipient => Self::Recipient,
            OutputRole::Change => Self::Change,
            OutputRole::External => Self::External,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInputDto {
    pub outpoint: String,
    pub value_sats: u64,
    pub address: Option<String>,
    pub keychain: Option<Keychain>,
    pub derivation_index: Option<u32>,
    pub derivation_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewOutputDto {
    pub vout: u32,
    pub address: Option<String>,
    pub value_sats: u64,
    pub role: OutputRoleDto,
    pub keychain: Option<Keychain>,
    pub derivation_index: Option<u32>,
    pub derivation_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResponse {
    pub preview_id: String,
    pub expires_in_seconds: u64,
    pub destination: String,
    pub amount_sats: u64,
    pub fee_sats: u64,
    pub fee_rate_sat_per_vb: u64,
    pub fee_source: FeeSourceDto,
    pub confirmation_target: Option<u16>,
    pub input_total_sats: u64,
    pub output_total_sats: u64,
    pub change_sats: u64,
    pub vsize: u64,
    pub unsigned_txid: String,
    pub psbt_base64: String,
    pub inputs: Vec<PreviewInputDto>,
    pub outputs: Vec<PreviewOutputDto>,
}

impl PreviewResponse {
    pub fn new(preview_id: String, expires_in_seconds: u64, preview: &TransactionPreview) -> Self {
        let summary = &preview.summary;

        Self {
            preview_id,
            expires_in_seconds,
            destination: preview.destination.to_string(),
            amount_sats: preview.amount.to_sat(),
            fee_sats: summary.fee.to_sat(),
            fee_rate_sat_per_vb: preview.fee_rate.sat_per_vb(),
            fee_source: preview.fee_rate.source.into(),
            confirmation_target: preview.fee_rate.confirmation_target,
            input_total_sats: summary.input_total.to_sat(),
            output_total_sats: summary.output_total.to_sat(),
            change_sats: summary.change.to_sat(),
            vsize: summary.estimated_vsize,
            unsigned_txid: summary.unsigned_txid.to_string(),
            psbt_base64: preview.psbt.to_string(),
            inputs: summary
                .inputs
                .iter()
                .map(|input| PreviewInputDto {
                    outpoint: input.previous_output.to_string(),
                    value_sats: input.value.to_sat(),
                    address: input.address.as_ref().map(ToString::to_string),
                    keychain: input.derivation.map(|(keychain, _)| keychain.into()),
                    derivation_index: input.derivation.map(|(_, index)| index),
                    derivation_path: input
                        .derivation
                        .map(|(keychain, index)| derivation_path(keychain, index)),
                })
                .collect(),
            outputs: summary
                .outputs
                .iter()
                .map(|output| PreviewOutputDto {
                    vout: output.vout,
                    address: output.address.as_ref().map(ToString::to_string),
                    value_sats: output.value.to_sat(),
                    role: output.role.into(),
                    keychain: output.derivation.map(|(keychain, _)| keychain.into()),
                    derivation_index: output.derivation.map(|(_, index)| index),
                    derivation_path: output
                        .derivation
                        .map(|(keychain, index)| derivation_path(keychain, index)),
                })
                .collect(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SendRequest {
    pub preview_id: String,
    /// Zeroized when the request is dropped. Never logged.
    pub mnemonic: Zeroizing<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResponse {
    pub txid: String,
    pub signed_inputs: usize,
    pub synced: bool,
    pub wallet_height: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct ErrorDetail {
    pub code: &'static str,
    pub message: String,
}
