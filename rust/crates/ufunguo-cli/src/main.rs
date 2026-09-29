use clap::{Parser, Subcommand};
use ufunguo_core::{description, generate_mnemonic, parse_mnemonic};
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
            println!("{}", description());
            println!();
            println!("Recovery phrase:");
            println!("{mnemonic}");
            println!();
            println!("WARNING: Store these words securely and never share them.");
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
    phrase.zeroize();

    match result {
        Ok(mnemonic) => {
            println!(
                "Recovery phrase is valid: {} words detected.",
                mnemonic.word_count()
            );
        }
        Err(error) => {
            eprintln!("Invalid recovery phrase: {error}");
            std::process::exit(1);
        }
    }
}
