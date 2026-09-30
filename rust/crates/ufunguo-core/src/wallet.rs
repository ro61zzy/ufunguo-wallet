use bdk_wallet::{KeychainKind, Wallet, descriptor::DescriptorError, template::Bip84};
use bitcoin::{Address, Network};

use crate::WalletKeys;

pub const RECEIVE_PATH: &str = "m/84'/1'/0'/0/*";
pub const CHANGE_PATH: &str = "m/84'/1'/0'/1/*";

pub struct UfunguoWallet {
    inner: Wallet,
}

impl UfunguoWallet {
    pub fn create(keys: &WalletKeys) -> Result<Self, DescriptorError> {
        let master_xpriv = keys.master_xpriv();

        let inner = Wallet::create(
            Bip84(master_xpriv, KeychainKind::External),
            Bip84(master_xpriv, KeychainKind::Internal),
        )
        .network(keys.network())
        .create_wallet_no_persist()?;

        Ok(Self { inner })
    }

    pub fn network(&self) -> Network {
        self.inner.network()
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_mnemonic;

    const VALID_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    fn test_wallet() -> UfunguoWallet {
        let mnemonic = parse_mnemonic(VALID_MNEMONIC).expect("test mnemonic should be valid");

        let keys = WalletKeys::from_mnemonic(&mnemonic, Network::Regtest)
            .expect("key derivation should succeed");

        UfunguoWallet::create(&keys).expect("wallet creation should succeed")
    }

    #[test]
    fn creates_regtest_wallet() {
        let wallet = test_wallet();

        assert_eq!(wallet.network(), Network::Regtest);
    }

    #[test]
    fn derives_different_receive_and_change_addresses() {
        let wallet = test_wallet();

        let receive = wallet.receive_address_at(0);
        let change = wallet.change_address_at(0);

        assert_ne!(receive, change);
        assert!(receive.to_string().starts_with("bcrt1q"));
        assert!(change.to_string().starts_with("bcrt1q"));
    }

    #[test]
    fn derives_addresses_deterministically() {
        let first = test_wallet();
        let second = test_wallet();

        assert_eq!(first.receive_address_at(0), second.receive_address_at(0));
    }
}
