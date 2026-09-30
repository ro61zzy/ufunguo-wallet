use bitcoin::Network;
use clap::{Parser, Subcommand};
use ufunguo_core::{
    CHANGE_PATH, RECEIVE_PATH, UfunguoWallet, WalletKeys, description, generate_mnemonic,
    parse_mnemonic,
};
use zeroize::Zeroize;

#[derive(Parser)]
#[command(name = "ufunguo")]
#[command(about = "A transparent, non-custodial Bitcoin wallet")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Wallet {
        #[command(subcommand)]
        command: WalletCommands,
    },
}

#[derive(Subcommand)]
enum WalletCommands {
    /// Create a new wallet recovery phrase
    Create,

    /// Validate and restore an existing recovery phrase
    Restore,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Wallet { command } => match command {
            WalletCommands::Create => create_wallet(),
            WalletCommands::Restore => restore_wallet(),
        },
    }
}

fn create_wallet() {
    match generate_mnemonic() {
        Ok(mnemonic) => {
            let wallet_keys = derive_wallet_keys_or_exit(&mnemonic);
            let wallet = create_bip84_wallet_or_exit(&wallet_keys);

            println!("{}", description());
            println!();
            println!("Recovery phrase:");
            println!("{mnemonic}");
            println!();
            println!("WARNING: Store these words securely and never share them.");
            println!();
            print_wallet_details(&wallet_keys, &wallet);
        }
        Err(error) => {
            eprintln!("Failed to create wallet: {error}");
            std::process::exit(1);
        }
    }
}

fn restore_wallet() {
    let mut phrase = match rpassword::prompt_password("Enter recovery phrase: ") {
        Ok(phrase) => phrase,
        Err(error) => {
            eprintln!("Failed to read recovery phrase: {error}");
            std::process::exit(1);
        }
    };

    let result = parse_mnemonic(&phrase);

    // Remove the recovery phrase from this String's memory.
    phrase.zeroize();

    match result {
        Ok(mnemonic) => {
            let wallet_keys = derive_wallet_keys_or_exit(&mnemonic);
            let wallet = create_bip84_wallet_or_exit(&wallet_keys);

            println!(
                "Recovery phrase is valid: {} words detected.",
                mnemonic.word_count()
            );

            print_wallet_details(&wallet_keys, &wallet);
        }
        Err(error) => {
            eprintln!("Invalid recovery phrase: {error}");
            std::process::exit(1);
        }
    }
}

fn derive_wallet_keys_or_exit(mnemonic: &bip39::Mnemonic) -> WalletKeys {
    match WalletKeys::from_mnemonic(mnemonic, Network::Regtest) {
        Ok(keys) => keys,
        Err(error) => {
            eprintln!("Failed to derive wallet keys: {error}");
            std::process::exit(1);
        }
    }
}

fn create_bip84_wallet_or_exit(wallet_keys: &WalletKeys) -> UfunguoWallet {
    match UfunguoWallet::create(wallet_keys) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to create BIP84 wallet: {error}");
            std::process::exit(1);
        }
    }
}

fn print_wallet_details(wallet_keys: &WalletKeys, wallet: &UfunguoWallet) {
    println!("Network: {:?}", wallet.network());
    println!("Master fingerprint: {}", wallet_keys.master_fingerprint());
    println!("Receive path: {RECEIVE_PATH}");
    println!("Change path: {CHANGE_PATH}");
    println!("First receive address: {}", wallet.receive_address_at(0));
}
