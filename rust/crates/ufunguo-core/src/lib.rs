mod keys;

pub use keys::{WalletKeys, generate_mnemonic, parse_mnemonic};

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
