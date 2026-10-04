use bdk_bitcoind_rpc::bitcoincore_rpc::{Auth, Client, RpcApi, json::EstimateMode};
use bdk_bitcoind_rpc::{Emitter, NO_EXPECTED_MEMPOOL_TXS};
use bdk_wallet::{chain::local_chain::ApplyHeaderError, rusqlite};
use bitcoin::{Amount, FeeRate, Transaction, Txid};
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

pub fn broadcast_transaction(
    rpc_url: &str,
    rpc_user: &str,
    rpc_password: &str,
    transaction: &Transaction,
) -> Result<Txid, NodeError> {
    let client = create_rpc_client(rpc_url, rpc_user, rpc_password)?;

    let txid = client.send_raw_transaction(transaction)?;

    Ok(txid)
}

pub fn estimate_fee_rate(
    rpc_url: &str,
    rpc_user: &str,
    rpc_password: &str,
    confirmation_target: u16,
) -> Result<Option<FeeRate>, NodeError> {
    let client = create_rpc_client(rpc_url, rpc_user, rpc_password)?;
    let estimate =
        client.estimate_smart_fee(confirmation_target, Some(EstimateMode::Conservative))?;

    let Some(amount_per_kvb) = estimate.fee_rate else {
        return Ok(None);
    };

    Ok(fee_rate_from_amount_per_kvb(amount_per_kvb))
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

fn fee_rate_from_amount_per_kvb(amount_per_kvb: Amount) -> Option<FeeRate> {
    // Bitcoin Core returns BTC/kvB. `Amount` converts that to sat/kvB,
    // then we round up to sat/vB so the wallet never underpays because
    // of integer division.
    let sats_per_vb = amount_per_kvb.to_sat().div_ceil(1_000).max(1);

    FeeRate::from_sat_per_vb(sats_per_vb)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_core_fee_estimate_from_kvb_to_vb_and_rounds_up() {
        let exact =
            fee_rate_from_amount_per_kvb(Amount::from_sat(2_000)).expect("valid exact fee rate");
        let rounded =
            fee_rate_from_amount_per_kvb(Amount::from_sat(2_001)).expect("valid rounded fee rate");

        assert_eq!(exact.to_sat_per_vb_ceil(), 2);
        assert_eq!(rounded.to_sat_per_vb_ceil(), 3);
    }
}
