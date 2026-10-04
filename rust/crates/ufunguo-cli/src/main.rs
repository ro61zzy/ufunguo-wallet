use bitcoin::{
    Address, Amount, FeeRate, Network, Psbt, Transaction, Txid,
    consensus::encode::{deserialize_hex, serialize_hex},
};
use clap::{Parser, Subcommand};
use std::{
    env, fs,
    io::{self, Write},
    path::{Path, PathBuf},
    str::FromStr,
    sync::OnceLock,
    thread,
    time::Duration,
};
use ufunguo_core::{
    CHANGE_PATH, KeychainKind, RECEIVE_PATH, TransactionStatus, UfunguoWallet, WalletKeys,
    WalletTransaction, bitcoin_node_status, broadcast_transaction, description, estimate_fee_rate,
    generate_mnemonic, parse_mnemonic, sync_wallet as synchronize_wallet,
};
use zeroize::Zeroize;

const DEFAULT_FEE_RATE_SAT_VB: u32 = 2;
static WALLET_DATABASE: OnceLock<PathBuf> = OnceLock::new();

#[derive(Parser)]
#[command(name = "ufunguo")]
#[command(about = "A transparent, non-custodial Bitcoin wallet")]
struct Cli {
    /// SQLite database used by this wallet
    #[arg(long, global = true, default_value = "ufunguo.sqlite")]
    database: PathBuf,

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
    /// Restore a wallet from an existing recovery phrase
    Restore,
    /// Generate and remember a fresh receive address
    Receive,
    /// List revealed receive/change addresses and usage state
    Addresses,
    /// Connect to Bitcoin Core and synchronize wallet state
    Sync,
    /// Show confirmed and unconfirmed wallet balance
    Balance,
    /// List wallet transaction history
    Transactions,
    /// List spendable wallet outputs
    Utxos,
    /// Ask Bitcoin Core for a recommended fee rate
    Fees {
        /// Desired confirmation target in blocks
        #[arg(long, default_value_t = 6)]
        confirmation_target: u16,
    },
    /// Build an unsigned PSBT without signing or broadcasting
    BuildPsbt {
        /// Regtest destination address
        address: String,
        /// Amount to send in satoshis
        amount_sats: u64,
        /// Manual fee rate in sat/vB; otherwise ask Bitcoin Core
        #[arg(long)]
        fee_rate: Option<u32>,
        /// Desired confirmation target when estimating a fee
        #[arg(long, default_value_t = 6)]
        confirmation_target: u16,
    },
    /// Build and sign a transaction without broadcasting it
    SignPsbt {
        /// Regtest destination address
        address: String,
        /// Amount to send in satoshis
        amount_sats: u64,
        /// Manual fee rate in sat/vB; otherwise ask Bitcoin Core
        #[arg(long)]
        fee_rate: Option<u32>,
        /// Desired confirmation target when estimating a fee
        #[arg(long, default_value_t = 6)]
        confirmation_target: u16,
    },
    /// Build, review, sign and broadcast a payment
    Send {
        /// Regtest destination address
        address: String,
        /// Amount to send in satoshis
        amount_sats: u64,
        /// Manual fee rate in sat/vB; otherwise ask Bitcoin Core
        #[arg(long)]
        fee_rate: Option<u32>,
        /// Desired confirmation target when estimating a fee
        #[arg(long, default_value_t = 6)]
        confirmation_target: u16,
        /// Skip the interactive transaction review confirmation
        #[arg(long)]
        yes: bool,
    },
    /// Broadcast a signed raw transaction through Bitcoin Core
    Broadcast {
        /// Signed transaction encoded as hexadecimal
        raw_transaction: String,
    },
    /// Display or watch the status of one wallet transaction
    Status {
        /// Transaction ID to inspect
        txid: String,
        /// Repeatedly synchronize until the transaction confirms
        #[arg(long)]
        watch: bool,
        /// Number of seconds between synchronization attempts
        #[arg(long, default_value_t = 10)]
        interval: u64,
    },
}

#[derive(Debug)]
struct RpcConfig {
    url: String,
    user: String,
    password: String,
}

#[derive(Debug)]
struct ResolvedFeeRate {
    rate: FeeRate,
    source: &'static str,
}

fn main() {
    let cli = Cli::parse();
    WALLET_DATABASE
        .set(cli.database)
        .expect("wallet database should only be configured once");

    match cli.command {
        Commands::Wallet { command } => run_wallet_command(command),
    }
}

fn run_wallet_command(command: WalletCommands) {
    match command {
        WalletCommands::Create => create_wallet(),
        WalletCommands::Restore => restore_wallet(),
        WalletCommands::Receive => receive_address(),
        WalletCommands::Addresses => show_addresses(),
        WalletCommands::Sync => sync_wallet(),
        WalletCommands::Balance => show_balance(),
        WalletCommands::Transactions => show_transactions(),
        WalletCommands::Utxos => show_utxos(),
        WalletCommands::Fees {
            confirmation_target,
        } => show_fee_estimate(confirmation_target),
        WalletCommands::BuildPsbt {
            address,
            amount_sats,
            fee_rate,
            confirmation_target,
        } => build_psbt(&address, amount_sats, fee_rate, confirmation_target),
        WalletCommands::SignPsbt {
            address,
            amount_sats,
            fee_rate,
            confirmation_target,
        } => sign_psbt(&address, amount_sats, fee_rate, confirmation_target),
        WalletCommands::Send {
            address,
            amount_sats,
            fee_rate,
            confirmation_target,
            yes,
        } => send_bitcoin(&address, amount_sats, fee_rate, confirmation_target, yes),
        WalletCommands::Broadcast { raw_transaction } => {
            broadcast_raw_transaction(&raw_transaction)
        }
        WalletCommands::Status {
            txid,
            watch,
            interval,
        } => transaction_status(&txid, watch, interval),
    }
}

fn create_wallet() {
    if wallet_database().exists() {
        eprintln!(
            "A wallet database already exists at {}.",
            wallet_database().display()
        );
        eprintln!("Refusing to overwrite it or mix it with a new recovery phrase.");
        eprintln!();
        eprintln!("Create a named demo wallet with:");
        eprintln!("  ufunguo --database wallets/demo.sqlite wallet create");
        std::process::exit(1);
    }

    ensure_database_parent_exists();

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
            println!("Database: {}", wallet_database().display());
        }
        Err(error) => exit_with_error("Failed to create wallet", error),
    }
}

fn restore_wallet() {
    ensure_database_parent_exists();

    let mut phrase = match rpassword::prompt_password("Enter recovery phrase: ") {
        Ok(phrase) => phrase,
        Err(error) => exit_with_error("Failed to read recovery phrase", error),
    };

    let result = parse_mnemonic(&phrase);
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
            println!("Database: {}", wallet_database().display());
        }
        Err(error) => exit_with_error("Invalid recovery phrase", error),
    }
}

fn receive_address() {
    let mut wallet = open_existing_wallet_or_exit();

    match wallet.next_receive_address() {
        Ok(address) => {
            println!("Fresh receive address:");
            println!("{address}");
            println!();
            println!("Network: {:?}", wallet.network());
            println!("Address state saved to {}", wallet_database().display());
        }
        Err(error) => exit_with_error("Failed to generate receive address", error),
    }
}

fn show_addresses() {
    let wallet = open_existing_wallet_or_exit();
    let addresses = wallet.addresses();

    if addresses.is_empty() {
        println!("No wallet addresses have been revealed.");
        println!("Run `ufunguo wallet receive` to generate one.");
        return;
    }

    println!("Ufunguo wallet addresses");
    println!();
    println!("TYPE     INDEX  USED  ADDRESS");

    for entry in addresses {
        let keychain = match entry.keychain {
            KeychainKind::External => "Receive",
            KeychainKind::Internal => "Change",
        };
        let used = if entry.used { "Yes" } else { "No" };

        println!(
            "{keychain:<8} {:<6} {used:<5} {}",
            entry.derivation_index, entry.address
        );
    }
}

fn sync_wallet() {
    let rpc = rpc_config_or_exit();
    let status = node_status_or_exit(&rpc);

    println!("Connected to Bitcoin Core");
    println!("Network: {}", status.network);
    println!("Blocks: {}", status.blocks);
    println!("Headers: {}", status.headers);
    println!();
    ensure_regtest_node(&status.network);

    let mut wallet = open_existing_wallet_or_exit();
    println!("Synchronizing wallet...");

    match synchronize_wallet(&mut wallet, &rpc.url, &rpc.user, &rpc.password) {
        Ok(report) => {
            println!("Wallet synchronization complete");
            println!("Blocks scanned: {}", report.blocks_scanned);
            println!(
                "Mempool transactions inspected: {}",
                report.mempool_transactions
            );
            println!("Wallet height: {}", report.wallet_height);
            println!("Wallet state saved to {}", wallet_database().display());
        }
        Err(error) => exit_with_error("Failed to synchronize wallet", error),
    }
}

fn show_balance() {
    let wallet = open_existing_wallet_or_exit();
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
    let wallet = open_existing_wallet_or_exit();
    let transactions = wallet.transactions();

    if transactions.is_empty() {
        println!("No wallet transactions found.");
        println!("Run `ufunguo wallet sync` to discover transactions.");
        return;
    }

    println!("Ufunguo transaction history");
    println!();

    for (index, transaction) in transactions.iter().enumerate() {
        let (direction, amount) = transaction_direction_and_amount(transaction);
        println!("Transaction {}", index + 1);
        println!("TXID: {}", transaction.txid);
        println!("Direction: {direction}");
        println!("Amount: {} BTC ({} sats)", amount.to_btc(), amount.to_sat());
        println!("Sent by wallet: {} sats", transaction.sent.to_sat());
        println!("Received by wallet: {} sats", transaction.received.to_sat());
        print_status(&transaction.status);
        println!();
    }
}

fn show_utxos() {
    let wallet = open_existing_wallet_or_exit();
    let utxos = wallet.unspent_outputs();

    if utxos.is_empty() {
        println!("No spendable UTXOs found.");
        println!("Receive bitcoin and synchronize the wallet first.");
        return;
    }

    let total = utxos
        .iter()
        .fold(Amount::ZERO, |sum, utxo| sum + utxo.value);

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
        print_status(&utxo.status);
        println!();
    }

    println!(
        "Total spendable: {} BTC ({} sats)",
        total.to_btc(),
        total.to_sat()
    );
}

fn show_fee_estimate(confirmation_target: u16) {
    let rpc = rpc_config_or_exit();

    match estimate_fee_rate(&rpc.url, &rpc.user, &rpc.password, confirmation_target) {
        Ok(Some(fee_rate)) => {
            println!("Bitcoin Core fee estimate");
            println!("Confirmation target: {confirmation_target} blocks");
            println!("Fee rate: {} sat/vB", fee_rate.to_sat_per_vb_ceil());
        }
        Ok(None) => {
            println!("Bitcoin Core does not have enough fee history for an estimate.");
            println!("Ufunguo fallback: {DEFAULT_FEE_RATE_SAT_VB} sat/vB");
        }
        Err(error) => exit_with_error("Failed to estimate a fee rate", error),
    }
}

fn build_psbt(
    address: &str,
    amount_sats: u64,
    manual_fee_rate: Option<u32>,
    confirmation_target: u16,
) {
    let destination = parse_regtest_address_or_exit(address);
    let amount = amount_or_exit(amount_sats);
    let resolved_fee = resolve_fee_rate(manual_fee_rate, confirmation_target);
    let mut wallet = open_existing_wallet_or_exit();
    let psbt = build_psbt_or_exit(&mut wallet, &destination, amount, resolved_fee.rate);

    println!("Unsigned PSBT created");
    println!();
    print_psbt_summary(&psbt, &destination, amount, &resolved_fee);
    println!();
    println!("PSBT (base64):");
    println!("{psbt}");
    println!();
    println!("This PSBT has not been signed or broadcast.");
}

fn sign_psbt(
    address: &str,
    amount_sats: u64,
    manual_fee_rate: Option<u32>,
    confirmation_target: u16,
) {
    let destination = parse_regtest_address_or_exit(address);
    let amount = amount_or_exit(amount_sats);
    let resolved_fee = resolve_fee_rate(manual_fee_rate, confirmation_target);
    let mut wallet = open_existing_wallet_or_exit();
    let mut psbt = build_psbt_or_exit(&mut wallet, &destination, amount, resolved_fee.rate);
    let wallet_keys = prompt_wallet_keys_or_exit();
    let signed_inputs = sign_psbt_or_exit(&wallet, &mut psbt, &wallet_keys);
    let transaction = extract_transaction_or_exit(psbt);

    println!("Transaction signed successfully");
    println!();
    println!("Destination: {destination}");
    println!("Amount: {amount} ({amount_sats} sats)");
    println!(
        "Fee rate: {} sat/vB ({})",
        resolved_fee.rate.to_sat_per_vb_ceil(),
        resolved_fee.source
    );
    println!("Signed inputs: {signed_inputs}");
    println!("TXID: {}", transaction.compute_txid());
    println!();
    println!("Raw transaction:");
    println!("{}", serialize_hex(&transaction));
    println!();
    println!("This transaction has been signed but not broadcast.");
}

fn send_bitcoin(
    address: &str,
    amount_sats: u64,
    manual_fee_rate: Option<u32>,
    confirmation_target: u16,
    skip_confirmation: bool,
) {
    let destination = parse_regtest_address_or_exit(address);
    let amount = amount_or_exit(amount_sats);
    let rpc = rpc_config_or_exit();
    let status = node_status_or_exit(&rpc);
    ensure_regtest_node(&status.network);

    let mut wallet = open_existing_wallet_or_exit();
    println!("Synchronizing wallet before coin selection...");
    if let Err(error) = synchronize_wallet(&mut wallet, &rpc.url, &rpc.user, &rpc.password) {
        exit_with_error("Failed to synchronize wallet", error);
    }

    let resolved_fee = resolve_fee_rate_with_rpc(manual_fee_rate, confirmation_target, &rpc);
    let mut psbt = build_psbt_or_exit(&mut wallet, &destination, amount, resolved_fee.rate);

    println!();
    println!("Review transaction");
    println!();
    print_psbt_summary(&psbt, &destination, amount, &resolved_fee);

    if !skip_confirmation && !confirm_broadcast() {
        println!("Transaction cancelled. Nothing was signed or broadcast.");
        return;
    }

    let wallet_keys = prompt_wallet_keys_or_exit();
    let signed_inputs = sign_psbt_or_exit(&wallet, &mut psbt, &wallet_keys);
    let transaction = extract_transaction_or_exit(psbt);
    let local_txid = transaction.compute_txid();

    println!("Signed {signed_inputs} input(s).");
    println!("Broadcasting {local_txid}...");

    match broadcast_transaction(&rpc.url, &rpc.user, &rpc.password, &transaction) {
        Ok(txid) => {
            println!();
            println!("Payment broadcast successfully");
            println!("TXID: {txid}");
            println!("Status: Unconfirmed");
            println!();
            println!("Track it with:");
            println!("  ufunguo wallet status {txid} --watch");
        }
        Err(error) => exit_with_error("Failed to broadcast transaction", error),
    }
}

fn broadcast_raw_transaction(raw_transaction: &str) {
    let transaction: Transaction = match deserialize_hex(raw_transaction) {
        Ok(transaction) => transaction,
        Err(error) => exit_with_error("Invalid raw transaction", error),
    };

    let rpc = rpc_config_or_exit();
    let calculated_txid = transaction.compute_txid();

    println!("Broadcasting transaction...");
    println!("Calculated TXID: {calculated_txid}");

    match broadcast_transaction(&rpc.url, &rpc.user, &rpc.password, &transaction) {
        Ok(txid) => {
            println!();
            println!("Transaction broadcast successfully");
            println!("TXID: {txid}");
            println!("Status: Unconfirmed");
            println!();
            println!("Run `ufunguo wallet sync` to update wallet state.");
        }
        Err(error) => exit_with_error("Failed to broadcast transaction", error),
    }
}

fn transaction_status(txid: &str, watch: bool, interval: u64) {
    let txid = match Txid::from_str(txid) {
        Ok(txid) => txid,
        Err(error) => exit_with_error("Invalid transaction ID", error),
    };

    if watch {
        watch_transaction(txid, interval);
    } else {
        let wallet = open_existing_wallet_or_exit();
        let transaction = find_transaction_or_exit(&wallet, txid);
        print_transaction_status(&transaction);
    }
}

fn watch_transaction(txid: Txid, interval: u64) {
    if interval == 0 {
        eprintln!("Polling interval must be greater than zero seconds.");
        std::process::exit(1);
    }

    let rpc = rpc_config_or_exit();
    println!("Watching transaction {txid}");
    println!("Polling every {interval} seconds. Press Ctrl+C to stop.");
    println!();

    loop {
        let mut wallet = open_existing_wallet_or_exit();
        let report = match synchronize_wallet(&mut wallet, &rpc.url, &rpc.user, &rpc.password) {
            Ok(report) => report,
            Err(error) => exit_with_error("Failed to synchronize wallet", error),
        };

        println!("Wallet synchronized at height {}", report.wallet_height);
        let transaction = find_transaction_or_exit(&wallet, txid);
        let confirmed = print_transaction_status(&transaction);

        if confirmed {
            println!();
            println!("Transaction confirmed. Polling complete.");
            break;
        }

        println!();
        println!("Still unconfirmed. Checking again in {interval} seconds...");
        println!();
        thread::sleep(Duration::from_secs(interval));
    }
}

fn print_transaction_status(transaction: &WalletTransaction) -> bool {
    let (direction, amount) = transaction_direction_and_amount(transaction);
    println!("Ufunguo transaction status");
    println!();
    println!("TXID: {}", transaction.txid);
    println!("Direction: {direction}");
    println!("Amount: {} ({} sats)", amount, amount.to_sat());

    match &transaction.status {
        TransactionStatus::Unconfirmed => {
            println!("Status: Unconfirmed");
            println!("Confirmations: 0");
            false
        }
        TransactionStatus::Confirmed {
            block_height,
            confirmations,
        } => {
            println!("Status: Confirmed");
            println!("Block height: {block_height}");
            println!("Confirmations: {confirmations}");
            true
        }
    }
}

fn print_psbt_summary(
    psbt: &Psbt,
    destination: &Address,
    amount: Amount,
    fee_rate: &ResolvedFeeRate,
) {
    let fee = match psbt.fee() {
        Ok(fee) => fee,
        Err(error) => exit_with_error("Failed to calculate PSBT fee", error),
    };

    println!("Destination: {destination}");
    println!("Amount: {} BTC ({} sats)", amount.to_btc(), amount.to_sat());
    println!(
        "Fee rate: {} sat/vB ({})",
        fee_rate.rate.to_sat_per_vb_ceil(),
        fee_rate.source
    );
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
        match Address::from_script(&output.script_pubkey, Network::Regtest) {
            Ok(output_address) => {
                let label = if output_address == *destination {
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
            Err(_) => println!(
                "  {}. {} sats -> non-address script",
                index + 1,
                output.value.to_sat()
            ),
        }
    }
}

fn resolve_fee_rate(manual_fee_rate: Option<u32>, confirmation_target: u16) -> ResolvedFeeRate {
    if let Some(sat_per_vb) = manual_fee_rate {
        return manual_fee_rate_or_exit(sat_per_vb);
    }

    let rpc = rpc_config_or_exit();
    resolve_fee_rate_with_rpc(None, confirmation_target, &rpc)
}

fn resolve_fee_rate_with_rpc(
    manual_fee_rate: Option<u32>,
    confirmation_target: u16,
    rpc: &RpcConfig,
) -> ResolvedFeeRate {
    if let Some(sat_per_vb) = manual_fee_rate {
        return manual_fee_rate_or_exit(sat_per_vb);
    }

    match estimate_fee_rate(&rpc.url, &rpc.user, &rpc.password, confirmation_target) {
        Ok(Some(rate)) => ResolvedFeeRate {
            rate,
            source: "Bitcoin Core estimate",
        },
        Ok(None) => {
            eprintln!(
                "Bitcoin Core has insufficient fee history; using {DEFAULT_FEE_RATE_SAT_VB} sat/vB fallback."
            );
            ResolvedFeeRate {
                rate: FeeRate::from_sat_per_vb_u32(DEFAULT_FEE_RATE_SAT_VB),
                source: "regtest fallback",
            }
        }
        Err(error) => {
            eprintln!("Bitcoin Core fee estimation failed: {error}");
            eprintln!("Use `--fee-rate <SAT_PER_VB>` to provide a manual rate.");
            std::process::exit(1);
        }
    }
}

fn manual_fee_rate_or_exit(sat_per_vb: u32) -> ResolvedFeeRate {
    if sat_per_vb == 0 {
        eprintln!("Fee rate must be greater than zero.");
        std::process::exit(1);
    }

    ResolvedFeeRate {
        rate: FeeRate::from_sat_per_vb_u32(sat_per_vb),
        source: "manual override",
    }
}

fn build_psbt_or_exit(
    wallet: &mut UfunguoWallet,
    destination: &Address,
    amount: Amount,
    fee_rate: FeeRate,
) -> Psbt {
    match wallet.build_psbt(destination, amount, fee_rate) {
        Ok(psbt) => psbt,
        Err(error) => exit_with_error("Failed to build PSBT", error),
    }
}

fn sign_psbt_or_exit(wallet: &UfunguoWallet, psbt: &mut Psbt, wallet_keys: &WalletKeys) -> usize {
    match wallet.sign_psbt(psbt, wallet_keys) {
        Ok(signed_inputs) => signed_inputs,
        Err(error) => exit_with_error("Failed to sign PSBT", error),
    }
}

fn extract_transaction_or_exit(psbt: Psbt) -> Transaction {
    match psbt.extract_tx() {
        Ok(transaction) => transaction,
        Err(error) => exit_with_error("Failed to extract signed transaction", error),
    }
}

fn prompt_wallet_keys_or_exit() -> WalletKeys {
    let mut phrase = match rpassword::prompt_password("Enter recovery phrase to sign: ") {
        Ok(phrase) => phrase,
        Err(error) => exit_with_error("Failed to read recovery phrase", error),
    };

    let mnemonic_result = parse_mnemonic(&phrase);
    phrase.zeroize();

    let mnemonic = match mnemonic_result {
        Ok(mnemonic) => mnemonic,
        Err(error) => exit_with_error("Invalid recovery phrase", error),
    };

    derive_wallet_keys_or_exit(&mnemonic)
}

fn confirm_broadcast() -> bool {
    print!("Sign and broadcast this transaction? [y/N]: ");
    if let Err(error) = io::stdout().flush() {
        exit_with_error("Failed to display confirmation prompt", error);
    }

    let mut answer = String::new();
    if let Err(error) = io::stdin().read_line(&mut answer) {
        exit_with_error("Failed to read confirmation", error);
    }

    matches!(answer.trim().to_ascii_lowercase().as_str(), "y" | "yes")
}

fn print_status(status: &TransactionStatus) {
    match status {
        TransactionStatus::Unconfirmed => println!("Status: Unconfirmed"),
        TransactionStatus::Confirmed {
            block_height,
            confirmations,
        } => {
            println!("Status: Confirmed");
            println!("Block height: {block_height}");
            println!("Confirmations: {confirmations}");
        }
    }
}

fn transaction_direction_and_amount(transaction: &WalletTransaction) -> (&'static str, Amount) {
    if transaction.received > transaction.sent {
        ("Incoming", transaction.received - transaction.sent)
    } else if transaction.sent > transaction.received {
        ("Outgoing", transaction.sent - transaction.received)
    } else {
        ("Self-transfer", transaction.received)
    }
}

fn find_transaction_or_exit(wallet: &UfunguoWallet, txid: Txid) -> WalletTransaction {
    match wallet.transaction(txid) {
        Some(transaction) => transaction,
        None => {
            eprintln!("Transaction was not found in this wallet.");
            eprintln!("Run `ufunguo wallet sync` and try again.");
            std::process::exit(1);
        }
    }
}

fn amount_or_exit(amount_sats: u64) -> Amount {
    if amount_sats == 0 {
        eprintln!("Amount must be greater than zero.");
        std::process::exit(1);
    }
    Amount::from_sat(amount_sats)
}

fn parse_regtest_address_or_exit(address: &str) -> Address {
    let unchecked_address = match Address::from_str(address) {
        Ok(address) => address,
        Err(error) => exit_with_error("Invalid Bitcoin address", error),
    };

    match unchecked_address.require_network(Network::Regtest) {
        Ok(address) => address,
        Err(error) => exit_with_error("Address is not a regtest address", error),
    }
}

fn open_existing_wallet_or_exit() -> UfunguoWallet {
    match UfunguoWallet::open_existing(wallet_database(), Network::Regtest) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open wallet: {error}");
            eprintln!("Database: {}", wallet_database().display());
            eprintln!("Create or restore this wallet first.");
            std::process::exit(1);
        }
    }
}

fn create_bip84_wallet_or_exit(wallet_keys: &WalletKeys) -> UfunguoWallet {
    match UfunguoWallet::open_or_create(wallet_keys, wallet_database()) {
        Ok(wallet) => wallet,
        Err(error) => {
            eprintln!("Failed to open BIP84 wallet: {error}");
            eprintln!("Database: {}", wallet_database().display());
            eprintln!(
                "If this database belongs to another recovery phrase, choose a different `--database` path."
            );
            std::process::exit(1);
        }
    }
}

fn wallet_database() -> &'static Path {
    WALLET_DATABASE
        .get()
        .expect("wallet database should be configured before commands run")
        .as_path()
}

fn ensure_database_parent_exists() {
    let Some(parent) = wallet_database().parent() else {
        return;
    };
    if parent.as_os_str().is_empty() {
        return;
    }
    if let Err(error) = fs::create_dir_all(parent) {
        exit_with_error(
            &format!("Failed to create wallet directory {}", parent.display()),
            error,
        );
    }
}

fn rpc_config_or_exit() -> RpcConfig {
    let _ = dotenvy::dotenv();
    RpcConfig {
        url: required_environment_variable("BITCOIN_RPC_URL"),
        user: required_environment_variable("BITCOIN_RPC_USER"),
        password: required_environment_variable("BITCOIN_RPC_PASSWORD"),
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

fn node_status_or_exit(rpc: &RpcConfig) -> ufunguo_core::NodeStatus {
    match bitcoin_node_status(&rpc.url, &rpc.user, &rpc.password) {
        Ok(status) => status,
        Err(error) => exit_with_error("Failed to connect to Bitcoin Core", error),
    }
}

fn ensure_regtest_node(network: &str) {
    if network != "regtest" {
        eprintln!("Network mismatch: Ufunguo expects regtest, but Bitcoin Core uses {network}.");
        std::process::exit(1);
    }
}

fn derive_wallet_keys_or_exit(mnemonic: &bip39::Mnemonic) -> WalletKeys {
    match WalletKeys::from_mnemonic(mnemonic, Network::Regtest) {
        Ok(keys) => keys,
        Err(error) => exit_with_error("Failed to derive wallet keys", error),
    }
}

fn print_wallet_details(wallet_keys: &WalletKeys, wallet: &UfunguoWallet) {
    println!("Network: {:?}", wallet.network());
    println!("Master fingerprint: {}", wallet_keys.master_fingerprint());
    println!("Receive path: {RECEIVE_PATH}");
    println!("Change path: {CHANGE_PATH}");
    println!("First receive address: {}", wallet.receive_address_at(0));
}

fn exit_with_error(message: &str, error: impl std::fmt::Display) -> ! {
    eprintln!("{message}: {error}");
    std::process::exit(1);
}
