use bitcoin::Network;
use clap::{Parser, Subcommand};
use std::env;
use ufunguo_core::{
    CHANGE_PATH, RECEIVE_PATH, UfunguoWallet, WalletKeys, bitcoin_node_status, description,
    generate_mnemonic, parse_mnemonic, sync_wallet as synchronize_wallet,
};

use zeroize::Zeroize;

const WALLET_DATABASE: &str = "ufunguo.sqlite";

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

    /// Generate and remember a fresh receive address
    Receive,

    /// Connect to Bitcoin Core and synchronize wallet state
    Sync,

    /// Show confirmed and unconfirmed wallet balance
    Balance,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Wallet { command } => match command {
            WalletCommands::Create => create_wallet(),
            WalletCommands::Restore => restore_wallet(),
            WalletCommands::Receive => receive_address(),
            WalletCommands::Sync => sync_wallet(),
            WalletCommands::Balance => show_balance(),
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

fn receive_address() {
    let mut wallet = match UfunguoWallet::open_existing(WALLET_DATABASE, Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            eprintln!("Create or restore a wallet before requesting an address.");
            std::process::exit(1);
        }
    };

    match wallet.next_receive_address() {
        Ok(address) => {
            println!("Fresh receive address:");
            println!("{address}");
            println!();
            println!("Network: {:?}", wallet.network());
            println!("Address state saved to {WALLET_DATABASE}");
        }
        Err(error) => {
            eprintln!("Failed to generate receive address: {error}");
            std::process::exit(1);
        }
    }
}

fn sync_wallet() {
    if let Err(error) = dotenvy::dotenv() {
        eprintln!("Failed to load .env: {error}");
        std::process::exit(1);
    }

    let rpc_url = required_environment_variable("BITCOIN_RPC_URL");
    let rpc_user = required_environment_variable("BITCOIN_RPC_USER");
    let rpc_password = required_environment_variable("BITCOIN_RPC_PASSWORD");

    let status = match bitcoin_node_status(&rpc_url, &rpc_user, &rpc_password) {
        Ok(status) => status,
        Err(error) => {
            eprintln!("Failed to connect to Bitcoin Core: {error}");
            std::process::exit(1);
        }
    };

    println!("Connected to Bitcoin Core");
    println!("Network: {}", status.network);
    println!("Blocks: {}", status.blocks);
    println!("Headers: {}", status.headers);
    println!();

    if status.network != "regtest" {
        eprintln!(
            "Network mismatch: Ufunguo expects regtest, but Bitcoin Core is using {}.",
            status.network
        );
        std::process::exit(1);
    }

    let mut wallet = match UfunguoWallet::open_existing(WALLET_DATABASE, Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            eprintln!("Create or restore a wallet before synchronizing.");
            std::process::exit(1);
        }
    };

    println!("Synchronizing wallet...");

    match synchronize_wallet(&mut wallet, &rpc_url, &rpc_user, &rpc_password) {
        Ok(report) => {
            println!("Wallet synchronization complete");
            println!("Blocks scanned: {}", report.blocks_scanned);
            println!(
                "Mempool transactions inspected: {}",
                report.mempool_transactions
            );
            println!("Wallet height: {}", report.wallet_height);
            println!("Wallet state saved to {WALLET_DATABASE}");
        }
        Err(error) => {
            eprintln!("Failed to synchronize wallet: {error}");
            std::process::exit(1);
        }
    }
}

fn show_balance() {
    let wallet = match UfunguoWallet::open_existing(WALLET_DATABASE, Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            eprintln!("Create or restore a wallet before checking its balance.");
            std::process::exit(1);
        }
    };

    let balance = wallet.balance();
    let unconfirmed = balance.trusted_pending + balance.untrusted_pending;
    let total = balance.total();

    println!("Ufunguo wallet balance");
    println!();
    println!(
        "Confirmed:   {} BTC ({} sats)",
        balance.confirmed.to_btc(),
        balance.confirmed.to_sat()
    );
    println!(
        "Unconfirmed: {} BTC ({} sats)",
        unconfirmed.to_btc(),
        unconfirmed.to_sat()
    );
    println!(
        "Immature:    {} BTC ({} sats)",
        balance.immature.to_btc(),
        balance.immature.to_sat()
    );
    println!(
        "Total:       {} BTC ({} sats)",
        total.to_btc(),
        total.to_sat()
    );
}

fn required_environment_variable(name: &str) -> String {
    match env::var(name) {
        Ok(value) => value,
        Err(_) => {
            eprintln!("Missing environment variable: {name}");
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
    match UfunguoWallet::open_or_create(wallet_keys, WALLET_DATABASE) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open BIP84 wallet: {error}");
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
