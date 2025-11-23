use anyhow::{Context, Result};
use base64::Engine;
use http_body_util::{BodyExt, Full};
use hyper::{body::Incoming as Body, header::CONTENT_TYPE, http::StatusCode, Method, Request, Response};
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use dotenvy::dotenv;
use serde::{Deserialize, Serialize};
use std::{
    env,
    net::SocketAddr,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tracing::{error, info, instrument};

mod walrus_client;
mod tee_attestation;
mod quality_validator;

#[derive(Deserialize)]
struct VerificationRequest {
    blob_id: String,
    min_quality_threshold: u8,
}

#[derive(Serialize)]
struct VerificationResponse {
    blob_id: String,
    quality_score: u8,
    is_valid: bool,
    attestation: String,
    timestamp_ms: u64,
    nitro_enclave: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    init_tracing();
    let listen_addr = env::var("NAUTILUS_LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".into());
    let addr: SocketAddr = listen_addr
        .parse()
        .with_context(|| format!("Invalid NAUTILUS_LISTEN_ADDR '{}'", listen_addr))?;
    info!("Starting Nautilus TEE Service on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("Failed to bind TCP listener")?;

    loop {
        let (stream, peer) = listener.accept().await?;
        info!(%peer, "Accepted connection");
        tokio::spawn(async move {
            let io = TokioIo::new(stream);
            let svc = service_fn(route);
            if let Err(err) = http1::Builder::new()
                .serve_connection(io, svc)
                .await
            {
                error!(%err, "HTTP connection error");
            }
        });
    }
}

fn init_tracing() {
    use tracing_subscriber::{EnvFilter, FmtSubscriber};
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let sub = FmtSubscriber::builder().with_env_filter(filter).finish();
    let _ = tracing::subscriber::set_global_default(sub);
}

#[instrument(skip_all)]
async fn route(req: Request<Body>) -> Result<Response<Full<Bytes>>, hyper::Error> {
    match (req.method(), req.uri().path()) {
        (&Method::GET, "/health") => {
            let body = "Nautilus TEE Service Running";
            Ok(text_response(StatusCode::OK, body))
        }
        (&Method::POST, "/verify") => {
            match handle_verification(req).await {
                Ok(resp) => {
                    let json = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{}".to_vec());
                    Ok(json_response(StatusCode::OK, json))
                }
                Err(err) => {
                    error!(%err, "Verification failed");
                    let msg = format!(r#"{{"error":"{}"}}"#, err);
                    Ok(json_response(StatusCode::BAD_REQUEST, msg.into_bytes()))
                }
            }
        }
        _ => {
            let body = "Not Found";
            Ok(text_response(StatusCode::NOT_FOUND, body))
        }
    }
}

#[instrument(skip_all)]
async fn handle_verification(req: Request<Body>) -> Result<VerificationResponse> {
    // 1) Parse request
    let body_bytes = collect_body(req.into_body()).await?;
    let vr: VerificationRequest =
        serde_json::from_slice(&body_bytes).context("Invalid JSON body")?;
    info!(blob_id = %vr.blob_id, min_quality = vr.min_quality_threshold, "Verification request");

    // 2) Fetch encrypted blob from Walrus
    let encrypted = walrus_client::fetch_blob(&vr.blob_id).await
        .with_context(|| format!("Failed to fetch Walrus blob {}", vr.blob_id))?;
    info!(size = encrypted.len(), "Fetched encrypted blob");

    // 3) Decrypt using Seal key shares (placeholder)
    let plaintext = decrypt_placeholder(&encrypted).context("Decrypt placeholder failed")?;

    // 4) Validate quality
    let quality_score = quality_validator::validate_dataset_quality(&plaintext)
        .context("Quality validation failed")?;
    let is_valid = quality_score >= vr.min_quality_threshold;
    info!(quality_score, is_valid, "Quality validation done");

    // 5) Generate attestation
    let attn_bytes = tee_attestation::generate_attestation(&vr.blob_id, quality_score)
        .await
        .unwrap_or_else(|e| {
            error!(err = %e, "Attestation failed, returning empty bytes");
            Vec::new()
        });
    let attestation = base64::engine::general_purpose::STANDARD.encode(attn_bytes);

    // 6) Build response
    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
    let nitro_enclave = Path::new("/dev/nsm").exists();
    Ok(VerificationResponse {
        blob_id: vr.blob_id,
        quality_score,
        is_valid,
        attestation,
        timestamp_ms: now_ms,
        nitro_enclave,
    })
}

fn text_response(status: StatusCode, body: &str) -> Response<Full<Bytes>> {
    let mut resp = Response::new(Full::from(Bytes::from(body.to_string())));
    *resp.status_mut() = status;
    resp.headers_mut().insert(CONTENT_TYPE, "text/plain; charset=utf-8".parse().unwrap());
    resp
}

fn json_response(status: StatusCode, body: Vec<u8>) -> Response<Full<Bytes>> {
    let mut resp = Response::new(Full::from(Bytes::from(body)));
    *resp.status_mut() = status;
    resp.headers_mut().insert(CONTENT_TYPE, "application/json".parse().unwrap());
    resp
}

async fn collect_body(body: Body) -> Result<Vec<u8>> {
    let collected = body.collect().await.context("collect body")?;
    let bytes = collected.to_bytes();
    Ok(bytes.to_vec())
}

fn decrypt_placeholder(ciphertext: &[u8]) -> Result<Vec<u8>> {
    // Placeholder "decryption": XOR with a fixed key stream (not secure).
    // Replace with Seal key-share decryption inside the enclave.
    const KEY: u8 = 0xAA;
    Ok(ciphertext.iter().map(|b| b ^ KEY).collect())
}

// removed duplicate main
