use clap::{Parser, Subcommand};
use ufunguo_core::{description, generate_mnemonic};

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
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Wallet {
            command: WalletCommands::Create,
        } => create_wallet(),
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
