use axum::{
    Json,
    extract::rejection::{JsonRejection, PathRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use ufunguo_core::service::ServiceError;

use crate::dto::{ErrorBody, ErrorDetail};

/// Every failure is returned as `{ "error": { "code", "message" } }`.
#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "bad_request", message)
    }

    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            "The wallet operation failed unexpectedly",
        )
    }
}

impl From<ServiceError> for ApiError {
    fn from(error: ServiceError) -> Self {
        let code = error.code();
        let status = match code {
            "invalid_wallet_name"
            | "invalid_mnemonic"
            | "invalid_address"
            | "wrong_network"
            | "invalid_amount"
            | "invalid_fee_rate" => StatusCode::BAD_REQUEST,
            "wallet_not_found" | "transaction_not_found" => StatusCode::NOT_FOUND,
            "wallet_exists" | "wallet_mismatch" => StatusCode::CONFLICT,
            "insufficient_funds" | "signing_failed" | "broadcast_failed" => {
                StatusCode::UNPROCESSABLE_ENTITY
            }
            "node_unavailable" => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let message = match &error {
            // Never expose file paths to the client.
            ServiceError::WalletExists(_) => "A wallet with this name already exists".to_owned(),
            // Internal details (database errors, I/O) are logged, not returned.
            _ if status == StatusCode::INTERNAL_SERVER_ERROR => {
                eprintln!("[ufunguo-api] internal error: {error}");
                return Self::internal();
            }
            _ => capitalize(&error.to_string()),
        };

        Self::new(status, code, message)
    }
}

impl From<JsonRejection> for ApiError {
    fn from(rejection: JsonRejection) -> Self {
        // serde_json messages can quote the offending value, which could be a
        // recovery phrase, so only a generic description is returned.
        let message = match rejection {
            JsonRejection::MissingJsonContentType(_) => {
                "Expected a JSON body with Content-Type: application/json"
            }
            JsonRejection::JsonSyntaxError(_) => "The request body is not valid JSON",
            JsonRejection::JsonDataError(_) => {
                "The request body is missing a field or has a field of the wrong type"
            }
            _ => "The request body could not be read",
        };
        Self::bad_request(message)
    }
}

impl From<PathRejection> for ApiError {
    fn from(rejection: PathRejection) -> Self {
        Self::bad_request(rejection.body_text())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            error: ErrorDetail {
                code: self.code,
                message: self.message,
            },
        };

        (self.status, Json(body)).into_response()
    }
}

fn capitalize(message: &str) -> String {
    let mut characters = message.chars();
    match characters.next() {
        Some(first) => first.to_uppercase().chain(characters).collect(),
        None => String::new(),
    }
}
