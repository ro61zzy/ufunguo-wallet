use std::{collections::HashSet, path::Path};

use bdk_wallet::{
    Balance, CreateWithPersistError, KeychainKind, LoadWithPersistError, PersistedWallet,
    SignOptions, Wallet,
    chain::{ChainPosition, ConfirmationBlockTime},
    descriptor::template::Bip84,
    error::CreateTxError,
    rusqlite::{self, Connection},
    signer::SignerError,
};
use bitcoin::{
    Address, Amount, BlockHash, FeeRate, Network, OutPoint, Psbt, ScriptBuf, SignedAmount,
    Transaction, Txid,
    transaction::{InputWeightPrediction, predict_weight},
};
use thiserror::Error;

use crate::WalletKeys;

pub const RECEIVE_PATH: &str = "m/84'/1'/0'/0/*";
pub const CHANGE_PATH: &str = "m/84'/1'/0'/1/*";

#[derive(Debug)]
pub enum TransactionStatus {
    Unconfirmed,
    Confirmed {
        block_height: u32,
        confirmations: u32,
    },
}

impl TransactionStatus {
    pub fn is_confirmed(&self) -> bool {
        matches!(self, Self::Confirmed { .. })
    }

    pub fn confirmations(&self) -> u32 {
        match self {
            Self::Unconfirmed => 0,
            Self::Confirmed { confirmations, .. } => *confirmations,
        }
    }

    pub fn block_height(&self) -> Option<u32> {
        match self {
            Self::Unconfirmed => None,
            Self::Confirmed { block_height, .. } => Some(*block_height),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransactionDirection {
    Incoming,
    Outgoing,
    SelfTransfer,
}

#[derive(Debug)]
pub struct WalletTransaction {
    pub txid: Txid,
    pub sent: Amount,
    pub received: Amount,
    pub status: TransactionStatus,
    /// Known when every input spends an output the wallet knows about.
    pub fee: Option<Amount>,
    /// Block time when confirmed, first time seen in the mempool otherwise.
    pub timestamp: Option<u64>,
    pub input_count: usize,
    pub output_count: usize,
}

impl WalletTransaction {
    pub fn direction(&self) -> TransactionDirection {
        if self.received > self.sent {
            TransactionDirection::Incoming
        } else if self.sent > self.received {
            TransactionDirection::Outgoing
        } else {
            TransactionDirection::SelfTransfer
        }
    }

    /// Effect on the wallet balance: received minus sent.
    pub fn net(&self) -> SignedAmount {
        // Wallet amounts are bounded by the 21M BTC supply, so they fit in i64.
        SignedAmount::from_sat(self.received.to_sat() as i64 - self.sent.to_sat() as i64)
    }
}

#[derive(Debug)]
pub struct TransactionInputDetail {
    pub previous_output: OutPoint,
    /// Known when the spent output belongs to, or was seen by, this wallet.
    pub value: Option<Amount>,
    pub derivation: Option<(KeychainKind, u32)>,
}

#[derive(Debug)]
pub struct TransactionOutputDetail {
    pub vout: u32,
    pub address: Option<Address>,
    pub value: Amount,
    pub derivation: Option<(KeychainKind, u32)>,
}

#[derive(Debug)]
pub struct TransactionDetails {
    pub summary: WalletTransaction,
    pub vsize: u64,
    pub inputs: Vec<TransactionInputDetail>,
    pub outputs: Vec<TransactionOutputDetail>,
}

#[derive(Debug)]
pub struct WalletUtxo {
    pub outpoint: OutPoint,
    pub value: Amount,
    pub keychain: KeychainKind,
    pub derivation_index: u32,
    pub status: TransactionStatus,
    pub address: Option<Address>,
}

/// Everything the wallet knows locally, without contacting a node.
#[derive(Debug)]
pub struct WalletOverview {
    pub balance: Balance,
    pub wallet_height: u32,
    pub tip_hash: BlockHash,
    pub revealed_addresses: usize,
    pub used_addresses: usize,
    pub receive_address_count: usize,
    pub change_address_count: usize,
    pub utxo_count: usize,
    pub confirmed_utxo_count: usize,
    pub transaction_count: usize,
    pub latest_transaction: Option<WalletTransaction>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputRole {
    Recipient,
    Change,
    External,
}

#[derive(Debug)]
pub struct PsbtInputSummary {
    pub previous_output: OutPoint,
    pub value: Amount,
    pub address: Option<Address>,
    pub derivation: Option<(KeychainKind, u32)>,
}

#[derive(Debug)]
pub struct PsbtOutputSummary {
    pub vout: u32,
    pub address: Option<Address>,
    pub value: Amount,
    pub role: OutputRole,
    pub derivation: Option<(KeychainKind, u32)>,
}

/// What an unsigned PSBT will do, classified using the wallet's descriptors.
#[derive(Debug)]
pub struct PsbtSummary {
    pub fee: Amount,
    pub inputs: Vec<PsbtInputSummary>,
    pub outputs: Vec<PsbtOutputSummary>,
    pub input_total: Amount,
    pub output_total: Amount,
    pub change: Amount,
    /// Estimated size once the native SegWit inputs are signed.
    pub estimated_vsize: u64,
    pub unsigned_txid: Txid,
}

/// Concrete BIP84 path for one address, e.g. `m/84'/1'/0'/0/5`.
pub fn derivation_path(keychain: KeychainKind, index: u32) -> String {
    let template = match keychain {
        KeychainKind::External => RECEIVE_PATH,
        KeychainKind::Internal => CHANGE_PATH,
    };
    format!("{}{index}", template.trim_end_matches('*'))
}

fn transaction_status(
    position: &ChainPosition<ConfirmationBlockTime>,
    tip_height: u32,
) -> (TransactionStatus, Option<u64>) {
    match position {
        ChainPosition::Confirmed { anchor, .. } => {
            let block_height = anchor.block_id.height;
            let confirmations = tip_height.saturating_sub(block_height) + 1;

            (
                TransactionStatus::Confirmed {
                    block_height,
                    confirmations,
                },
                Some(anchor.confirmation_time),
            )
        }
        ChainPosition::Unconfirmed {
            first_seen,
            last_seen,
        } => (TransactionStatus::Unconfirmed, first_seen.or(*last_seen)),
    }
}

#[derive(Debug)]
pub struct WalletAddress {
    pub address: Address,
    pub keychain: KeychainKind,
    pub derivation_index: u32,
    pub used: bool,
}

#[derive(Debug, Error)]
pub enum WalletError {
    #[error("wallet database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("failed to create persisted wallet: {0}")]
    Create(#[from] CreateWithPersistError<rusqlite::Error>),

    #[error("failed to load persisted wallet: {0}")]
    Load(#[from] LoadWithPersistError<rusqlite::Error>),

    #[error("no wallet was found in the database")]
    NotFound,

    #[error("failed to build transaction: {0}")]
    BuildTransaction(#[from] CreateTxError),

    #[error("failed to sign PSBT: {0}")]
    SignPsbt(String),

    #[error("failed to finalize PSBT: {0}")]
    FinalizePsbt(#[from] SignerError),

    #[error("PSBT could not be completely finalized")]
    IncompletePsbt,

    #[error("invalid PSBT: {0}")]
    InvalidPsbt(String),
}

pub struct UfunguoWallet {
    pub(crate) inner: PersistedWallet<Connection>,
    pub(crate) connection: Connection,
}

impl UfunguoWallet {
    pub fn open_or_create(
        keys: &WalletKeys,
        database_path: impl AsRef<Path>,
    ) -> Result<Self, WalletError> {
        let mut connection = Connection::open(database_path)?;
        let master_xpriv = keys.master_xpriv();

        let loaded_wallet = Wallet::load()
            .descriptor(
                KeychainKind::External,
                Some(Bip84(master_xpriv, KeychainKind::External)),
            )
            .descriptor(
                KeychainKind::Internal,
                Some(Bip84(master_xpriv, KeychainKind::Internal)),
            )
            .check_network(keys.network())
            .load_wallet(&mut connection)?;

        let inner = match loaded_wallet {
            Some(wallet) => wallet,
            None => Wallet::create(
                Bip84(master_xpriv, KeychainKind::External),
                Bip84(master_xpriv, KeychainKind::Internal),
            )
            .network(keys.network())
            .create_wallet(&mut connection)?,
        };

        Ok(Self { inner, connection })
    }

    pub fn open_existing(
        database_path: impl AsRef<Path>,
        expected_network: Network,
    ) -> Result<Self, WalletError> {
        let mut connection = Connection::open(database_path)?;

        let inner = Wallet::load()
            .check_network(expected_network)
            .load_wallet(&mut connection)?
            .ok_or(WalletError::NotFound)?;

        Ok(Self { inner, connection })
    }

    pub fn network(&self) -> Network {
        self.inner.network()
    }

    pub fn balance(&self) -> Balance {
        self.inner.balance()
    }

    pub fn transactions(&self) -> Vec<WalletTransaction> {
        let tip_height = self.inner.latest_checkpoint().height();

        self.inner
            .transactions_sort_by(|first, second| second.chain_position.cmp(&first.chain_position))
            .into_iter()
            .map(|wallet_transaction| {
                let transaction = wallet_transaction.tx_node.tx;
                self.summarize_transaction(
                    &transaction,
                    &wallet_transaction.chain_position,
                    tip_height,
                )
            })
            .collect()
    }

    fn summarize_transaction(
        &self,
        transaction: &Transaction,
        position: &ChainPosition<ConfirmationBlockTime>,
        tip_height: u32,
    ) -> WalletTransaction {
        let (sent, received) = self.inner.sent_and_received(transaction);
        let (status, timestamp) = transaction_status(position, tip_height);

        WalletTransaction {
            txid: transaction.compute_txid(),
            sent,
            received,
            status,
            fee: self.inner.calculate_fee(transaction).ok(),
            timestamp,
            input_count: transaction.input.len(),
            output_count: transaction.output.len(),
        }
    }

    pub fn transaction_details(&self, txid: Txid) -> Option<TransactionDetails> {
        let tip_height = self.inner.latest_checkpoint().height();
        let wallet_transaction = self.inner.get_tx(txid)?;
        let transaction = wallet_transaction.tx_node.tx.clone();
        let summary = self.summarize_transaction(
            &transaction,
            &wallet_transaction.chain_position,
            tip_height,
        );

        let inputs = transaction
            .input
            .iter()
            .map(|input| {
                let previous = self.inner.tx_graph().get_txout(input.previous_output);

                TransactionInputDetail {
                    previous_output: input.previous_output,
                    value: previous.map(|output| output.value),
                    derivation: previous.and_then(|output| {
                        self.inner.derivation_of_spk(output.script_pubkey.clone())
                    }),
                }
            })
            .collect();

        let outputs = transaction
            .output
            .iter()
            .enumerate()
            .map(|(vout, output)| TransactionOutputDetail {
                vout: vout as u32,
                address: Address::from_script(&output.script_pubkey, self.network()).ok(),
                value: output.value,
                derivation: self.inner.derivation_of_spk(output.script_pubkey.clone()),
            })
            .collect();

        Some(TransactionDetails {
            summary,
            vsize: transaction.vsize() as u64,
            inputs,
            outputs,
        })
    }

    pub fn unspent_outputs(&self) -> Vec<WalletUtxo> {
        let tip_height = self.inner.latest_checkpoint().height();

        self.inner
            .list_unspent()
            .map(|output| {
                let (status, _) = transaction_status(&output.chain_position, tip_height);

                WalletUtxo {
                    outpoint: output.outpoint,
                    value: output.txout.value,
                    keychain: output.keychain,
                    derivation_index: output.derivation_index,
                    status,
                    address: Address::from_script(&output.txout.script_pubkey, self.network()).ok(),
                }
            })
            .collect()
    }

    pub fn overview(&self) -> WalletOverview {
        let addresses = self.addresses();
        let utxos = self.unspent_outputs();
        let transactions = self.transactions();
        let tip = self.inner.latest_checkpoint();

        WalletOverview {
            balance: self.balance(),
            wallet_height: tip.height(),
            tip_hash: tip.hash(),
            revealed_addresses: addresses.len(),
            used_addresses: addresses.iter().filter(|address| address.used).count(),
            receive_address_count: addresses
                .iter()
                .filter(|address| address.keychain == KeychainKind::External)
                .count(),
            change_address_count: addresses
                .iter()
                .filter(|address| address.keychain == KeychainKind::Internal)
                .count(),
            utxo_count: utxos.len(),
            confirmed_utxo_count: utxos
                .iter()
                .filter(|utxo| utxo.status.is_confirmed())
                .count(),
            transaction_count: transactions.len(),
            latest_transaction: transactions.into_iter().next(),
        }
    }

    pub fn addresses(&self) -> Vec<WalletAddress> {
        let mut addresses = Vec::new();

        for keychain in [KeychainKind::External, KeychainKind::Internal] {
            let unused_indices: HashSet<u32> = self
                .inner
                .list_unused_addresses(keychain)
                .map(|address| address.index)
                .collect();

            let Some(last_revealed_index) = self.inner.derivation_index(keychain) else {
                continue;
            };

            for index in 0..=last_revealed_index {
                let address = self.inner.peek_address(keychain, index).address;

                addresses.push(WalletAddress {
                    address,
                    keychain,
                    derivation_index: index,
                    used: !unused_indices.contains(&index),
                });
            }
        }

        addresses
    }

    pub fn build_psbt(
        &mut self,
        destination: &Address,
        amount: Amount,
        fee_rate: FeeRate,
    ) -> Result<Psbt, WalletError> {
        let mut builder = self.inner.build_tx();

        builder
            .add_recipient(destination.script_pubkey(), amount)
            .fee_rate(fee_rate);

        let psbt = builder.finish()?;

        // Building the transaction may reveal a new internal change address.
        // Persist that derivation state so the wallet remembers it.
        self.inner.persist(&mut self.connection)?;

        Ok(psbt)
    }

    pub fn sign_psbt(&self, psbt: &mut Psbt, keys: &WalletKeys) -> Result<usize, WalletError> {
        let master_xpriv = keys.master_xpriv();

        let signed_inputs = match psbt.sign(&master_xpriv, self.inner.secp_ctx()) {
            Ok(signed_inputs) => signed_inputs,
            Err((signed_inputs, errors)) => {
                return Err(WalletError::SignPsbt(format!(
                    "signed inputs: {signed_inputs:?}; errors: {errors:?}"
                )));
            }
        };

        if signed_inputs.is_empty() {
            return Err(WalletError::SignPsbt(
                "the supplied recovery phrase did not match any PSBT input".to_owned(),
            ));
        }

        let finalized = self.inner.finalize_psbt(psbt, SignOptions::default())?;

        if !finalized {
            return Err(WalletError::IncompletePsbt);
        }

        Ok(signed_inputs.len())
    }

    pub fn transaction(&self, txid: Txid) -> Option<WalletTransaction> {
        self.transactions()
            .into_iter()
            .find(|transaction| transaction.txid == txid)
    }

    pub fn receive_address_at(&self, index: u32) -> Address {
        self.inner
            .peek_address(KeychainKind::External, index)
            .address
    }

    pub fn change_address_at(&self, index: u32) -> Address {
        self.inner
            .peek_address(KeychainKind::Internal, index)
            .address
    }

    pub fn next_receive_address(&mut self) -> Result<Address, WalletError> {
        Ok(self.reveal_receive_address()?.address)
    }

    /// Reveals the next external index and persists it, returning its details.
    pub fn reveal_receive_address(&mut self) -> Result<WalletAddress, WalletError> {
        let info = self.inner.reveal_next_address(KeychainKind::External);

        self.inner.persist(&mut self.connection)?;

        Ok(WalletAddress {
            address: info.address,
            keychain: KeychainKind::External,
            derivation_index: info.index,
            used: false,
        })
    }

    /// Classifies a PSBT's inputs and outputs against this wallet's descriptors.
    pub fn summarize_psbt(
        &self,
        psbt: &Psbt,
        destination: &Address,
    ) -> Result<PsbtSummary, WalletError> {
        let network = self.network();
        let fee = psbt
            .fee()
            .map_err(|error| WalletError::InvalidPsbt(error.to_string()))?;

        let inputs: Vec<PsbtInputSummary> = psbt
            .unsigned_tx
            .input
            .iter()
            .zip(&psbt.inputs)
            .map(|(input, psbt_input)| {
                let previous = psbt_input.witness_utxo.clone().or_else(|| {
                    self.inner
                        .tx_graph()
                        .get_txout(input.previous_output)
                        .cloned()
                });
                let script = previous.as_ref().map(|output| output.script_pubkey.clone());

                PsbtInputSummary {
                    previous_output: input.previous_output,
                    value: previous
                        .as_ref()
                        .map_or(Amount::ZERO, |output| output.value),
                    address: script
                        .as_ref()
                        .and_then(|script| Address::from_script(script, network).ok()),
                    derivation: script.and_then(|script| self.inner.derivation_of_spk(script)),
                }
            })
            .collect();

        let destination_script = destination.script_pubkey();
        let outputs: Vec<PsbtOutputSummary> = psbt
            .unsigned_tx
            .output
            .iter()
            .enumerate()
            .map(|(vout, output)| {
                let derivation = self.inner.derivation_of_spk(output.script_pubkey.clone());
                let role = if output.script_pubkey == destination_script {
                    OutputRole::Recipient
                } else if matches!(derivation, Some((KeychainKind::Internal, _))) {
                    OutputRole::Change
                } else {
                    OutputRole::External
                };

                PsbtOutputSummary {
                    vout: vout as u32,
                    address: Address::from_script(&output.script_pubkey, network).ok(),
                    value: output.value,
                    role,
                    derivation,
                }
            })
            .collect();

        let input_total = inputs.iter().map(|input| input.value).sum();
        let output_total = outputs.iter().map(|output| output.value).sum();
        let change = outputs
            .iter()
            .filter(|output| output.role == OutputRole::Change)
            .map(|output| output.value)
            .sum();
        let estimated_weight = predict_weight(
            inputs.iter().map(|_| InputWeightPrediction::P2WPKH_MAX),
            psbt.unsigned_tx
                .output
                .iter()
                .map(|output| output.script_pubkey.len()),
        );

        Ok(PsbtSummary {
            fee,
            inputs,
            outputs,
            input_total,
            output_total,
            change,
            estimated_vsize: estimated_weight.to_vbytes_ceil(),
            unsigned_txid: psbt.unsigned_tx.compute_txid(),
        })
    }

    pub fn is_mine(&self, script: ScriptBuf) -> bool {
        self.inner.is_mine(script)
    }

    /// Test helper: records an unconfirmed payment of `amount` to the next
    /// receive address, as if it had been seen in the mempool.
    #[cfg(any(test, feature = "test-utils"))]
    pub fn receive_unconfirmed_for_tests(&mut self, amount: Amount) -> Result<Txid, WalletError> {
        use bitcoin::{
            ScriptBuf, Sequence, TxIn, TxOut, Witness, absolute::LockTime, hashes::Hash,
            transaction::Version,
        };

        let address = self.reveal_receive_address()?.address;
        let transaction = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![TxOut {
                value: amount,
                script_pubkey: address.script_pubkey(),
            }],
        };
        let txid = transaction.compute_txid();

        self.inner
            .apply_unconfirmed_txs([(transaction, 1_700_000_000)]);
        self.inner.persist(&mut self.connection)?;

        Ok(txid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_mnemonic;

    const VALID_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon \
         abandon abandon abandon abandon abandon about";

    fn test_keys() -> WalletKeys {
        let mnemonic = parse_mnemonic(VALID_MNEMONIC).expect("test mnemonic should be valid");

        WalletKeys::from_mnemonic(&mnemonic, Network::Regtest)
            .expect("key derivation should succeed")
    }

    #[test]
    fn creates_regtest_wallet() {
        let directory = tempfile::tempdir().expect("temp directory");
        let database = directory.path().join("wallet.sqlite");

        let wallet = UfunguoWallet::open_or_create(&test_keys(), database)
            .expect("wallet creation should succeed");

        assert_eq!(wallet.network(), Network::Regtest);
    }

    #[test]
    fn derives_different_receive_and_change_addresses() {
        let directory = tempfile::tempdir().expect("temp directory");
        let database = directory.path().join("wallet.sqlite");

        let wallet = UfunguoWallet::open_or_create(&test_keys(), database)
            .expect("wallet creation should succeed");

        let receive = wallet.receive_address_at(0);
        let change = wallet.change_address_at(0);

        assert_ne!(receive, change);
        assert!(receive.to_string().starts_with("bcrt1q"));
        assert!(change.to_string().starts_with("bcrt1q"));
    }

    #[test]
    fn persists_the_next_receive_address() {
        let directory = tempfile::tempdir().expect("temp directory");
        let database = directory.path().join("wallet.sqlite");
        let keys = test_keys();

        let first_address = {
            let mut wallet = UfunguoWallet::open_or_create(&keys, &database)
                .expect("wallet creation should succeed");

            wallet
                .next_receive_address()
                .expect("address should persist")
        };

        let second_address = {
            let mut wallet = UfunguoWallet::open_existing(&database, Network::Regtest)
                .expect("wallet loading should succeed");

            wallet
                .next_receive_address()
                .expect("address should persist")
        };

        assert_ne!(first_address, second_address);
    }

    #[test]
    fn lists_revealed_addresses_and_tracks_usage() {
        let directory = tempfile::tempdir().expect("temp directory");
        let database = directory.path().join("wallet.sqlite");
        let keys = test_keys();

        let mut wallet =
            UfunguoWallet::open_or_create(&keys, database).expect("wallet creation should succeed");

        let address = wallet
            .next_receive_address()
            .expect("address should persist");

        let listed = wallet
            .addresses()
            .into_iter()
            .find(|entry| entry.address == address)
            .expect("revealed address should be listed");

        assert_eq!(listed.keychain, KeychainKind::External);
        assert_eq!(listed.derivation_index, 0);
        assert!(!listed.used);

        assert!(wallet.inner.mark_used(KeychainKind::External, 0));

        let marked_used = wallet
            .addresses()
            .into_iter()
            .find(|entry| entry.address == address)
            .expect("used address should remain listed");

        assert!(marked_used.used);
    }
}
