# zkDataVault Backend API

Backend REST API for zkDataVault: ZK proof generation/verification, dataset upload (Seal placeholder → Walrus), Nautilus TEE verify, and purchase flow stubs.

## Prerequisites
- Node 20+ and npm 10+
- Circuits built (for proof routes): run circuits setup so `circuits/build/**` exists
- Optional: Docker (to run local PostgreSQL)
- Optional: Nautilus TEE (for real quality verification) or mock it

## One-time Setup
1) Env file

```bash
cd backend
cp env.example .env
# Edit .env if needed (DB, NAUTILUS_URL, WALRUS_*, MARKETPLACE_ID, etc.)
```

2) Install deps (from repo root or backend)

```bash
npm install
```

3) PostgreSQL (dev, via Docker)

```bash
docker run -d --name zkdatavault-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zkdatavault \
  -p 5432:5432 postgres:15-alpine
```

4) Build circuits (if not already)

```bash
# From repo root; ensure this script produced circuits/build/<circuit>/*
# If you have different script names, run your existing setup that produced build artifacts.
cd circuits && ./scripts/setup.sh
```

## Start Backend (dev)

```bash
# From repo root or backend/
export PORT=4000
export NODE_ENV=development
export CIRCUITS_BUILD_DIR=../circuits/build
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/zkdatavault
export WALRUS_ALLOW_MOCK=1        # optional, mock Walrus HTTP
export NAUTILUS_URL=http://localhost:3000  # or enclave endpoint

npm run dev --workspace=backend
# or
cd backend && npm run dev
```

You should see:
- "✅ Database schema ensured"
- "Backend API listening on http://localhost:4000"

## Smoke Tests

1) Health

```bash
curl -s http://localhost:4000/health
```

2) Export VK (verification key)

```bash
curl -s http://localhost:4000/api/proof/export-vk/authenticity | head -c 200
curl -s http://localhost:4000/api/proof/export-vk/quality | head -c 200
```

3) Generate and verify authenticity proof

```bash
# Generate
GEN=$(curl -s -X POST http://localhost:4000/api/proof/generate \
  -H "Content-Type: application/json" \
  -d '{"datasetHash":"123456","creatorPrivateKey":"987654","creationTimestamp":1700000000}')
echo "$GEN" | jq -r '.proof,.publicInputs' >/dev/null

# Verify
PROOF=$(echo "$GEN" | jq -r .proof)
PUB=$(echo "$GEN" | jq -r .publicInputs)
curl -s -X POST http://localhost:4000/api/proof/verify \
  -H "Content-Type: application/json" \
  -d "{\"proof\":\"$PROOF\",\"publicInputs\":\"$PUB\",\"circuitType\":\"data_authenticity\"}"
```

4) Prepare on-chain bytes for Sui Move

```bash
curl -s -X POST http://localhost:4000/api/proof/prepare-onchain \
  -H "Content-Type: application/json" \
  -d "{\"proof\":\"$PROOF\",\"publicInputs\":\"$PUB\",\"circuitType\":\"data_authenticity\"}" | jq .
```

5) Upload dataset (Seal placeholder → Walrus), persists in DB

```bash
DATA_B64=$(echo -n 'hello world' | base64)
curl -s -X POST http://localhost:4000/api/upload/dataset \
  -H "Content-Type: application/json" \
  -H "x-creator-address: 0xCREATOR" \
  -d "{\"file\":\"$DATA_B64\",\"metadata\":{\"name\":\"demo\",\"description\":\"test\",\"price\":\"1000\"}}"
```

Response includes: `dataset_id`, `blob_id`, `seal_policy_id`. If `NAUTILUS_URL` is reachable, also `{ quality_score, is_valid, attestation, timestamp_ms }`.

6) Nautilus TEE verify (through backend)

```bash
# If you have a blob_id from upload step
BLOB_ID="<your_blob_id>"
curl -s -X POST http://localhost:4000/api/nautilus/verify \
  -H "Content-Type: application/json" \
  -d "{\"blobId\":\"$BLOB_ID\",\"minQualityThreshold\":60}"
```

7) Purchase flow (stubs)

```bash
# Prepare (requires MARKETPLACE_ID set in env and move contracts returning datasets via dynamic fields)
curl -s -X POST http://localhost:4000/api/purchase/prepare \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"<on_chain_dataset_id>","buyerAddress":"0xBUYER"}'

# Confirm (verifies tx digest via Sui fullnode; optionally records purchase if backendDatasetId (UUID) is provided)
curl -s -X POST http://localhost:4000/api/purchase/confirm \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"<on_chain_dataset_id>","transactionDigest":"<digest>","buyerAddress":"0xBUYER","backendDatasetId":"<uuid-from-upload>"}'

# Check access (dev in-memory grant)
curl -s "http://localhost:4000/api/purchase/access/<on_chain_dataset_id>?buyer=0xBUYER"
```

## Environment Variables
See `.env.example` for full list. Common:
- PORT: default 4000
- SUI_NETWORK: localnet | devnet | testnet | mainnet (default testnet)
- MARKETPLACE_ID: On-chain marketplace shared object id
- WALRUS_AGGREGATOR_URL / WALRUS_PUBLISHER_URL (or WALRUS_AGGREGATOR / WALRUS_PUBLISHER)
- WALRUS_ALLOW_MOCK=1 for local dev without real Walrus
- CIRCUITS_BUILD_DIR: e.g., `../circuits/build`
- DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGSSL
- NAUTILUS_URL: e.g., `http://localhost:3000`
- MIN_QUALITY_THRESHOLD: default 60

## Troubleshooting
- Proof generation fails: ensure circuits build artifacts exist under `CIRCUITS_BUILD_DIR/<circuit>/{*.wasm, *_final.zkey, verification_key.json}`
- VK export 404: verify `verification_key.json` is present in circuit build dir
- DB errors: confirm Postgres is running and env matches; server logs "✅ Database schema ensured" on startup
- Walrus errors: set `WALRUS_ALLOW_MOCK=1` for local testing, or verify aggregator/publisher URLs
- Nautilus verify fails: check `NAUTILUS_URL`, or skip (upload still succeeds without TEE)

## Notes
- Seal integration is a placeholder; replace with the official Seal SDK when available.
- Sui queries are best-effort; for production use on-chain registries or an indexer.

