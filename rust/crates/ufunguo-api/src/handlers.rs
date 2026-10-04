use axum::{
    Json,
    extract::{FromRequest, Path, State},
    http::StatusCode,
};
use bitcoin::Txid;
use std::str::FromStr;
use ufunguo_core::{
    WalletName,
    service::{self, DEFAULT_CONFIRMATION_TARGET, DEFAULT_FEE_RATE_SAT_VB, ServiceError},
};

use crate::{
    dto::*,
    error::ApiError,
    state::{AppState, PREVIEW_TTL},
};

/// Confirmation targets offered to the mobile fee picker.
const FEE_TARGETS: [u16; 4] = [1, 3, 6, 12];
/// Bitcoin Core accepts estimatesmartfee targets from 1 to 1008 blocks.
const MAX_CONFIRMATION_TARGET: u16 = 1008;

/// `Json` extractor whose rejections use the API error shape.
#[derive(FromRequest)]
#[from_request(via(Json), rejection(ApiError))]
pub struct ApiJson<T>(pub T);

type ApiResult<T> = Result<Json<T>, ApiError>;

fn wallet_name(name: &str) -> Result<WalletName, ApiError> {
    Ok(WalletName::parse(name).map_err(ServiceError::from)?)
}

/// Runs blocking wallet/RPC work off the async runtime.
async fn blocking<T, F>(work: F) -> Result<T, ApiError>
where
    F: FnOnce() -> Result<T, ServiceError> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(ApiError::from)
}

pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let node = match state.rpc() {
        Err(_) => NodeHealth {
            reachable: false,
            chain: None,
            blocks: None,
            message: state
                .rpc_status_message()
                .map(ToOwned::to_owned)
                .or_else(|| Some("Bitcoin Core is not configured".to_owned())),
        },
        Ok(rpc) => match tokio::task::spawn_blocking(move || rpc.node_status()).await {
            Ok(Ok(status)) => NodeHealth {
                reachable: true,
                chain: Some(status.network),
                blocks: Some(status.blocks),
                message: None,
            },
            _ => NodeHealth {
                reachable: false,
                chain: None,
                blocks: None,
                message: Some("Could not reach Bitcoin Core".to_owned()),
            },
        },
    };

    Json(HealthResponse {
        status: "ok",
        network: "regtest",
        regtest_only: true,
        node,
    })
}

pub async fn list_wallets(State(state): State<AppState>) -> ApiResult<WalletListResponse> {
    let directory = state.directory().clone();
    let names = blocking(move || Ok(directory.list()?)).await?;

    Ok(Json(WalletListResponse {
        wallets: names
            .into_iter()
            .map(|name| WalletSummary {
                name: name.to_string(),
            })
            .collect(),
    }))
}

pub async fn create_wallet(
    State(state): State<AppState>,
    ApiJson(request): ApiJson<CreateWalletRequest>,
) -> Result<(StatusCode, Json<CreatedWalletResponse>), ApiError> {
    let name = wallet_name(&request.name)?;
    let _guard = state.lock_wallet(&name).await;
    let path = state.directory().path_for(&name);

    let response = blocking(move || {
        let created = service::create_wallet(&path)?;
        // The mnemonic is copied into a zeroizing buffer for the response;
        // `created` zeroizes its own copy when dropped here.
        Ok(CreatedWalletResponse::new(name.to_string(), &created))
    })
    .await?;

    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn restore_wallet(
    State(state): State<AppState>,
    Path(name): Path<String>,
    ApiJson(request): ApiJson<RestoreWalletRequest>,
) -> ApiResult<RestoredWalletResponse> {
    let name = wallet_name(&name)?;
    let _guard = state.lock_wallet(&name).await;
    let path = state.directory().path_for(&name);

    let response = blocking(move || {
        let restored = service::restore_wallet(&path, &request.mnemonic)?;
        Ok(RestoredWalletResponse::new(name.to_string(), &restored))
    })
    .await?;

    Ok(Json(response))
}

pub async fn overview(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<OverviewResponse> {
    let name = wallet_name(&name)?;
    let path = state.directory().path_for(&name);

    let response = blocking(move || {
        let wallet = service::open_existing_wallet(&path, name.as_str())?;
        Ok(OverviewResponse::new(name.to_string(), &wallet.overview()))
    })
    .await?;

    Ok(Json(response))
}

pub async fn sync(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<SyncResponse> {
    let name = wallet_name(&name)?;
    let rpc = state.rpc()?;
    let _guard = state.lock_wallet(&name).await;
    let path = state.directory().path_for(&name);

    let report = blocking(move || {
        let mut wallet = service::open_existing_wallet(&path, name.as_str())?;
        rpc.ensure_regtest_node()?;
        rpc.sync(&mut wallet)
    })
    .await?;

    Ok(Json(SyncResponse {
        blocks_scanned: report.blocks_scanned,
        mempool_transactions: report.mempool_transactions,
        wallet_height: report.wallet_height,
    }))
}

pub async fn addresses(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<AddressListResponse> {
    let name = wallet_name(&name)?;
    let path = state.directory().path_for(&name);

    let addresses = blocking(move || {
        let wallet = service::open_existing_wallet(&path, name.as_str())?;
        Ok(wallet.addresses())
    })
    .await?;

    Ok(Json(AddressListResponse {
        addresses: addresses.iter().map(Into::into).collect(),
    }))
}

pub async fn reveal_receive_address(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<AddressDto> {
    let name = wallet_name(&name)?;
    let _guard = state.lock_wallet(&name).await;
    let path = state.directory().path_for(&name);

    let address = blocking(move || {
        let mut wallet = service::open_existing_wallet(&path, name.as_str())?;
        Ok(wallet.reveal_receive_address()?)
    })
    .await?;

    Ok(Json((&address).into()))
}

pub async fn transactions(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<TransactionListResponse> {
    let name = wallet_name(&name)?;
    let path = state.directory().path_for(&name);

    let transactions = blocking(move || {
        let wallet = service::open_existing_wallet(&path, name.as_str())?;
        Ok(wallet.transactions())
    })
    .await?;

    Ok(Json(TransactionListResponse {
        transactions: transactions.iter().map(Into::into).collect(),
    }))
}

pub async fn transaction(
    State(state): State<AppState>,
    Path((name, txid)): Path<(String, String)>,
) -> ApiResult<TransactionDetailDto> {
    let name = wallet_name(&name)?;
    let txid = Txid::from_str(&txid).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_txid",
            "Transaction IDs are 64 hexadecimal characters",
        )
    })?;
    let path = state.directory().path_for(&name);

    let details = blocking(move || {
        let wallet = service::open_existing_wallet(&path, name.as_str())?;
        wallet
            .transaction_details(txid)
            .ok_or(ServiceError::TransactionNotFound(txid))
    })
    .await?;

    Ok(Json((&details).into()))
}

pub async fn utxos(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<UtxoListResponse> {
    let name = wallet_name(&name)?;
    let path = state.directory().path_for(&name);

    let utxos = blocking(move || {
        let wallet = service::open_existing_wallet(&path, name.as_str())?;
        Ok(wallet.unspent_outputs())
    })
    .await?;

    Ok(Json(UtxoListResponse {
        utxos: utxos.iter().map(Into::into).collect(),
    }))
}

pub async fn fees(State(state): State<AppState>) -> ApiResult<FeeEstimatesResponse> {
    let rpc = state.rpc()?;

    let estimates = blocking(move || {
        FEE_TARGETS
            .iter()
            .map(|&target| {
                service::resolve_fee_rate(&rpc, None, target)
                    .map(|resolved| FeeEstimateDto::new(target, &resolved))
            })
            .collect::<Result<Vec<_>, _>>()
    })
    .await?;

    Ok(Json(FeeEstimatesResponse {
        estimates,
        fallback_sat_per_vb: DEFAULT_FEE_RATE_SAT_VB,
    }))
}

pub async fn preview_transaction(
    State(state): State<AppState>,
    Path(name): Path<String>,
    ApiJson(request): ApiJson<PreviewRequest>,
) -> ApiResult<PreviewResponse> {
    let name = wallet_name(&name)?;
    let destination = service::parse_regtest_address(&request.address)?;
    let amount = service::positive_amount(request.amount_sats)?;
    let manual_fee = request
        .fee_rate_sat_per_vb
        .map(service::manual_fee_rate)
        .transpose()?;
    let target = request
        .confirmation_target
        .unwrap_or(DEFAULT_CONFIRMATION_TARGET);
    if !(1..=MAX_CONFIRMATION_TARGET).contains(&target) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_fee_rate",
            format!("Confirmation target must be between 1 and {MAX_CONFIRMATION_TARGET} blocks"),
        ));
    }

    let rpc = state.rpc()?;
    let _guard = state.lock_wallet(&name).await;
    let path = state.directory().path_for(&name);
    let wallet = name.clone();

    let preview = blocking(move || {
        let mut wallet = service::open_existing_wallet(&path, wallet.as_str())?;
        rpc.ensure_regtest_node()?;
        // Same as the CLI: synchronize before coin selection.
        rpc.sync(&mut wallet)?;
        let fee_rate = match manual_fee {
            Some(fee_rate) => fee_rate,
            None => service::resolve_fee_rate(&rpc, None, target)?,
        };
        service::preview_payment(&mut wallet, destination, amount, fee_rate)
    })
    .await?;

    let preview_id = state.store_preview(name, preview.psbt.clone());

    Ok(Json(PreviewResponse::new(
        preview_id,
        PREVIEW_TTL.as_secs(),
        &preview,
    )))
}

pub async fn send_transaction(
    State(state): State<AppState>,
    Path(name): Path<String>,
    ApiJson(request): ApiJson<SendRequest>,
) -> ApiResult<SendResponse> {
    let name = wallet_name(&name)?;
    let rpc = state.rpc()?;
    let _guard = state.lock_wallet(&name).await;

    // Checked after taking the wallet lock so a preview cannot be broadcast twice.
    let preview = state.preview(&request.preview_id, &name).ok_or_else(|| {
        ApiError::new(
            StatusCode::NOT_FOUND,
            "preview_not_found",
            "This transaction review expired or was already used",
        )
    })?;
    let path = state.directory().path_for(&name);
    let mnemonic = request.mnemonic;

    let (txid, signed_inputs, sync_report) = blocking(move || {
        let mut wallet = service::open_existing_wallet(&path, name.as_str())?;
        let signed = service::sign_psbt_with_phrase(&wallet, preview.psbt, &mnemonic)?;
        // The recovery phrase is no longer needed; wipe it before the network call.
        drop(mnemonic);
        let txid = service::broadcast(&rpc, &signed.transaction)?;
        // Best effort: let the wallet see its own mempool transaction.
        let sync_report = rpc.sync(&mut wallet).ok();
        Ok((txid, signed.signed_inputs, sync_report))
    })
    .await?;

    state.consume_preview(&request.preview_id);

    Ok(Json(SendResponse {
        txid: txid.to_string(),
        signed_inputs,
        synced: sync_report.is_some(),
        wallet_height: sync_report.map(|report| report.wallet_height),
    }))
}

pub async fn not_found() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "not_found", "No such endpoint")
}
