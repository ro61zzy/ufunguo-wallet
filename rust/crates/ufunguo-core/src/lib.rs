mod directory;
mod keys;
mod node;
pub mod service;
mod wallet;

pub use bdk_wallet::Balance;
pub use bdk_wallet::KeychainKind;
pub use directory::{WalletDirectory, WalletName, WalletNameError};
pub use keys::{WalletKeys, generate_mnemonic, parse_mnemonic};
pub use node::{
    NodeError, NodeStatus, SyncReport, bitcoin_node_status, broadcast_transaction,
    estimate_fee_rate, sync_wallet,
};
pub use wallet::{
    CHANGE_PATH, OutputRole, PsbtInputSummary, PsbtOutputSummary, PsbtSummary, RECEIVE_PATH,
    TransactionDetails, TransactionDirection, TransactionInputDetail, TransactionOutputDetail,
    TransactionStatus, UfunguoWallet, WalletAddress, WalletError, WalletOverview,
    WalletTransaction, WalletUtxo, derivation_path,
};

pub const WALLET_NAME: &str = "Ufunguo";

pub fn description() -> &'static str {
    "A transparent, non-custodial Bitcoin wallet"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_wallet_description() {
        assert_eq!(description(), "A transparent, non-custodial Bitcoin wallet");
    }
}
