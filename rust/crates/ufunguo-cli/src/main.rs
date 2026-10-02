use bitcoin::{Address, Amount, FeeRate, Network, consensus::encode::serialize_hex};
use clap::{Parser, Subcommand};
use std::env;
use std::str::FromStr;
use ufunguo_core::{
    CHANGE_PATH, RECEIVE_PATH, TransactionStatus, UfunguoWallet, WalletKeys, bitcoin_node_status,
    description, generate_mnemonic, parse_mnemonic, sync_wallet as synchronize_wallet,
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

    /// List wallet transaction history
    Transactions,

    /// List spendable wallet outputs
    Utxos,

    /// Build an unsigned PSBT without signing or broadcasting
    BuildPsbt {
        /// Regtest destination address
        address: String,

        /// Amount to send in satoshis
        amount_sats: u64,

        /// Fee rate in satoshis per virtual byte
        #[arg(long, default_value_t = 2)]
        fee_rate: u32,
    },

    /// Build and sign a transaction using the wallet recovery phrase
    SignPsbt {
        /// Regtest destination address
        address: String,

        /// Amount to send in satoshis
        amount_sats: u64,

        /// Fee rate in satoshis per virtual byte
        #[arg(long, default_value_t = 2)]
        fee_rate: u32,
    },
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
            WalletCommands::Transactions => show_transactions(),
            WalletCommands::Utxos => show_utxos(),
            WalletCommands::BuildPsbt {
                address,
                amount_sats,
                fee_rate,
            } => build_psbt(&address, amount_sats, fee_rate),
            WalletCommands::SignPsbt {
                address,
                amount_sats,
                fee_rate,
            } => sign_psbt(&address, amount_sats, fee_rate),
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

fn show_transactions() {
    let wallet = match UfunguoWallet::open_existing(WALLET_DATABASE, Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            eprintln!("Create or restore a wallet before viewing transactions.");
            std::process::exit(1);
        }
    };

    let transactions = wallet.transactions();

    if transactions.is_empty() {
        println!("No wallet transactions found.");
        println!("Run `ufunguo wallet sync` to discover transactions.");
        return;
    }

    println!("Ufunguo transaction history");
    println!();

    for (index, transaction) in transactions.iter().enumerate() {
        let (direction, amount) = if transaction.received > transaction.sent {
            ("Incoming", transaction.received - transaction.sent)
        } else if transaction.sent > transaction.received {
            ("Outgoing", transaction.sent - transaction.received)
        } else {
            ("Self-transfer", transaction.received)
        };

        println!("Transaction {}", index + 1);
        println!("TXID: {}", transaction.txid);
        println!("Direction: {direction}");
        println!("Amount: {} BTC ({} sats)", amount.to_btc(), amount.to_sat());
        println!("Sent by wallet: {} sats", transaction.sent.to_sat());
        println!("Received by wallet: {} sats", transaction.received.to_sat());

        match &transaction.status {
            TransactionStatus::Unconfirmed => {
                println!("Status: Unconfirmed");
            }
            TransactionStatus::Confirmed {
                block_height,
                confirmations,
            } => {
                println!("Status: Confirmed");
                println!("Block height: {block_height}");
                println!("Confirmations: {confirmations}");
            }
        }

        println!();
    }
}

fn show_utxos() {
    let wallet = match UfunguoWallet::open_existing(WALLET_DATABASE, Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            eprintln!("Create or restore a wallet before viewing UTXOs.");
            std::process::exit(1);
        }
    };

    let utxos = wallet.unspent_outputs();

    if utxos.is_empty() {
        println!("No spendable UTXOs found.");
        println!("Receive bitcoin and synchronize the wallet first.");
        return;
    }

    let total = utxos
        .iter()
        .fold(bitcoin::Amount::ZERO, |sum, utxo| sum + utxo.value);

    println!("Ufunguo spendable outputs");
    println!();

    for (index, utxo) in utxos.iter().enumerate() {
        println!("UTXO {}", index + 1);
        println!("Outpoint: {}", utxo.outpoint);
        println!(
            "Value: {} BTC ({} sats)",
            utxo.value.to_btc(),
            utxo.value.to_sat()
        );
        println!("Keychain: {:?}", utxo.keychain);
        println!("Derivation index: {}", utxo.derivation_index);

        match &utxo.status {
            TransactionStatus::Unconfirmed => {
                println!("Status: Unconfirmed");
            }
            TransactionStatus::Confirmed {
                block_height,
                confirmations,
            } => {
                println!("Status: Confirmed");
                println!("Block height: {block_height}");
                println!("Confirmations: {confirmations}");
            }
        }

        println!();
    }

    println!(
        "Total spendable: {} BTC ({} sats)",
        total.to_btc(),
        total.to_sat()
    );
}

fn build_psbt(address: &str, amount_sats: u64, fee_rate_sat_vb: u32) {
    let unchecked_address = match Address::from_str(address) {
        Ok(address) => address,
        Err(error) => {
            eprintln!("Invalid Bitcoin address: {error}");
            std::process::exit(1);
        }
    };

    let destination = match unchecked_address.require_network(Network::Regtest) {
        Ok(address) => address,
        Err(error) => {
            eprintln!("Destination must be a regtest address: {error}");
            std::process::exit(1);
        }
    };

    if amount_sats == 0 {
        eprintln!("Amount must be greater than zero.");
        std::process::exit(1);
    }

    let amount = Amount::from_sat(amount_sats);
    let fee_rate = FeeRate::from_sat_per_vb_u32(fee_rate_sat_vb);

    let mut wallet = match UfunguoWallet::open_existing(WALLET_DATABASE, Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            std::process::exit(1);
        }
    };

    let psbt = match wallet.build_psbt(&destination, amount, fee_rate) {
        Ok(psbt) => psbt,
        Err(error) => {
            eprintln!("Failed to build PSBT: {error}");
            std::process::exit(1);
        }
    };

    let fee = match psbt.fee() {
        Ok(fee) => fee,
        Err(error) => {
            eprintln!("Failed to calculate PSBT fee: {error}");
            std::process::exit(1);
        }
    };

    println!("Unsigned PSBT created");
    println!();
    println!("Destination: {destination}");
    println!("Amount: {} BTC ({} sats)", amount.to_btc(), amount.to_sat());
    println!("Fee rate: {fee_rate_sat_vb} sat/vB");
    println!("Fee: {} BTC ({} sats)", fee.to_btc(), fee.to_sat());
    println!("Inputs: {}", psbt.unsigned_tx.input.len());
    println!("Outputs: {}", psbt.unsigned_tx.output.len());
    println!();

    println!("Selected inputs:");
    for (index, input) in psbt.unsigned_tx.input.iter().enumerate() {
        println!("  {}. {}", index + 1, input.previous_output);
    }

    println!();
    println!("Created outputs:");

    for (index, output) in psbt.unsigned_tx.output.iter().enumerate() {
        let output_address = Address::from_script(&output.script_pubkey, Network::Regtest);

        match output_address {
            Ok(output_address) => {
                let label = if output_address == destination {
                    "recipient"
                } else {
                    "change"
                };

                println!(
                    "  {}. {} BTC ({} sats) -> {} [{}]",
                    index + 1,
                    output.value.to_btc(),
                    output.value.to_sat(),
                    output_address,
                    label
                );
            }
            Err(_) => {
                println!(
                    "  {}. {} sats -> non-address script",
                    index + 1,
                    output.value.to_sat()
                );
            }
        }
    }

    println!();
    println!("PSBT (base64):");
    println!("{psbt}");
    println!();
    println!("This PSBT has not been signed or broadcast.");
}

fn sign_psbt(address: &str, amount_sats: u64, fee_rate: u32) {
    let destination = parse_regtest_address_or_exit(address);
    let amount = Amount::from_sat(amount_sats);

    let fee_rate = match FeeRate::from_sat_per_vb(fee_rate.into()) {
        Some(fee_rate) => fee_rate,
        None => {
            eprintln!("Invalid fee rate: {fee_rate} sat/vB");
            std::process::exit(1);
        }
    };

    let mut wallet = open_existing_wallet_or_exit();

    let mut psbt = match wallet.build_psbt(&destination, amount, fee_rate) {
        Ok(psbt) => psbt,
        Err(error) => {
            eprintln!("Failed to build PSBT: {error}");
            std::process::exit(1);
        }
    };

    let mut phrase = match rpassword::prompt_password("Enter recovery phrase to sign: ") {
        Ok(phrase) => phrase,
        Err(error) => {
            eprintln!("Failed to read recovery phrase: {error}");
            std::process::exit(1);
        }
    };

    let mnemonic_result = parse_mnemonic(&phrase);
    phrase.zeroize();

    let mnemonic = match mnemonic_result {
        Ok(mnemonic) => mnemonic,
        Err(error) => {
            eprintln!("Invalid recovery phrase: {error}");
            std::process::exit(1);
        }
    };

    let wallet_keys = derive_wallet_keys_or_exit(&mnemonic);

    let signed_inputs = match wallet.sign_psbt(&mut psbt, &wallet_keys) {
        Ok(signed_inputs) => signed_inputs,
        Err(error) => {
            eprintln!("Failed to sign PSBT: {error}");
            std::process::exit(1);
        }
    };

    let transaction = match psbt.extract_tx() {
        Ok(transaction) => transaction,
        Err(error) => {
            eprintln!("Failed to extract signed transaction: {error}");
            std::process::exit(1);
        }
    };

    println!("Transaction signed successfully");
    println!();
    println!("Destination: {destination}");
    println!("Amount: {amount} ({amount_sats} sats)");
    println!("Signed inputs: {signed_inputs}");
    println!("TXID: {}", transaction.compute_txid());
    println!();
    println!("Raw transaction:");
    println!("{}", serialize_hex(&transaction));
    println!();
    println!("This transaction has been signed but not broadcast.");
}

fn parse_regtest_address_or_exit(address: &str) -> Address {
    let unchecked_address = match Address::from_str(address) {
        Ok(address) => address,
        Err(error) => {
            eprintln!("Invalid Bitcoin address: {error}");
            std::process::exit(1);
        }
    };

    match unchecked_address.require_network(Network::Regtest) {
        Ok(address) => address,
        Err(error) => {
            eprintln!("Address is not a regtest address: {error}");
            std::process::exit(1);
        }
    }
}

fn open_existing_wallet_or_exit() -> UfunguoWallet {
    match UfunguoWallet::open_existing(WALLET_DATABASE, Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            eprintln!("Create or restore a wallet first.");
            std::process::exit(1);
        }
    }
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
