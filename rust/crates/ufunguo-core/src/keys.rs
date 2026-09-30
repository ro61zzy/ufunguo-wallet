use bip39::{Language, Mnemonic, WordCount};
use bitcoin::{
    Network,
    bip32::{Fingerprint, Xpriv},
    secp256k1::Secp256k1,
};
use zeroize::Zeroize;

pub fn generate_mnemonic() -> Result<Mnemonic, bip39::Error> {
    Mnemonic::generate_in(Language::English, WordCount::Words12)
}

pub fn parse_mnemonic(phrase: &str) -> Result<Mnemonic, bip39::Error> {
    Mnemonic::parse_in_normalized(Language::English, phrase.trim())
}

pub struct WalletKeys {
    network: Network,
    master_xpriv: Xpriv,
}

impl WalletKeys {
    pub fn from_mnemonic(
        mnemonic: &Mnemonic,
        network: Network,
    ) -> Result<Self, bitcoin::bip32::Error> {
        let mut seed = mnemonic.to_seed("");

        let master_result = Xpriv::new_master(network, &seed);

        seed.zeroize();

        let master_xpriv = master_result?;

        Ok(Self {
            network,
            master_xpriv,
        })
    }

    pub fn network(&self) -> Network {
        self.network
    }

    pub fn master_fingerprint(&self) -> Fingerprint {
        let secp = Secp256k1::new();

        self.master_xpriv.fingerprint(&secp)
    }

    pub(crate) fn master_xpriv(&self) -> Xpriv {
        self.master_xpriv
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    #[test]
    fn generates_twelve_word_mnemonic() {
        let mnemonic = generate_mnemonic().expect("mnemonic generation should succeed");

        assert_eq!(mnemonic.word_count(), 12);
    }

    #[test]
    fn parses_valid_mnemonic() {
        let mnemonic =
            parse_mnemonic(VALID_MNEMONIC).expect("known BIP39 test phrase should be valid");

        assert_eq!(mnemonic.word_count(), 12);
    }

    #[test]
    fn rejects_invalid_mnemonic() {
        let invalid_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";

        assert!(parse_mnemonic(invalid_phrase).is_err());
    }

    #[test]
    fn derives_same_master_key_identity_from_same_mnemonic() {
        let mnemonic =
            parse_mnemonic(VALID_MNEMONIC).expect("known BIP39 test phrase should be valid");

        let first = WalletKeys::from_mnemonic(&mnemonic, Network::Regtest)
            .expect("derivation should succeed");

        let second = WalletKeys::from_mnemonic(&mnemonic, Network::Regtest)
            .expect("derivation should succeed");

        assert_eq!(first.network(), Network::Regtest);
        assert_eq!(first.master_fingerprint(), second.master_fingerprint());
    }
}
