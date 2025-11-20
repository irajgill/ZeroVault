use anyhow::{Context, Result};
use reqwest::{Client, StatusCode};
use std::env;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, warn};

const DEFAULT_AGGREGATOR: &str = "https://aggregator.walrus-testnet.walrus.space";

pub struct WalrusClient {
    http: Client,
    aggregator_url: String,
}

impl WalrusClient {
    pub fn new() -> Result<Self> {
        let aggregator_url = env::var("WALRUS_AGGREGATOR_URL").unwrap_or_else(|_| DEFAULT_AGGREGATOR.to_string());
        let http = Client::builder()
            .use_rustls_tls()
            .build()
            .context("Failed building reqwest client")?;
        Ok(Self { http, aggregator_url })
    }

    pub async fn fetch_blob(&self, blob_id: &str) -> Result<Vec<u8>> {
        // Optional local dev shortcut: if WALRUS_ALLOW_MOCK is enabled and the blob_id
        // looks like a test id, return synthetic bytes so the service can be exercised
        // without requiring a real Walrus blob.
        let allow_mock = env::var("WALRUS_ALLOW_MOCK")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if allow_mock && (blob_id.starts_with("test_") || blob_id == "mock") {
            info!(%blob_id, "WALRUS_ALLOW_MOCK=1 and test blob id detected; returning synthetic blob bytes");
            return Ok(generate_mock_blob(blob_id));
        }

        // Exponential backoff: 250ms, 500ms, 1000ms
        let mut attempt: u32 = 0;
        let max_attempts: u32 = 3;
        loop {
            attempt += 1;
            // Walrus aggregator exposes blobs under /v1/blobs/{blob_id}
            let url = format!("{}/v1/{}", self.aggregator_url, format!("blobs/{}", blob_id));
            info!(%url, attempt, "Fetching Walrus blob");
            let resp = self.http.get(&url).send().await.context("Walrus GET failed")?;
            match resp.status() {
                StatusCode::OK => {
                    let bytes = resp.bytes().await.context("Read Walrus body failed")?;
                    return Ok(bytes.to_vec());
                }
                status if attempt < max_attempts => {
                    warn!(%status, attempt, "Walrus fetch failed, retrying with backoff");
                    let backoff_ms = 250u64 << (attempt - 1);
                    sleep(Duration::from_millis(backoff_ms)).await;
                    continue;
                }
                status => {
                    let txt = resp.text().await.unwrap_or_default();
                    anyhow::bail!("Walrus returned {} after {} attempts: {}", status, attempt, txt);
                }
            }
        }
    }
}

// Convenience function to preserve existing call sites.
pub async fn fetch_blob(blob_id: &str) -> Result<Vec<u8>> {
    let client = WalrusClient::new()?;
    client.fetch_blob(blob_id).await
}

fn generate_mock_blob(blob_id: &str) -> Vec<u8> {
    // Build a deterministic, moderately diverse byte buffer from the blob_id.
    // Large enough to exercise the quality validator (entropy, repetition, size thresholds).
    let base = format!("zkDataVault-mock:{}:", blob_id).into_bytes();
    let mut out = Vec::with_capacity(32 * 1024);
    while out.len() < 32 * 1024 {
        // Interleave the base with a simple incrementing pattern to add variation.
        for i in 0u8..64 {
            out.extend_from_slice(&base);
            out.push(i);
            out.extend_from_slice(b"The quick brown fox jumps over the lazy dog. ");
        }
    }
    out.truncate(32 * 1024);
    out
}


