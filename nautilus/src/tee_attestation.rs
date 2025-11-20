use anyhow::{Context, Result};
use aws_nitro_enclaves_nsm_api::api::{Request, Response};
use aws_nitro_enclaves_nsm_api::driver::{nsm_exit, nsm_init, nsm_process_request};
use serde_bytes::ByteBuf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::info;
use std::env;
use ed25519_dalek::{Keypair, PublicKey, Signature, Signer};

#[derive(Serialize, Deserialize)]
pub struct AttestationData {
    pub blob_id: String,
    pub quality_score: u8,
    pub timestamp: u64,
    pub enclave_measurement: String,
}

#[derive(Serialize, Deserialize)]
pub struct AttestationEnvelope {
    pub format: String,                 // "ed25519-v1" or "nsm-document-v1"
    pub data: AttestationData,          // signed data
    pub signature_b64: Option<String>,  // present for ed25519-v1
    pub public_key_b64: Option<String>, // present for ed25519-v1
    pub nsm_document_b64: Option<String>, // present for nsm-document-v1
}

pub async fn generate_attestation(blob_id: &str, quality_score: u8) -> Result<Vec<u8>> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let measurement = get_enclave_measurement();
    let payload = AttestationData {
        blob_id: blob_id.to_string(),
        quality_score,
        timestamp,
        enclave_measurement: measurement,
    };
    let serialized = serde_json::to_vec(&payload).context("serialize AttestationData")?;

    if Path::new("/dev/nsm").exists() {
        info!("Nitro Enclave device detected, generating NSM attestation");
        let doc = generate_nitro_attestation(&serialized)?;
        let env = AttestationEnvelope {
            format: "nsm-document-v1".to_string(),
            data: payload,
            signature_b64: None,
            public_key_b64: None,
            nsm_document_b64: Some(base64::encode(doc)),
        };
        let out = serde_json::to_vec(&env).context("serialize AttestationEnvelope")?;
        Ok(out)
    } else {
        info!("No Nitro device, generating ed25519 signature attestation");
        let kp = ed25519_keypair_from_seed()?;
        let sig: Signature = kp.sign(&serialized);
        let env = AttestationEnvelope {
            format: "ed25519-v1".to_string(),
            data: payload,
            signature_b64: Some(base64::encode(sig.to_bytes())),
            public_key_b64: Some(base64::encode(kp.public.to_bytes())),
            nsm_document_b64: None,
        };
        let out = serde_json::to_vec(&env).context("serialize AttestationEnvelope")?;
        Ok(out)
    }
}

fn get_enclave_measurement() -> String {
    // Placeholder PCR0 hex string (96 hex chars = 48 bytes)
    "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
        .to_string()
}

fn generate_nitro_attestation(user_data: &[u8]) -> Result<Vec<u8>> {
    // SAFETY: this calls into the NSM driver which expects a valid FD and buffers.
    let fd = unsafe { nsm_init() };
    if fd < 0 {
        anyhow::bail!("nsm_init failed");
    }
    let req = Request::Attestation {
        user_data: Some(ByteBuf::from(user_data.to_vec())),
        public_key: None,
        nonce: None,
    };
    let resp = unsafe { nsm_process_request(fd, req) };
    let _ = unsafe { nsm_exit(fd) };
    match resp {
        Response::Attestation { document } => Ok(document),
        other => anyhow::bail!("Unexpected NSM response: {:?}", other),
    }
}

fn ed25519_keypair_from_seed() -> Result<Keypair> {
    // Derive a 32-byte seed from env var NAUTILUS_SIGNING_SEED (any string), else default.
    let seed_src = env::var("NAUTILUS_SIGNING_SEED").unwrap_or_else(|_| "zkdatavault-dev-seed".to_string());
    let mut hasher = Sha256::new();
    hasher.update(seed_src.as_bytes());
    let digest = hasher.finalize();
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&digest[..32]);
    let secret = ed25519_dalek::SecretKey::from_bytes(&seed)?;
    let public: PublicKey = (&secret).into();
    Ok(Keypair { secret, public })
}


