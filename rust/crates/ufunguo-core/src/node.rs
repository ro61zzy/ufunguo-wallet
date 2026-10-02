use bdk_bitcoind_rpc::bitcoincore_rpc::{Auth, Client, RpcApi};
use bdk_bitcoind_rpc::{Emitter, NO_EXPECTED_MEMPOOL_TXS};
use bdk_wallet::{chain::local_chain::ApplyHeaderError, rusqlite};
use thiserror::Error;

use crate::UfunguoWallet;

#[derive(Debug)]
pub struct NodeStatus {
    pub network: String,
    pub blocks: u64,
    pub headers: u64,
}

#[derive(Debug)]
pub struct SyncReport {
    pub blocks_scanned: u64,
    pub mempool_transactions: usize,
    pub wallet_height: u32,
}

#[derive(Debug, Error)]
pub enum NodeError {
    #[error("Bitcoin Core RPC error: {0}")]
    Rpc(#[from] bdk_bitcoind_rpc::bitcoincore_rpc::Error),

    #[error("wallet block header could not be applied: {0}")]
    ApplyHeader(#[from] ApplyHeaderError),

    #[error("failed to persist synchronized wallet: {0}")]
    Database(#[from] rusqlite::Error),
}

pub fn bitcoin_node_status(
    rpc_url: &str,
    rpc_user: &str,
    rpc_password: &str,
) -> Result<NodeStatus, NodeError> {
    let client = create_rpc_client(rpc_url, rpc_user, rpc_password)?;
    let information = client.get_blockchain_info()?;

    Ok(NodeStatus {
        network: information.chain.to_string(),
        blocks: information.blocks,
        headers: information.headers,
    })
}

pub fn sync_wallet(
    wallet: &mut UfunguoWallet,
    rpc_url: &str,
    rpc_user: &str,
    rpc_password: &str,
) -> Result<SyncReport, NodeError> {
    let client = create_rpc_client(rpc_url, rpc_user, rpc_password)?;

    let wallet_tip = wallet.inner.latest_checkpoint();
    let start_height = wallet_tip.height();

    let mut emitter = Emitter::new(&client, wallet_tip, start_height, NO_EXPECTED_MEMPOOL_TXS);

    let mut blocks_scanned = 0;

    while let Some(block_event) = emitter.next_block()? {
        wallet.inner.apply_block_connected_to(
            &block_event.block,
            block_event.block_height(),
            block_event.connected_to(),
        )?;

        blocks_scanned += 1;
    }

    let mempool_update = emitter.mempool()?.update;
    let mempool_transactions = mempool_update.len();

    wallet.inner.apply_unconfirmed_txs(mempool_update);
    wallet.inner.persist(&mut wallet.connection)?;

    Ok(SyncReport {
        blocks_scanned,
        mempool_transactions,
        wallet_height: wallet.inner.latest_checkpoint().height(),
    })
}

fn create_rpc_client(
    rpc_url: &str,
    rpc_user: &str,
    rpc_password: &str,
) -> Result<Client, NodeError> {
    Ok(Client::new(
        rpc_url,
        Auth::UserPass(rpc_user.to_owned(), rpc_password.to_owned()),
    )?)
}
