//! Local, regtest-only HTTP bridge between the Ufunguo React Native app and
//! `ufunguo-core`.
//!
//! This exists so the simulator can use the real Rust wallet during
//! development. A production mobile app should call the Rust library
//! in-process through a native bridge such as UniFFI instead of HTTP.

pub mod dto;
pub mod error;
mod handlers;
pub mod state;

use std::time::Instant;

use axum::{
    Router,
    extract::Request,
    http::{HeaderValue, Method, header},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
};
use tower_http::cors::{AllowOrigin, CorsLayer};

pub use state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(handlers::health))
        .route(
            "/api/wallets",
            get(handlers::list_wallets).post(handlers::create_wallet),
        )
        .route(
            "/api/wallets/{wallet}/restore",
            post(handlers::restore_wallet),
        )
        .route("/api/wallets/{wallet}/overview", get(handlers::overview))
        .route("/api/wallets/{wallet}/sync", post(handlers::sync))
        .route("/api/wallets/{wallet}/addresses", get(handlers::addresses))
        .route(
            "/api/wallets/{wallet}/addresses/receive",
            post(handlers::reveal_receive_address),
        )
        .route(
            "/api/wallets/{wallet}/transactions",
            get(handlers::transactions),
        )
        .route(
            "/api/wallets/{wallet}/transactions/preview",
            post(handlers::preview_transaction),
        )
        .route(
            "/api/wallets/{wallet}/transactions/send",
            post(handlers::send_transaction),
        )
        .route(
            "/api/wallets/{wallet}/transactions/{txid}",
            get(handlers::transaction),
        )
        .route("/api/wallets/{wallet}/utxos", get(handlers::utxos))
        .route("/api/fees", get(handlers::fees))
        .fallback(handlers::not_found)
        .layer(middleware::from_fn(log_request))
        .layer(cors())
        .with_state(state)
}

/// Native apps send no `Origin` header, so CORS only matters for browser
/// tooling during development. Only localhost origins are allowed.
fn cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            is_local_origin(origin.as_bytes())
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::ACCEPT])
}

fn is_local_origin(origin: &[u8]) -> bool {
    let Ok(origin) = std::str::from_utf8(origin) else {
        return false;
    };

    ["http://localhost", "http://127.0.0.1", "http://[::1]"]
        .iter()
        .any(|prefix| {
            origin == *prefix
                || origin
                    .strip_prefix(prefix)
                    .and_then(|rest| rest.strip_prefix(':'))
                    .is_some_and(|port| {
                        !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit())
                    })
        })
}

/// Logs method, path, status and latency. Request bodies — which may contain
/// a recovery phrase — are never logged.
async fn log_request(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let started = Instant::now();

    let response = next.run(request).await;

    eprintln!(
        "[ufunguo-api] {method} {path} -> {} ({} ms)",
        response.status().as_u16(),
        started.elapsed().as_millis()
    );

    response
}

#[cfg(test)]
mod tests {
    use super::is_local_origin;

    #[test]
    fn only_localhost_origins_are_allowed() {
        for origin in [
            "http://localhost",
            "http://localhost:8081",
            "http://127.0.0.1:19006",
            "http://[::1]:8081",
        ] {
            assert!(is_local_origin(origin.as_bytes()), "{origin}");
        }

        for origin in [
            "https://evil.example",
            "http://localhost.evil.example",
            "http://127.0.0.1.evil.example",
            "http://localhost:80abc",
            "http://localhost:",
            "null",
        ] {
            assert!(!is_local_origin(origin.as_bytes()), "{origin}");
        }
    }
}
