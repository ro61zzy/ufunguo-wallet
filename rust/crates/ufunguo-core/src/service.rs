//! Application operations shared by every interface (CLI, local API).
//!
//! These functions hold the wallet rules that used to live in the CLI:
//! configuration, fee resolution, address validation, safe wallet creation
//! and restoration, transaction previews, and signing plus broadcasting.

use std::{
    env, fmt,
    fs::{self, OpenOptions},
    io,
    path::Path,
    str::FromStr,
};

use bdk_wallet::{LoadWithPersistError, coin_selection::InsufficientFunds, error::CreateTxError};
use bip39::Mnemonic;
use bitcoin::{Address, Amount, FeeRate, Network, Psbt, Txid, bip32::Fingerprint};
use thiserror::Error;

use crate::{
    CHANGE_PATH, NodeStatus, PsbtSummary, RECEIVE_PATH, UfunguoWallet, WalletError, WalletKeys,
    WalletNameError, bitcoin_node_status, broadcast_transaction, estimate_fee_rate,
    generate_mnemonic, node::NodeError, parse_mnemonic,
};

/// Ufunguo is a regtest-only educational wallet.
pub const NETWORK: Network = Network::Regtest;

/// Used when Bitcoin Core has too little fee history (always true on a fresh
/// regtest chain).
pub const DEFAULT_FEE_RATE_SAT_VB: u64 = 2;

pub const DEFAULT_CONFIRMATION_TARGET: u16 = 6;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("invalid wallet name: {0}")]
    InvalidWalletName(#[from] WalletNameError),

    #[error("wallet {0} was not found")]
    WalletNotFound(String),

    #[error("a wallet database already exists at {0}; refusing to overwrite it")]
    WalletExists(String),

    #[error("wallet {0} belongs to a different recovery phrase")]
    WalletMismatch(String),

    // bip39 errors describe word positions and counts, never the words.
    #[error("invalid recovery phrase: {0}")]
    InvalidMnemonic(#[from] bip39::Error),

    #[error("invalid Bitcoin address: {0}")]
    InvalidAddress(String),

    #[error("address is not a regtest address")]
    WrongNetwork,

    #[error("amount must be greater than zero")]
    InvalidAmount,

    #[error("fee rate must be at least 1 sat/vB")]
    InvalidFeeRate,

    #[error("insufficient funds: {needed} needed, {available} available")]
    InsufficientFunds { needed: Amount, available: Amount },

    #[error("transaction {0} was not found in this wallet")]
    TransactionNotFound(Txid),

    #[error("missing environment variable: {0}")]
    MissingConfig(&'static str),

    #[error("could not reach Bitcoin Core: {0}")]
    NodeUnavailable(NodeError),

    #[error("network mismatch: Ufunguo expects regtest, but Bitcoin Core uses {0}")]
    WrongNodeNetwork(String),

    #[error("failed to sign transaction: {0}")]
    Signing(String),

    #[error("Bitcoin Core rejected the transaction: {0}")]
    BroadcastRejected(String),

    #[error("failed to derive wallet keys: {0}")]
    KeyDerivation(#[from] bitcoin::bip32::Error),

    #[error(transparent)]
    Wallet(WalletError),

    #[error("wallet file error: {0}")]
    Io(#[from] io::Error),
}

impl ServiceError {
    /// Stable machine-readable code, used by the API's error responses.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidWalletName(_) => "invalid_wallet_name",
            Self::WalletNotFound(_) => "wallet_not_found",
            Self::WalletExists(_) => "wallet_exists",
            Self::WalletMismatch(_) => "wallet_mismatch",
            Self::InvalidMnemonic(_) => "invalid_mnemonic",
            Self::InvalidAddress(_) => "invalid_address",
            Self::WrongNetwork => "wrong_network",
            Self::InvalidAmount => "invalid_amount",
            Self::InvalidFeeRate => "invalid_fee_rate",
            Self::InsufficientFunds { .. } => "insufficient_funds",
            Self::TransactionNotFound(_) => "transaction_not_found",
            Self::MissingConfig(_) | Self::NodeUnavailable(_) | Self::WrongNodeNetwork(_) => {
                "node_unavailable"
            }
            Self::Signing(_) => "signing_failed",
            Self::BroadcastRejected(_) => "broadcast_failed",
            Self::KeyDerivation(_) | Self::Wallet(_) | Self::Io(_) => "internal_error",
        }
    }
}

impl From<WalletError> for ServiceError {
    fn from(error: WalletError) -> Self {
        match error {
            WalletError::BuildTransaction(CreateTxError::CoinSelection(InsufficientFunds {
                needed,
                available,
            })) => Self::InsufficientFunds { needed, available },
            WalletError::BuildTransaction(CreateTxError::OutputBelowDustLimit(_)) => {
                Self::InvalidAmount
            }
            WalletError::SignPsbt(message) => Self::Signing(message),
            WalletError::FinalizePsbt(error) => Self::Signing(error.to_string()),
            WalletError::IncompletePsbt => {
                Self::Signing("PSBT could not be completely finalized".to_owned())
            }
            other => Self::Wallet(other),
        }
    }
}

impl From<NodeError> for ServiceError {
    fn from(error: NodeError) -> Self {
        Self::NodeUnavailable(error)
    }
}

/// Bitcoin Core RPC connection settings. Stays inside the Rust process.
#[derive(Clone)]
pub struct RpcConfig {
    pub url: String,
    pub user: String,
    pub password: String,
}

impl fmt::Debug for RpcConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RpcConfig")
            .field("url", &self.url)
            .field("user", &self.user)
            .field("password", &"<redacted>")
            .finish()
    }
}

impl RpcConfig {
    /// Reads `BITCOIN_RPC_URL`, `BITCOIN_RPC_USER` and `BITCOIN_RPC_PASSWORD`,
    /// loading a `.env` file from the working directory if present.
    pub fn from_env() -> Result<Self, ServiceError> {
        let _ = dotenvy::dotenv();

        Ok(Self {
            url: required_variable("BITCOIN_RPC_URL")?,
            user: required_variable("BITCOIN_RPC_USER")?,
            password: required_variable("BITCOIN_RPC_PASSWORD")?,
        })
    }

    pub fn node_status(&self) -> Result<NodeStatus, ServiceError> {
        Ok(bitcoin_node_status(&self.url, &self.user, &self.password)?)
    }

    /// Connects to Bitcoin Core and refuses anything but regtest.
    pub fn ensure_regtest_node(&self) -> Result<NodeStatus, ServiceError> {
        let status = self.node_status()?;

        if status.network != "regtest" {
            return Err(ServiceError::WrongNodeNetwork(status.network));
        }

        Ok(status)
    }

    pub fn sync(&self, wallet: &mut UfunguoWallet) -> Result<crate::SyncReport, ServiceError> {
        Ok(crate::sync_wallet(
            wallet,
            &self.url,
            &self.user,
            &self.password,
        )?)
    }
}

fn required_variable(name: &'static str) -> Result<String, ServiceError> {
    env::var(name).map_err(|_| ServiceError::MissingConfig(name))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeeSource {
    BitcoinCore,
    RegtestFallback,
    Manual,
}

impl FeeSource {
    pub fn describe(self) -> &'static str {
        match self {
            Self::BitcoinCore => "Bitcoin Core estimate",
            Self::RegtestFallback => "regtest fallback",
            Self::Manual => "manual override",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ResolvedFeeRate {
    pub rate: FeeRate,
    pub source: FeeSource,
    pub confirmation_target: Option<u16>,
}

impl ResolvedFeeRate {
    pub fn sat_per_vb(&self) -> u64 {
        self.rate.to_sat_per_vb_ceil()
    }
}

pub fn manual_fee_rate(sat_per_vb: u64) -> Result<ResolvedFeeRate, ServiceError> {
    if sat_per_vb == 0 {
        return Err(ServiceError::InvalidFeeRate);
    }

    let rate = FeeRate::from_sat_per_vb(sat_per_vb).ok_or(ServiceError::InvalidFeeRate)?;

    Ok(ResolvedFeeRate {
        rate,
        source: FeeSource::Manual,
        confirmation_target: None,
    })
}

/// A manual rate wins; otherwise ask Bitcoin Core, falling back to
/// [`DEFAULT_FEE_RATE_SAT_VB`] when it has no estimate.
pub fn resolve_fee_rate(
    rpc: &RpcConfig,
    manual_sat_per_vb: Option<u64>,
    confirmation_target: u16,
) -> Result<ResolvedFeeRate, ServiceError> {
    if let Some(sat_per_vb) = manual_sat_per_vb {
        return manual_fee_rate(sat_per_vb);
    }

    let estimate = estimate_fee_rate(&rpc.url, &rpc.user, &rpc.password, confirmation_target)?;

    Ok(match estimate {
        Some(rate) => ResolvedFeeRate {
            rate,
            source: FeeSource::BitcoinCore,
            confirmation_target: Some(confirmation_target),
        },
        None => ResolvedFeeRate {
            rate: FeeRate::from_sat_per_vb_u32(DEFAULT_FEE_RATE_SAT_VB as u32),
            source: FeeSource::RegtestFallback,
            confirmation_target: Some(confirmation_target),
        },
    })
}

pub fn parse_regtest_address(address: &str) -> Result<Address, ServiceError> {
    Address::from_str(address.trim())
        .map_err(|error| ServiceError::InvalidAddress(error.to_string()))?
        .require_network(NETWORK)
        .map_err(|_| ServiceError::WrongNetwork)
}

pub fn positive_amount(amount_sats: u64) -> Result<Amount, ServiceError> {
    if amount_sats == 0 {
        return Err(ServiceError::InvalidAmount);
    }

    Ok(Amount::from_sat(amount_sats))
}

/// Opens a wallet that must already exist, without creating an empty file.
pub fn open_existing_wallet(path: &Path, label: &str) -> Result<UfunguoWallet, ServiceError> {
    if !path.is_file() {
        return Err(ServiceError::WalletNotFound(label.to_owned()));
    }

    UfunguoWallet::open_existing(path, NETWORK).map_err(|error| match error {
        WalletError::NotFound => ServiceError::WalletNotFound(label.to_owned()),
        other => other.into(),
    })
}

/// Result of creating a wallet. Holds the mnemonic, which is zeroized when
/// this value is dropped; callers must display it once and never store it.
pub struct CreatedWallet {
    pub mnemonic: Mnemonic,
    pub master_fingerprint: Fingerprint,
    pub first_receive_address: Address,
}

impl fmt::Debug for CreatedWallet {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CreatedWallet")
            .field("mnemonic", &"<redacted>")
            .field("master_fingerprint", &self.master_fingerprint)
            .field("first_receive_address", &self.first_receive_address)
            .finish()
    }
}

#[derive(Debug)]
pub struct RestoredWallet {
    pub master_fingerprint: Fingerprint,
    pub first_receive_address: Address,
    pub already_existed: bool,
}

pub const PATHS: (&str, &str) = (RECEIVE_PATH, CHANGE_PATH);

/// Claims `path` atomically (fails if it exists), then creates a new BIP84
/// wallet in it. Never overwrites an existing database.
pub fn create_wallet(path: &Path) -> Result<CreatedWallet, ServiceError> {
    claim_new_file(path)?;

    let result = (|| {
        let mnemonic = generate_mnemonic()?;
        let keys = WalletKeys::from_mnemonic(&mnemonic, NETWORK)?;
        let wallet = UfunguoWallet::open_or_create(&keys, path)?;

        Ok(CreatedWallet {
            master_fingerprint: keys.master_fingerprint(),
            first_receive_address: wallet.receive_address_at(0),
            mnemonic,
        })
    })();

    if result.is_err() {
        // Only remove the file this call created.
        let _ = fs::remove_file(path);
    }

    result
}

/// Rebuilds a wallet from its recovery phrase. An existing database is only
/// reopened when its descriptors match the phrase.
pub fn restore_wallet(path: &Path, phrase: &str) -> Result<RestoredWallet, ServiceError> {
    let mnemonic = parse_mnemonic(phrase)?;
    let keys = WalletKeys::from_mnemonic(&mnemonic, NETWORK)?;
    let label = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("wallet")
        .to_owned();

    let created_file = match claim_new_file(path) {
        Ok(()) => true,
        Err(ServiceError::WalletExists(_)) => false,
        Err(error) => return Err(error),
    };

    // `open_or_create` loads with our descriptors attached, so BDK rejects a
    // database that belongs to another phrase before anything is written.
    match UfunguoWallet::open_or_create(&keys, path) {
        Ok(wallet) => Ok(RestoredWallet {
            master_fingerprint: keys.master_fingerprint(),
            first_receive_address: wallet.receive_address_at(0),
            already_existed: !created_file,
        }),
        Err(error) => {
            if created_file {
                let _ = fs::remove_file(path);
            }
            Err(match error {
                WalletError::Load(LoadWithPersistError::InvalidChangeSet(_)) => {
                    ServiceError::WalletMismatch(label)
                }
                other => other.into(),
            })
        }
    }
}

fn claim_new_file(path: &Path) -> Result<(), ServiceError> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }

    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            Err(ServiceError::WalletExists(path.display().to_string()))
        }
        Err(error) => Err(error.into()),
    }
}

/// An unsigned transaction ready for the user to review.
#[derive(Debug)]
pub struct TransactionPreview {
    pub destination: Address,
    pub amount: Amount,
    pub fee_rate: ResolvedFeeRate,
    pub summary: PsbtSummary,
    pub psbt: Psbt,
}

/// Selects coins and builds an unsigned PSBT. Nothing is signed.
pub fn preview_payment(
    wallet: &mut UfunguoWallet,
    destination: Address,
    amount: Amount,
    fee_rate: ResolvedFeeRate,
) -> Result<TransactionPreview, ServiceError> {
    let psbt = wallet.build_psbt(&destination, amount, fee_rate.rate)?;
    let summary = wallet.summarize_psbt(&psbt, &destination)?;

    Ok(TransactionPreview {
        destination,
        amount,
        fee_rate,
        summary,
        psbt,
    })
}

#[derive(Debug)]
pub struct SignedTransaction {
    pub transaction: bitcoin::Transaction,
    pub signed_inputs: usize,
}

/// Derives keys from the recovery phrase, signs every owned input and
/// finalizes the PSBT. The keys are dropped when this returns.
pub fn sign_psbt_with_phrase(
    wallet: &UfunguoWallet,
    mut psbt: Psbt,
    phrase: &str,
) -> Result<SignedTransaction, ServiceError> {
    let mnemonic = parse_mnemonic(phrase)?;
    let keys = WalletKeys::from_mnemonic(&mnemonic, NETWORK)?;
    let signed_inputs = wallet.sign_psbt(&mut psbt, &keys)?;
    let transaction = psbt
        .extract_tx()
        .map_err(|error| ServiceError::Signing(error.to_string()))?;

    Ok(SignedTransaction {
        transaction,
        signed_inputs,
    })
}

pub fn broadcast(
    rpc: &RpcConfig,
    transaction: &bitcoin::Transaction,
) -> Result<Txid, ServiceError> {
    broadcast_transaction(&rpc.url, &rpc.user, &rpc.password, transaction).map_err(|error| {
        if error.is_rejection() {
            ServiceError::BroadcastRejected(error.to_string())
        } else {
            ServiceError::NodeUnavailable(error)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PHRASE: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const OTHER_PHRASE: &str =
        "legal winner thank year wave sausage worth useful legal winner thank yellow";

    #[test]
    fn create_refuses_to_overwrite_an_existing_wallet() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("alice.sqlite");

        let first = create_wallet(&path).expect("first create succeeds");
        let before = fs::read(&path).expect("read wallet");

        let second = create_wallet(&path);

        assert!(matches!(second, Err(ServiceError::WalletExists(_))));
        assert_eq!(fs::read(&path).expect("read wallet"), before);
        assert_eq!(first.mnemonic.word_count(), 12);
    }

    #[test]
    fn created_wallet_debug_output_hides_the_mnemonic() {
        let directory = tempfile::tempdir().expect("temp directory");
        let created = create_wallet(&directory.path().join("w.sqlite")).expect("create");

        let debug = format!("{created:?}");

        assert!(debug.contains("<redacted>"));
        assert!(!debug.contains(&created.mnemonic.to_string()));
    }

    #[test]
    fn restore_creates_a_new_wallet_and_is_idempotent() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("bob.sqlite");

        let restored = restore_wallet(&path, PHRASE).expect("restore");
        let again = restore_wallet(&path, PHRASE).expect("restore again");

        assert!(!restored.already_existed);
        assert!(again.already_existed);
        assert_eq!(restored.first_receive_address, again.first_receive_address);
    }

    #[test]
    fn restore_refuses_a_wallet_belonging_to_another_phrase() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("bob.sqlite");
        restore_wallet(&path, PHRASE).expect("restore");
        let before = fs::read(&path).expect("read wallet");

        let result = restore_wallet(&path, OTHER_PHRASE);

        assert!(matches!(result, Err(ServiceError::WalletMismatch(_))));
        assert_eq!(fs::read(&path).expect("read wallet"), before);
    }

    #[test]
    fn restore_rejects_invalid_phrases_without_creating_files() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("bob.sqlite");

        let result = restore_wallet(&path, "abandon abandon abandon");

        assert!(matches!(result, Err(ServiceError::InvalidMnemonic(_))));
        assert!(!path.exists());
    }

    #[test]
    fn opening_a_missing_wallet_does_not_create_a_file() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("ghost.sqlite");

        let result = open_existing_wallet(&path, "ghost");

        assert!(matches!(result, Err(ServiceError::WalletNotFound(_))));
        assert!(!path.exists());
    }

    #[test]
    fn validates_addresses_amounts_and_fee_rates() {
        assert!(parse_regtest_address("bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk").is_ok());
        assert!(matches!(
            parse_regtest_address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"),
            Err(ServiceError::WrongNetwork)
        ));
        assert!(matches!(
            parse_regtest_address("not-an-address"),
            Err(ServiceError::InvalidAddress(_))
        ));
        assert!(matches!(
            positive_amount(0),
            Err(ServiceError::InvalidAmount)
        ));
        assert!(matches!(
            manual_fee_rate(0),
            Err(ServiceError::InvalidFeeRate)
        ));
        assert_eq!(manual_fee_rate(5).expect("valid").sat_per_vb(), 5);
    }

    #[test]
    fn rpc_config_debug_output_redacts_the_password() {
        let config = RpcConfig {
            url: "http://127.0.0.1:18443".to_owned(),
            user: "polaruser".to_owned(),
            password: "super-secret".to_owned(),
        };

        assert!(!format!("{config:?}").contains("super-secret"));
    }

    #[test]
    fn previews_classify_recipient_and_change_outputs() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("alice.sqlite");
        restore_wallet(&path, PHRASE).expect("restore");
        let mut wallet = open_existing_wallet(&path, "alice").expect("open");
        wallet
            .receive_unconfirmed_for_tests(Amount::from_sat(100_000))
            .expect("fund");
        let destination =
            parse_regtest_address("bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080").expect("address");

        let preview = preview_payment(
            &mut wallet,
            destination.clone(),
            Amount::from_sat(25_000),
            manual_fee_rate(2).expect("fee rate"),
        )
        .expect("preview");
        let summary = &preview.summary;

        assert_eq!(summary.inputs.len(), 1);
        assert_eq!(summary.input_total, Amount::from_sat(100_000));
        assert_eq!(summary.outputs.len(), 2);
        let recipient = summary
            .outputs
            .iter()
            .find(|output| output.role == crate::OutputRole::Recipient)
            .expect("recipient output");
        assert_eq!(recipient.value, Amount::from_sat(25_000));
        assert_eq!(recipient.address.as_ref(), Some(&destination));
        let change = summary
            .outputs
            .iter()
            .find(|output| output.role == crate::OutputRole::Change)
            .expect("change output");
        assert!(matches!(
            change.derivation,
            Some((bdk_wallet::KeychainKind::Internal, 0))
        ));
        assert_eq!(summary.input_total, summary.output_total + summary.fee);
        assert_eq!(summary.change, change.value);
        assert!(summary.fee.to_sat() >= 2 * summary.estimated_vsize - 2);
    }

    #[test]
    fn signing_with_the_wrong_phrase_fails() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("alice.sqlite");
        restore_wallet(&path, PHRASE).expect("restore");
        let mut wallet = open_existing_wallet(&path, "alice").expect("open");
        wallet
            .receive_unconfirmed_for_tests(Amount::from_sat(100_000))
            .expect("fund");
        let destination =
            parse_regtest_address("bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080").expect("address");
        let preview = preview_payment(
            &mut wallet,
            destination,
            Amount::from_sat(25_000),
            manual_fee_rate(2).expect("fee rate"),
        )
        .expect("preview");

        let wrong = sign_psbt_with_phrase(&wallet, preview.psbt.clone(), OTHER_PHRASE);
        let right = sign_psbt_with_phrase(&wallet, preview.psbt, PHRASE).expect("signs");

        assert!(matches!(wrong, Err(ServiceError::Signing(_))));
        assert_eq!(right.signed_inputs, 1);
        assert_eq!(
            right.transaction.compute_txid(),
            preview.summary.unsigned_txid
        );
    }
}
