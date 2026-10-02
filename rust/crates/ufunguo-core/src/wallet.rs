use std::path::Path;

use bdk_wallet::{
    CreateWithPersistError, KeychainKind, LoadWithPersistError, PersistedWallet, Wallet,
    descriptor::template::Bip84,
    rusqlite::{self, Connection},
};
use bitcoin::{Address, Network};
use thiserror::Error;

use crate::WalletKeys;

pub const RECEIVE_PATH: &str = "m/84'/1'/0'/0/*";
pub const CHANGE_PATH: &str = "m/84'/1'/0'/1/*";

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
        let address = self
            .inner
            .reveal_next_address(KeychainKind::External)
            .address;

        self.inner.persist(&mut self.connection)?;

        Ok(address)
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
}
