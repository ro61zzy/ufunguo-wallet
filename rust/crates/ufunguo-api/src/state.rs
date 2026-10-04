use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use bitcoin::Psbt;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};
use ufunguo_core::{
    WalletDirectory, WalletName,
    service::{RpcConfig, ServiceError},
};

/// How long a reviewed transaction can be signed before it must be rebuilt.
pub const PREVIEW_TTL: Duration = Duration::from_secs(600);

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    directory: WalletDirectory,
    rpc: Result<RpcConfig, String>,
    wallet_locks: Mutex<HashMap<WalletName, Arc<AsyncMutex<()>>>>,
    previews: Mutex<HashMap<String, StoredPreview>>,
}

/// The exact unsigned transaction the user reviewed, so signing cannot pick
/// different coins than the ones shown.
#[derive(Clone)]
pub struct StoredPreview {
    pub wallet: WalletName,
    pub psbt: Psbt,
    created_at: Instant,
}

impl AppState {
    /// `rpc` is an error message when Bitcoin Core is not configured; local
    /// read-only endpoints still work in that case.
    pub fn new(directory: WalletDirectory, rpc: Result<RpcConfig, String>) -> Self {
        Self {
            inner: Arc::new(Inner {
                directory,
                rpc,
                wallet_locks: Mutex::new(HashMap::new()),
                previews: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub fn directory(&self) -> &WalletDirectory {
        &self.inner.directory
    }

    pub fn rpc(&self) -> Result<RpcConfig, ServiceError> {
        self.inner
            .rpc
            .clone()
            .map_err(|_| ServiceError::MissingConfig("BITCOIN_RPC_URL"))
    }

    pub fn rpc_status_message(&self) -> Option<&str> {
        self.inner.rpc.as_ref().err().map(String::as_str)
    }

    /// Serializes operations on one wallet so concurrent requests cannot race
    /// on BDK's derivation indices or SQLite writes.
    pub async fn lock_wallet(&self, name: &WalletName) -> OwnedMutexGuard<()> {
        let lock = {
            let mut locks = self
                .inner
                .wallet_locks
                .lock()
                .expect("wallet lock map poisoned");
            locks.entry(name.clone()).or_default().clone()
        };

        lock.lock_owned().await
    }

    pub fn store_preview(&self, wallet: WalletName, psbt: Psbt) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let mut previews = self.inner.previews.lock().expect("preview map poisoned");

        previews.retain(|_, preview| preview.created_at.elapsed() < PREVIEW_TTL);
        previews.insert(
            id.clone(),
            StoredPreview {
                wallet,
                psbt,
                created_at: Instant::now(),
            },
        );

        id
    }

    /// Returns an unexpired preview belonging to `wallet`.
    pub fn preview(&self, id: &str, wallet: &WalletName) -> Option<StoredPreview> {
        let previews = self.inner.previews.lock().expect("preview map poisoned");

        previews
            .get(id)
            .filter(|preview| &preview.wallet == wallet)
            .filter(|preview| preview.created_at.elapsed() < PREVIEW_TTL)
            .cloned()
    }

    pub fn consume_preview(&self, id: &str) {
        self.inner
            .previews
            .lock()
            .expect("preview map poisoned")
            .remove(id);
    }
}
