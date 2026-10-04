use std::{env, net::SocketAddr, process};

use ufunguo_api::{AppState, router};
use ufunguo_core::{WalletDirectory, service::RpcConfig};

const DEFAULT_BIND: &str = "127.0.0.1:8787";
const DEFAULT_WALLET_DIR: &str = "wallets";

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    let bind: SocketAddr = env::var("UFUNGUO_API_BIND")
        .unwrap_or_else(|_| DEFAULT_BIND.to_owned())
        .parse()
        .unwrap_or_else(|error| fail(&format!("Invalid UFUNGUO_API_BIND: {error}")));

    // The API carries recovery phrases for signing; never expose it beyond
    // this machine unless explicitly asked to.
    if !bind.ip().is_loopback() && env::var("UFUNGUO_API_ALLOW_NON_LOCAL").as_deref() != Ok("1") {
        fail(&format!(
            "Refusing to bind to non-loopback address {bind}. \
             Set UFUNGUO_API_ALLOW_NON_LOCAL=1 only on a trusted, isolated network."
        ));
    }

    let wallet_dir =
        env::var("UFUNGUO_WALLET_DIR").unwrap_or_else(|_| DEFAULT_WALLET_DIR.to_owned());
    let directory = WalletDirectory::open(&wallet_dir).unwrap_or_else(|error| {
        fail(&format!(
            "Cannot open wallet directory {wallet_dir}: {error}"
        ))
    });

    let rpc = RpcConfig::from_env().map_err(|error| error.to_string());

    eprintln!("Ufunguo API — REGTEST ONLY development bridge. Do not use with real bitcoin.");
    eprintln!("Listening on http://{bind}");
    eprintln!("Wallet directory: {}", directory.root().display());
    match &rpc {
        Ok(rpc) => eprintln!("Bitcoin Core RPC: {}", rpc.url),
        Err(error) => {
            eprintln!("Bitcoin Core RPC not configured ({error}); sync and send are disabled.")
        }
    }

    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .unwrap_or_else(|error| fail(&format!("Cannot bind {bind}: {error}")));

    axum::serve(listener, router(AppState::new(directory, rpc)))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .unwrap_or_else(|error| fail(&format!("Server error: {error}")));
}

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    process::exit(1);
}
