mod keys;
mod node;
mod wallet;

pub use bdk_wallet::KeychainKind;
pub use keys::{WalletKeys, generate_mnemonic, parse_mnemonic};
pub use node::{
    NodeStatus, SyncReport, bitcoin_node_status, broadcast_transaction, estimate_fee_rate,
    sync_wallet,
};
pub use wallet::{
    CHANGE_PATH, RECEIVE_PATH, TransactionStatus, UfunguoWallet, WalletAddress, WalletError,
    WalletTransaction, WalletUtxo,
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
