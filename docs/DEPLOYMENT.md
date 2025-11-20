# zkDataVault - End-to-End Deployment & Testing Guide

This guide wires the full project: Circuits → Contracts → Nautilus TEE → Backend → Frontend. Follow steps in order.

## 0) Prerequisites
- OS: Linux/macOS
- Node.js 20+, npm 10+
- Rust (stable), cargo
- Docker + Docker Compose
- Sui CLI (testnet) and a funded testnet wallet
- Circom 2.1.6 and snarkjs 0.7.x
- Git, curl, jq

Verify versions:
```bash
node -v
npm -v
cargo -V
docker --version
sui --version
circom --version
snarkjs --help | head -n1
```

## 1) Clone and install
```bash
git clone <your_repo_url> zkDataVault
cd zkDataVault
npm install
```

## 2) Environment files
Create env files from examples (edit values as needed).

```bash
cp backend/env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp contracts/.env.example contracts/.env
cp nautilus/.env.example nautilus/.env
```

Key envs:
- Backend `.env`: DATABASE_URL or PG* vars, SUI_NETWORK, PACKAGE_ID/REGISTRIES, WALRUS_* URLs, NAUTILUS_URL.
- Frontend `.env.local`: NEXT_PUBLIC_* variables for backend URL, network and on-chain IDs.
- Contracts `.env`: SUI_NETWORK, SUI_PUBLISHER_ADDRESS, (optional) GAS_BUDGET.
- Nautilus `.env`: NAUTILUS_LISTEN_ADDR, WALRUS_AGGREGATOR_URL, MOCK flags.

## 3) Circuits (ZK)
Build proof circuits and keys.
```bash
cd circuits
chmod +x scripts/setup.sh
./scripts/setup.sh
cd ..
```
Artifacts are under `circuits/build/**`:
- `data_authenticity/{data_authenticity.wasm,data_authenticity_final.zkey,verification_key.json}`
- `quality_proof/{quality_proof.wasm,quality_proof_final.zkey,verification_key.json}`

Sanity test (backend VK export depends on this):
```bash
ls circuits/build/data_authenticity/verification_key.json
ls circuits/build/quality_proof/verification_key.json
```

## 4) Postgres (for backend)
Start local Postgres (Docker):
```bash
docker run -d --name zkdatavault-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zkdatavault \
  -p 5432:5432 postgres:15-alpine
```
Set backend DB env in `backend/.env`:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/zkdatavault
```

## 5) Nautilus TEE (dev/mock)
Nautilus can run standalone and returns `quality_score` with mock attestation in dev.

Edit `nautilus/.env` if needed:
```
NAUTILUS_LISTEN_ADDR=0.0.0.0:3000
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
WALRUS_ALLOW_MOCK=1
```

Run Nautilus locally (host):
```bash
cd nautilus
cargo run
# Or build docker image (optional):
# docker build -t zkdatavault-nautilus .
# docker run --rm -p 3000:3000 --env-file .env zkdatavault-nautilus
```

Health check:
```bash
curl -s http://localhost:3000/health
```

## 6) Deploy Sui Move contracts (testnet)
Requirements: Sui CLI configured for testnet, wallet funded.

Typical steps:
```bash
cd contracts
# Ensure Move.toml uses correct dependencies and testnet framework
sui client active-address
sui client envs
# Build
sui move build
# Publish (note: this will consume gas)
sui client publish --gas-budget 100000000
```

Record outputs:
- PACKAGE_ID
- Any object IDs created (e.g., marketplace shared object, proof registry object, VK object if created via a script/transaction)

If you have a script to create/initialize shared objects (e.g., marketplace, proof registry, store verification key object), run it and record:
- `MARKETPLACE_ID`
- `PROOF_REGISTRY_ID`
- `VK_OBJECT_ID`

Update backend `.env`:
```
SUI_NETWORK=testnet
PACKAGE_ID=0x<package>
MARKETPLACE_ID=0x<marketplace_shared_object>
PROOF_REGISTRY_ID=0x<proof_registry_object>
VK_OBJECT_ID=0x<vk_object>
```

Update frontend `.env.local`:
```
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x<package>
NEXT_PUBLIC_MARKETPLACE_ID=0x<marketplace_shared_object>
NEXT_PUBLIC_PROOF_REGISTRY_ID=0x<proof_registry_object>
NEXT_PUBLIC_VK_OBJECT_ID=0x<vk_object>
```

## 7) Backend
Ensure circuits build dir is set (if running backend from `backend/`):
```
CIRCUITS_BUILD_DIR=../circuits/build
```
Backend env summary (`backend/.env`):
```
PORT=4000
NODE_ENV=development
SUI_NETWORK=testnet
PACKAGE_ID=0x...
MARKETPLACE_ID=0x...
PROOF_REGISTRY_ID=0x...
VK_OBJECT_ID=0x...
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space
NAUTILUS_URL=http://localhost:3000
MIN_QUALITY_THRESHOLD=60
DATABASE_URL=postgres://postgres:postgres@localhost:5432/zkdatavault
```

Run backend:
```bash
cd backend
npm run build
npm run dev
# Health:
curl -s http://localhost:4000/health
```

Test proof endpoints:
```bash
# Generate
curl -s -X POST http://localhost:4000/api/proof/generate \
  -H "Content-Type: application/json" \
  -d '{"datasetHash":"123456","creatorPrivateKey":"987654","creationTimestamp":1700000000}' | jq .

# Prepare on-chain (bytes for Move)
curl -s -X POST http://localhost:4000/api/proof/prepare-onchain \
  -H "Content-Type: application/json" \
  -d '{"proof":"<base64 from generate>","publicInputs":"<base64 from generate>","circuitType":"data_authenticity"}' | jq .
```

## 8) Frontend
Create `frontend/.env.local` (example):
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x...
NEXT_PUBLIC_MARKETPLACE_ID=0x...
NEXT_PUBLIC_PROOF_REGISTRY_ID=0x...
NEXT_PUBLIC_VK_OBJECT_ID=0x...
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
NEXT_PUBLIC_NAUTILUS_URL=http://localhost:3000
```

Install and run:
```bash
cd frontend
npm install
npm run dev
# Open the app
xdg-open http://localhost:3000 || open http://localhost:3000
```

Flows to test:
1) Upload
   - Drop a file (small text) and fill metadata
   - The app uploads (Seal placeholder → Walrus), generates proof, verifies locally, and submits on-chain
   - Expected: transaction digest shown
2) Marketplace
   - Refresh; dataset appears with quality badge and price
   - (Purchase is wired as placeholder Move call; adjust target and args once marketplace.move is known)
3) Dashboard
   - Connect wallet; see your datasets

## 9) Troubleshooting
- Circuits:
  - Ensure `circuits/build/**` contains wasm, zkey and verification_key.json.
- Backend errors:
  - If DB errors: verify `DATABASE_URL`, Postgres is up; backend logs should show “Database schema ensured”.
  - CORS/network: `NEXT_PUBLIC_BACKEND_URL` matches actual server URL.
- Nautilus:
  - If unavailable, backend upload continues; quality fields may be absent.
- Sui:
  - Ensure testnet wallet has SUI for gas.
  - Update Move function targets and arguments in frontend where noted.

## 10) Production notes
- Set `NODE_ENV=production`, run:
```bash
cd backend && npm run build && node dist/index.js
cd frontend && npm run build && npm run start
```
- Consider Dockerizing all services or using docker-compose for repeatable runs.
- Audit contracts and flows before mainnet.























