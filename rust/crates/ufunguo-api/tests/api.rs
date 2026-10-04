use std::fs;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use ufunguo_api::{AppState, dto, router};
use ufunguo_core::{
    Balance, WalletDirectory,
    service::{self, manual_fee_rate, parse_regtest_address},
};

const PHRASE: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER_PHRASE: &str =
    "legal winner thank year wave sausage worth useful legal winner thank yellow";

struct TestApi {
    app: Router,
    directory: tempfile::TempDir,
}

/// An API without Bitcoin Core: local wallet endpoints work, node-backed
/// endpoints report `node_unavailable`.
fn test_api() -> TestApi {
    let directory = tempfile::tempdir().expect("temp directory");
    let wallets = WalletDirectory::open(directory.path()).expect("wallet directory");
    let state = AppState::new(wallets, Err("not configured in tests".to_owned()));

    TestApi {
        app: router(state),
        directory,
    }
}

async fn send(app: &Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(uri);
    let body = match body {
        Some(body) => {
            request = request.header(header::CONTENT_TYPE, "application/json");
            Body::from(body.to_string())
        }
        None => Body::empty(),
    };

    let response = app
        .clone()
        .oneshot(request.body(body).expect("request"))
        .await
        .expect("response");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("JSON body")
    };

    (status, json)
}

fn assert_error(body: &Value, code: &str) {
    let error = body
        .get("error")
        .unwrap_or_else(|| panic!("error envelope: {body}"));
    assert_eq!(error["code"], code, "{body}");
    assert!(
        error["message"].as_str().is_some_and(|m| !m.is_empty()),
        "{body}"
    );
    assert_eq!(body.as_object().map(|o| o.len()), Some(1), "only `error`");
}

#[tokio::test]
async fn health_reports_regtest_and_missing_node() {
    let api = test_api();

    let (status, body) = send(&api.app, "GET", "/health", None).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["network"], "regtest");
    assert_eq!(body["regtestOnly"], true);
    assert_eq!(body["node"]["reachable"], false);
}

#[tokio::test]
async fn rejects_invalid_wallet_names() {
    let api = test_api();

    for name in ["", "Alice", "alice bob", "-x", &"a".repeat(33)] {
        let (status, body) = send(
            &api.app,
            "POST",
            "/api/wallets",
            Some(json!({ "name": name })),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST, "{name:?}");
        assert_error(&body, "invalid_wallet_name");
    }
}

#[tokio::test]
async fn rejects_path_traversal() {
    let api = test_api();

    for name in [
        "../evil",
        "..",
        "a/b",
        "/tmp/evil",
        ".hidden",
        "evil.sqlite",
    ] {
        let (status, body) = send(
            &api.app,
            "POST",
            "/api/wallets",
            Some(json!({ "name": name })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{name:?}");
        assert_error(&body, "invalid_wallet_name");

        let (status, body) = send(
            &api.app,
            "POST",
            "/api/wallets/%2e%2e/restore",
            Some(json!({ "mnemonic": PHRASE })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_error(&body, "invalid_wallet_name");
    }

    for uri in [
        "/api/wallets/..%2Fevil/overview",
        "/api/wallets/%2E%2E/overview",
        "/api/wallets/..%5Cevil/utxos",
    ] {
        let (status, body) = send(&api.app, "GET", uri, None).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{uri}");
        assert_error(&body, "invalid_wallet_name");
    }

    // Nothing was written outside (or inside) the wallet directory.
    assert_eq!(fs::read_dir(api.directory.path()).expect("dir").count(), 0);
    assert!(
        !api.directory
            .path()
            .parent()
            .expect("parent")
            .join("evil.sqlite")
            .exists()
    );
}

#[tokio::test]
async fn missing_wallet_uses_the_error_shape() {
    let api = test_api();

    let (status, body) = send(&api.app, "GET", "/api/wallets/alice/overview", None).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_error(&body, "wallet_not_found");
    assert_eq!(body["error"]["message"], "Wallet alice was not found");
    // Looking up a missing wallet must not create an empty database.
    assert!(!api.directory.path().join("alice.sqlite").exists());
}

#[tokio::test]
async fn malformed_bodies_and_unknown_routes_use_the_error_shape() {
    let api = test_api();

    let (status, body) = send(
        &api.app,
        "POST",
        "/api/wallets",
        Some(json!({ "nom": "x" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_error(&body, "bad_request");

    let (status, body) = send(&api.app, "GET", "/api/nope", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_error(&body, "not_found");

    let (status, body) = send(&api.app, "GET", "/api/wallets/alice/transactions/xyz", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_error(&body, "invalid_txid");
}

#[tokio::test]
async fn json_errors_never_echo_a_recovery_phrase() {
    let api = test_api();
    restore(&api.app, "alice", PHRASE).await;

    // A wrong-typed field next to a mnemonic: serde would normally quote values.
    let (status, body) = send(
        &api.app,
        "POST",
        "/api/wallets/alice/transactions/send",
        Some(json!({ "previewId": 5, "mnemonic": PHRASE })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(!body.to_string().contains("abandon"), "{body}");
}

#[tokio::test]
async fn create_returns_a_mnemonic_once_and_never_overwrites() {
    let api = test_api();

    let (status, created) = send(
        &api.app,
        "POST",
        "/api/wallets",
        Some(json!({ "name": "alice" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["name"], "alice");
    assert_eq!(created["wordCount"], 12);
    assert_eq!(
        created["mnemonic"]
            .as_str()
            .expect("mnemonic")
            .split(' ')
            .count(),
        12
    );
    assert!(
        created["firstReceiveAddress"]
            .as_str()
            .expect("address")
            .starts_with("bcrt1q")
    );
    assert_eq!(created["receivePath"], "m/84'/1'/0'/0/*");

    let path = api.directory.path().join("alice.sqlite");
    let before = fs::read(&path).expect("wallet file");

    let (status, body) = send(
        &api.app,
        "POST",
        "/api/wallets",
        Some(json!({ "name": "alice" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_error(&body, "wallet_exists");
    assert!(
        !body
            .to_string()
            .contains(api.directory.path().to_str().expect("path"))
    );
    assert_eq!(fs::read(&path).expect("wallet file"), before);

    // A restore with a different phrase cannot replace it either.
    let (status, body) = send(
        &api.app,
        "POST",
        "/api/wallets/alice/restore",
        Some(json!({ "mnemonic": PHRASE })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_error(&body, "wallet_mismatch");
    assert_eq!(fs::read(&path).expect("wallet file"), before);

    let (_, list) = send(&api.app, "GET", "/api/wallets", None).await;
    assert_eq!(list, json!({ "wallets": [{ "name": "alice" }] }));
}

async fn restore(app: &Router, name: &str, phrase: &str) -> (StatusCode, Value) {
    send(
        app,
        "POST",
        &format!("/api/wallets/{name}/restore"),
        Some(json!({ "mnemonic": phrase })),
    )
    .await
}

#[tokio::test]
async fn restore_is_deterministic_and_does_not_overwrite_another_wallet() {
    let api = test_api();

    let (status, first) = restore(&api.app, "bob", PHRASE).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["alreadyExisted"], false);
    assert_eq!(first["masterFingerprint"], "73c5da0a");
    // BIP84 test vector for this phrase on test networks.
    assert_eq!(
        first["firstReceiveAddress"],
        "bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk"
    );

    let (status, again) = restore(&api.app, "bob", PHRASE).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(again["alreadyExisted"], true);

    let (status, body) = restore(&api.app, "bob", OTHER_PHRASE).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_error(&body, "wallet_mismatch");

    let (status, body) = restore(&api.app, "carol", "abandon abandon abandon").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_error(&body, "invalid_mnemonic");
    assert!(!body.to_string().contains("abandon abandon"));
    assert!(!api.directory.path().join("carol.sqlite").exists());
}

#[tokio::test]
async fn receive_reveals_and_persists_the_next_index() {
    let api = test_api();
    restore(&api.app, "bob", PHRASE).await;

    let (status, first) = send(&api.app, "POST", "/api/wallets/bob/addresses/receive", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["index"], 0);
    assert_eq!(first["keychain"], "external");
    assert_eq!(first["derivationPath"], "m/84'/1'/0'/0/0");
    assert_eq!(first["used"], false);

    let (_, second) = send(&api.app, "POST", "/api/wallets/bob/addresses/receive", None).await;
    assert_eq!(second["index"], 1);
    assert_ne!(first["address"], second["address"]);

    let (_, listed) = send(&api.app, "GET", "/api/wallets/bob/addresses", None).await;
    assert_eq!(listed["addresses"].as_array().map(Vec::len), Some(2));

    let (status, overview) = send(&api.app, "GET", "/api/wallets/bob/overview", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(overview["revealedAddresses"], 2);
    assert_eq!(overview["usedAddresses"], 0);
    assert_eq!(overview["balance"]["totalSats"], 0);
    assert_eq!(overview["latestTransaction"], Value::Null);
}

#[tokio::test]
async fn node_backed_endpoints_report_node_unavailable() {
    let api = test_api();
    restore(&api.app, "bob", PHRASE).await;

    let (status, body) = send(&api.app, "POST", "/api/wallets/bob/sync", None).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_error(&body, "node_unavailable");

    let (status, body) = send(&api.app, "GET", "/api/fees", None).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_error(&body, "node_unavailable");
}

#[tokio::test]
async fn preview_validates_input_before_touching_the_node() {
    let api = test_api();
    restore(&api.app, "bob", PHRASE).await;
    let uri = "/api/wallets/bob/transactions/preview";

    let cases = [
        (
            json!({ "address": "nope", "amountSats": 1000 }),
            "invalid_address",
        ),
        (
            json!({ "address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "amountSats": 1000 }),
            "wrong_network",
        ),
        (
            json!({ "address": "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080", "amountSats": 0 }),
            "invalid_amount",
        ),
        (
            json!({ "address": "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080", "amountSats": 1000, "feeRateSatPerVb": 0 }),
            "invalid_fee_rate",
        ),
        (
            json!({ "address": "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080", "amountSats": 1.5 }),
            "bad_request",
        ),
    ];

    for (body, code) in cases {
        let (status, response) = send(&api.app, "POST", uri, Some(body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{code}");
        assert_error(&response, code);
    }
}

#[tokio::test]
async fn send_requires_a_known_preview() {
    let api = test_api();
    restore(&api.app, "bob", PHRASE).await;

    // Give the state a (dummy) RPC config so the request reaches the preview
    // check; nothing contacts the node because the preview is unknown.
    let wallets = WalletDirectory::open(api.directory.path()).expect("dir");
    let state = AppState::new(
        wallets,
        Ok(service::RpcConfig {
            url: "http://127.0.0.1:9".to_owned(),
            user: "u".to_owned(),
            password: "p".to_owned(),
        }),
    );
    let app = router(state);

    let (status, body) = send(
        &app,
        "POST",
        "/api/wallets/bob/transactions/send",
        Some(json!({ "previewId": "missing", "mnemonic": PHRASE })),
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_error(&body, "preview_not_found");
}

#[test]
fn satoshi_amounts_serialize_as_json_integers() {
    let balance = Balance {
        immature: bitcoin::Amount::from_sat(1),
        trusted_pending: bitcoin::Amount::from_sat(2_500),
        untrusted_pending: bitcoin::Amount::from_sat(500),
        confirmed: bitcoin::Amount::from_sat(2_099_999_997_690_000),
    };

    let json = serde_json::to_value(dto::BalanceDto::from(&balance)).expect("serialize");

    assert_eq!(json["confirmedSats"], json!(2_099_999_997_690_000_u64));
    assert!(json["confirmedSats"].is_u64());
    assert_eq!(json["unconfirmedSats"], json!(3_000));
    assert_eq!(json["spendableSats"], json!(2_099_999_997_692_500_u64));
    assert_eq!(json["totalSats"], json!(2_099_999_997_693_001_u64));
    // Exactly representable as a JavaScript number (below 2^53).
    assert!(json["totalSats"].as_u64().expect("u64") < (1_u64 << 53));
    let text = serde_json::to_string(&dto::BalanceDto::from(&balance)).expect("text");
    assert!(!text.contains('.'), "no floating point amounts: {text}");
    assert!(!text.contains("\"2099"), "no string amounts: {text}");
}

#[test]
fn preview_response_has_the_documented_structure() {
    let directory = tempfile::tempdir().expect("temp directory");
    let path = directory.path().join("alice.sqlite");
    service::restore_wallet(&path, PHRASE).expect("restore");
    let mut wallet = service::open_existing_wallet(&path, "alice").expect("open");
    wallet
        .receive_unconfirmed_for_tests(bitcoin::Amount::from_sat(100_000))
        .expect("fund");
    let destination =
        parse_regtest_address("bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080").expect("address");

    let preview = service::preview_payment(
        &mut wallet,
        destination,
        bitcoin::Amount::from_sat(25_000),
        manual_fee_rate(2).expect("fee rate"),
    )
    .expect("preview");

    let json = serde_json::to_value(dto::PreviewResponse::new("id-1".to_owned(), 600, &preview))
        .expect("serialize");

    for key in [
        "previewId",
        "expiresInSeconds",
        "destination",
        "amountSats",
        "feeSats",
        "feeRateSatPerVb",
        "feeSource",
        "confirmationTarget",
        "inputTotalSats",
        "outputTotalSats",
        "changeSats",
        "vsize",
        "unsignedTxid",
        "psbtBase64",
        "inputs",
        "outputs",
    ] {
        assert!(json.get(key).is_some(), "missing {key}: {json}");
    }

    assert_eq!(json["amountSats"], 25_000);
    assert_eq!(json["feeRateSatPerVb"], 2);
    assert_eq!(json["feeSource"], "manual");
    assert_eq!(json["inputTotalSats"], 100_000);
    let fee = json["feeSats"].as_u64().expect("fee");
    let change = json["changeSats"].as_u64().expect("change");
    assert_eq!(25_000 + change + fee, 100_000);
    assert_eq!(json["outputTotalSats"], 25_000 + change);

    let inputs = json["inputs"].as_array().expect("inputs");
    assert_eq!(inputs.len(), 1);
    assert_eq!(inputs[0]["valueSats"], 100_000);
    assert_eq!(inputs[0]["keychain"], "external");
    assert_eq!(inputs[0]["derivationPath"], "m/84'/1'/0'/0/0");
    assert!(
        inputs[0]["outpoint"]
            .as_str()
            .expect("outpoint")
            .contains(':')
    );

    let outputs = json["outputs"].as_array().expect("outputs");
    let roles: Vec<&str> = outputs.iter().filter_map(|o| o["role"].as_str()).collect();
    assert!(
        roles.contains(&"recipient") && roles.contains(&"change"),
        "{roles:?}"
    );
    let change_output = outputs
        .iter()
        .find(|o| o["role"] == "change")
        .expect("change");
    assert_eq!(change_output["keychain"], "internal");
    assert_eq!(change_output["derivationPath"], "m/84'/1'/0'/1/0");
    assert!(
        json["psbtBase64"]
            .as_str()
            .expect("psbt")
            .starts_with("cHNidP8")
    );
}

#[test]
fn created_wallet_response_debug_hides_the_mnemonic() {
    let directory = tempfile::tempdir().expect("temp directory");
    let created = service::create_wallet(&directory.path().join("w.sqlite")).expect("create");
    let response = dto::CreatedWalletResponse::new("w".to_owned(), &created);

    let debug = format!("{response:?}");

    assert!(!debug.contains(&created.mnemonic.to_string()));
}
