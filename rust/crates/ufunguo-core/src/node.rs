use bdk_bitcoind_rpc::bitcoincore_rpc::{Auth, Client, RpcApi};
use thiserror::Error;

#[derive(Debug)]
pub struct NodeStatus {
    pub network: String,
    pub blocks: u64,
    pub headers: u64,
}

#[derive(Debug, Error)]
pub enum NodeError {
    #[error("Bitcoin Core RPC error: {0}")]
    Rpc(#[from] bdk_bitcoind_rpc::bitcoincore_rpc::Error),
}

pub fn bitcoin_node_status(
    rpc_url: &str,
    rpc_user: &str,
    rpc_password: &str,
) -> Result<NodeStatus, NodeError> {
    let client = Client::new(
        rpc_url,
        Auth::UserPass(rpc_user.to_owned(), rpc_password.to_owned()),
    )?;

    let information = client.get_blockchain_info()?;

    Ok(NodeStatus {
        network: information.chain.to_string(),
        blocks: information.blocks,
        headers: information.headers,
    })
}
