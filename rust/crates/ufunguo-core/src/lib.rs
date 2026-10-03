mod keys;
mod node;
mod wallet;

pub use keys::{WalletKeys, generate_mnemonic, parse_mnemonic};
pub use node::{NodeStatus, SyncReport, bitcoin_node_status, broadcast_transaction, sync_wallet};
pub use wallet::{
    CHANGE_PATH, RECEIVE_PATH, TransactionStatus, UfunguoWallet, WalletError, WalletTransaction,
    WalletUtxo,
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
