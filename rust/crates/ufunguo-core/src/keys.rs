use bip39::{Language, Mnemonic, WordCount};

pub fn generate_mnemonic() -> Result<Mnemonic, bip39::Error> {
    Mnemonic::generate_in(Language::English, WordCount::Words12)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_twelve_word_mnemonic() {
        let mnemonic = generate_mnemonic().expect("mnemonic generation should succeed");

        assert_eq!(mnemonic.word_count(), 12);
    }
}
