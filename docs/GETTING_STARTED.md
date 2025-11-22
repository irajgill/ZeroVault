## ZeroVault – Getting Started

ZeroVault is a privacy‑first data vault and marketplace built on **Sui**, using **Circom/Groth16 ZK proofs**, **Walrus** storage, **Seal** encryption and a **Nautilus TEE** for off‑chain quality checks.

This guide shows how to **configure env variables**, **start all services**, and **run end‑to‑end tests** in the same way they have been successfully run before.

---

## 1. Prerequisites

- **Node.js** ≥ 20 and **npm** ≥ 10  
- **Rust** toolchain (for `sui-vktool` and Nautilus)
- **Sui CLI** configured with a funded address on **testnet**
- **Docker** (recommended, for local PostgreSQL)
- **PostgreSQL 15+** (if not using Docker)
- POSIX tools: `bash`, `curl`, `jq`, `xxd`

Clone the repo and install workspace deps:

```bash
cd /home/raj/zkDataVault
npm install
```

---

## 2. Backend environment (`backend/.env`)

Create your backend env file from the example:

```bash
cd /home/raj/zkDataVault/backend
cp env.example .env
```

Then edit `.env` as needed. A typical **local + testnet Walrus + real ZK** setup:

```bash
# Server
PORT=4000
NODE_ENV=development

# Sui network (backend queries fullnode + verifies tx digests)
SUI_NETWORK=testnet

# On-chain contracts (fill after deploying Move package)
PACKAGE_ID=0x<your_package_id>
MARKETPLACE_ID=0x<your_marketplace_shared_object_id>
PROOF_REGISTRY_ID=0x<your_proof_registry_object_id>
VK_OBJECT_ID=0x<your_verification_key_object_id>

# ZK: set 0 for real on-chain verification, 1 to bypass for dev
ZK_FAKE_VALID=0

# Walrus (testnet endpoints)
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space
# Optional explicit upload URL or path if your publisher requires it
WALRUS_PUBLISHER_UPLOAD_URL=https://publisher.walrus-testnet.walrus.space/v1/blobs
WALRUS_PUBLISHER_PATH=

# Allow mock Walrus in pure-local testing (set to 0 when using real Walrus)
WALRUS_ALLOW_MOCK=0

# Nautilus TEE (Rust service below)
NAUTILUS_URL=http://localhost:3000
MIN_QUALITY_THRESHOLD=60
NAUTILUS_ATTEST_PUBKEY=

# PostgreSQL (choose either DATABASE_URL or discrete vars)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/zkdatavault
# Or:
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=zkdatavault
PGSSL=0

# Circuits build directory
CIRCUITS_BUILD_DIR=../circuits/build

# Seal (deterministic keys for dev)
SEAL_MASTER_SECRET=zkdatavault-dev-master
SEAL_SERVER_SEED=zkdatavault-seal-server
```

---

## 3. Frontend environment (`frontend/.env.local`)

Create `frontend/.env.local`:

```bash
cd /home/raj/zkDataVault/frontend
cat > .env.local << 'EOF'
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000

# Sui + wallet
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x<your_package_id>
NEXT_PUBLIC_MARKETPLACE_ID=0x<your_marketplace_shared_object_id>
NEXT_PUBLIC_PROOF_REGISTRY_ID=0x<your_proof_registry_object_id>
NEXT_PUBLIC_VK_OBJECT_ID=0x<your_verification_key_object_id>

# Platform treasury (for marketplace fee routing)
NEXT_PUBLIC_PLATFORM_TREASURY=0x<your_platform_treasury_address>

# Walrus (testnet)
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space

# Nautilus (frontend only needs this for direct calls)
NEXT_PUBLIC_NAUTILUS_URL=http://localhost:3000

# Dev flag: 1 = bypass ZK, 0 = require real on-chain validity
NEXT_PUBLIC_ZK_FAKE_VALID=0
EOF
```

Make sure your Sui wallet (e.g. Sui Wallet extension) is also set to **testnet**.

---

## 4. Nautilus TEE service

The Nautilus service is a Rust HTTP server that:
- Fetches encrypted blobs from Walrus,
- Runs a placeholder decryption + quality check,
- Returns quality score and an Ed25519 attestation.

Run it in a terminal:

```bash
cd /home/raj/zkDataVault/nautilus
RUST_LOG=info cargo run --release
```

It listens on `http://0.0.0.0:3000` and exposes:

- `GET /health` – health check  
- `POST /verify` – internal API used by the backend

Optional: fix its signing key via:

```bash
export NAUTILUS_SIGNING_SEED="zerovault-dev-seed"
```

---

## 5. Circuits + Groth16 artifacts

ZeroVault uses a **Circom Groth16** circuit (`data_authenticity`) plus a Rust helper (`sui-vktool` + `proofprep`) to create verification keys and proofs in Sui’s expected format.

From the repo root:

```bash
cd /home/raj/zkDataVault

# Build circuits and snarkjs artifacts (wasm, zkey, verification_key.json, proof.json, public.json)
npm run build:circuits

# Build Rust vktool + proofprep
cargo build --release --manifest-path sui-vktool/Cargo.toml

# Produce vk.bin from verification_key.json
./sui-vktool/target/release/sui-vktool \
  circuits/build/data_authenticity/verification_key.json \
  circuits/build/data_authenticity/vk.bin

# Produce proof.bin from proof.json using the corrected proofprep
./sui-vktool/target/release/proofprep \
  circuits/build/data_authenticity/proof.json \
  circuits/build/data_authenticity/proof.bin
```

After this, you should have at least:

- `circuits/build/data_authenticity/verification_key.json`
- `circuits/build/data_authenticity/vk.bin`
- `circuits/build/data_authenticity/proof.json`
- `circuits/build/data_authenticity/proof.bin`
- `circuits/build/data_authenticity/public.json`

These are what both the **backend** and the **on-chain ZK verifier** use.

---

## 6. Deploy Move contracts + test real ZK on-chain

There is a helper script `scripts/test-real-zk.sh` that:
- Optionally publishes the Move package (if `PACKAGE_ID` is not set),
- Creates a `ProofRegistry` and `VerificationKey` on-chain,
- Calls `zk_verifier::verify_data_authenticity` with real `proof.bin` + public inputs,
- Asserts `ProofVerified.is_valid == true`.

Run it from the repo root:

```bash
cd /home/raj/zkDataVault
chmod +x scripts/test-real-zk.sh

# Use your active Sui testnet address or set WALLET explicitly
WALLET=$(sui client active-address)
WALLET="$WALLET" ./scripts/test-real-zk.sh
```

On success you will see output similar to:

- `✅ Published package: 0x...` (or “Using existing package” if you set `PACKAGE_ID`)
- `✅ ProofRegistry created: 0x...`
- `✅ VerificationKey created and transferred: 0x...`
- `🎉 Real on-chain Groth16 verification for data_authenticity returned is_valid=true.`

Copy the following IDs into both **backend `.env`** and **frontend `.env.local`**:

- `PACKAGE_ID` → `PACKAGE_ID` (backend) and `NEXT_PUBLIC_PACKAGE_ID` (frontend)
- `REGISTRY_ID` from the script → `PROOF_REGISTRY_ID` (backend) and `NEXT_PUBLIC_PROOF_REGISTRY_ID` (frontend)
- `VK_ID` from the script → `VK_OBJECT_ID` (backend) and `NEXT_PUBLIC_VK_OBJECT_ID` (frontend)

For the **marketplace** shared object id (`MARKETPLACE_ID` / `NEXT_PUBLIC_MARKETPLACE_ID`), use the object id created when you deployed your `marketplace` Move module.

---

## 7. Start all services (local dev, real ZK)

In separate terminals:

1. **PostgreSQL** (Docker):

```bash
docker run -d --name zerovault-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zkdatavault \
  -p 5432:5432 postgres:15-alpine
```

2. **Nautilus**:

```bash
cd /home/raj/zkDataVault/nautilus
RUST_LOG=info cargo run --release
```

3. **Backend API**:

```bash
cd /home/raj/zkDataVault/backend
npm run dev
```

You should see:

- `✅ Database schema ensured`
- `Backend API listening on http://localhost:4000`

4. **Frontend (ZeroVault dApp)**:

```bash
cd /home/raj/zkDataVault/frontend
npm run dev
```

Then open the app in your browser:

```text
http://localhost:3000
```

Connect your Sui wallet (testnet) when prompted.

---

## 8. End‑to‑end testing flows

With all services running and env configured as above:

- **Upload + prove authenticity**
  - Go to `/upload`.
  - Drag‑and‑drop a file, fill in **Name**, **Price (SUI)**, and a short **Description**.
  - (Optional dev input) Provide a “Creator key (dev only)” or leave blank to use the demo default.
  - Click **“Start Upload & Prove”**.
  - The flow:
    - Backend encrypts & stores the dataset in Walrus.
    - Circom + snarkjs generate a Groth16 proof off‑chain.
    - Backend verifies the proof locally and submits it on‑chain.
    - A transaction digest is shown in the UI via `TransactionStatus`.

- **Dashboard**
  - Go to `/dashboard`.
  - You should see datasets **filtered by your connected wallet address**.
  - You can:
    - View Walrus status (via `DatasetCard`),
    - Trigger **secure download** (which uses Seal + Nautilus path),
    - Optionally click **“List on-chain (dev)”** to invoke the Move marketplace listing PTB.

- **Marketplace**
  - Go to `/marketplace`.
  - Use the search + minimum quality filters to browse datasets.
  - Inspect Walrus blobs via the external link on each card.
  - Click **“Purchase”** to execute the on‑chain PTB:
    - The UI builds a PTB using your `PACKAGE_ID`, `MARKETPLACE_ID`, and the derived dataset id.
    - The Sui wallet signs and submits the transaction.
    - `TransactionStatus` shows the digest and status once indexed.

- **Secure download preview**
  - After purchase, the backend grants access for secure download.
  - From `/dashboard`, click **“Download (dev)”** on a purchased dataset:
    - Backend wraps the dataset key with Seal-like logic.
    - Frontend unwraps, decrypts, and shows a **preview of the first 256 bytes**.

If you want a faster demo mode without full on‑chain ZK, set:

- `ZK_FAKE_VALID=1` in `backend/.env`
- `NEXT_PUBLIC_ZK_FAKE_VALID=1` in `frontend/.env.local`

The UI will show a clear **dev-bypass banner**, but the flows remain the same.

---

## 9. Seal encryption demo (for judges)

This sequence lets you convincingly show that **Seal is doing real encryption**, not a stub.

1. **Upload obviously readable plaintext**

   - Create a small file on your machine with a very recognizable string, for example:

     ```text
     HELLO_SEAL_TEST_12345
     ```

   - In the ZeroVault UI go to `/upload`, select this file, and run **Start Upload & Prove** end‑to‑end.

2. **Show that Walrus only stores ciphertext**

   - After upload, go to `/dashboard` or `/marketplace`, find the dataset card, and click **“Download Walrus blob”**.
   - This downloads the raw Walrus blob (`nonce || ciphertext`) as a `.bin` file.
   - In a terminal, run:

     ```bash
     hexdump -C path/to/downloaded-blob.bin | head
     ```

   - Point out to judges that the output is random‑looking bytes; the string `HELLO_SEAL_TEST_12345` does **not** appear anywhere.  
     This proves data at rest on Walrus is encrypted.

3. **Show client‑side decryption via Seal**

   - Still on `/dashboard`, on the same dataset click **“Download (dev)”**.
   - The frontend:
     - Calls `POST /api/datasets/secure-download/:id` to get `nonce || ciphertext` and a **Seal‑wrapped key**,
     - Unwraps the key using the wallet’s X25519 public key,
     - Decrypts on the client and renders a **“Decrypted preview (first 256 bytes)”**.
   - Scroll that preview and show the judges that `HELLO_SEAL_TEST_12345` is now visible.  
     The raw Walrus blob was opaque, but the client‑side Seal path recovers the plaintext.

4. **(Optional stronger proof) Break decryption by changing Seal secrets**

   - Stop the backend and restart it with different Seal secrets:

     ```bash
     cd /home/raj/zkDataVault/backend
     SEAL_MASTER_SECRET=some-other-secret \
     SEAL_SERVER_SEED=some-other-seed \
     PORT=4000 NODE_ENV=development CIRCUITS_BUILD_DIR=../circuits/build \
     DATABASE_URL=postgres://postgres:postgres@localhost:5432/zkdatavault \
     SUI_NETWORK=testnet \
     PACKAGE_ID=0x<your_package_id> \
     MARKETPLACE_ID=0x<your_marketplace_shared_object_id> \
     PROOF_REGISTRY_ID=0x<your_proof_registry_object_id> \
     VK_OBJECT_ID=0x<your_verification_key_object_id> \
     WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space \
     WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space \
     WALRUS_PUBLISHER_UPLOAD_URL=https://publisher.walrus-testnet.walrus.space/v1/blobs \
     WALRUS_ALLOW_MOCK=0 \
     NAUTILUS_URL=http://localhost:3000 \
     ZK_FAKE_VALID=0 \
     npm run dev
     ```

   - Re‑open `/dashboard` and click **“Download (dev)”** for the same dataset as before.
   - Decryption should now **fail** (wrapped key no longer matches the old ciphertext), proving that:
     - The Walrus blob did not change,
     - Access depends on the Seal secrets and key wrapping, not any mock.

Use these four steps as a **live demo script** during the hackathon when judges ask how encryption works.

---

## 10. Quick health checks

With backend running:

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/api/datasets | jq .
```

With Nautilus running:

```bash
curl -s http://localhost:3000/health
```

These commands, plus the UI flows above, mirror the configuration and behavior that have already been verified to work end‑to‑end with **real ZK proofs**, **Walrus**, **Seal**, and **Nautilus** on Sui testnet.



