use bip39::{Language, Mnemonic, WordCount};

pub fn generate_mnemonic() -> Result<Mnemonic, bip39::Error> {
    Mnemonic::generate_in(Language::English, WordCount::Words12)
}

pub fn parse_mnemonic(phrase: &str) -> Result<Mnemonic, bip39::Error> {
    Mnemonic::parse_in_normalized(Language::English, phrase.trim())
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
}
