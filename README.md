## ZeroVault – zk Data Vault & Marketplace on Sui

ZeroVault is a privacy‑first data vault and marketplace built on **Sui**.  
It combines **Walrus** blob storage, **Seal encryption & key wrapping**, **Circom/Groth16 ZK proofs**, and a **Nautilus TEE** quality oracle to let creators sell encrypted datasets while buyers get verifiable quality guarantees – all without ever exposing raw data on‑chain.

---

## Why this is interesting

- **End‑to‑end real stack**:  
  - **On‑chain**: Sui Move package with a `marketplace` module and a `zk_verifier` module for real Groth16 verification.  
  - **Off‑chain crypto**: Circom circuits, snarkjs, and a Rust proof prep tool (`sui-vktool`) that produce proofs and verification keys in Sui’s native format.  
  - **Storage**: Walrus **testnet publisher** for encrypted blobs, **aggregator** for read access, integrated directly in the dApp.
- **Strong privacy story**:  
  - Data is encrypted client‑side and stored only as ciphertext in Walrus.  
  - Access is controlled via **Seal‑style key wrapping** and a secure download path – we can see ciphertext on Walrus and plaintext only after client‑side decryption.
- **Quality & trust**:  
  - A **Nautilus TEE** service fetches encrypted blobs, performs off‑chain quality checks, and returns an attested quality score that is surfaced to the user.  
  - ZK proofs of **data authenticity** are verified on‑chain by the Sui Groth16 verifier, anchoring provenance immutably.
- **Real UX, not a toy**:  
  - Upload any file type (CSV, JSON, images, binaries, archives, …), assign a SUI price, and list on a real marketplace UI.  
  - Buyers pay with real Sui PTBs, see transaction links, and can securely download the purchased encrypted dataset with the original filename and MIME type preserved.
- **Identity & zkEmail (privacy‑preserving creator reputation)**:  
  - Creators can record **zkEmail attestations** that bind a wallet address to a verified email domain without revealing the full email, and those domains are surfaced as “Verified @domain” badges on datasets.


---

## Key user journeys

- **Creator – Upload & prove**
  - Upload any file, name it, set SUI price, and optional creator‑binding secret.  
  - ZeroVault: encrypts → uploads to Walrus → calls Nautilus for quality → generates a ZK authenticity proof → verifies it on‑chain using `zk_verifier` → records a `ProofSubmitted`/`ProofVerified` event → shows a real Sui tx digest and Walrus blob link.
- **Creator – Dashboard & on‑chain listing**
  - See all datasets tied to the connected wallet.  
  - Inspect Walrus blob, Nautilus quality score, and status.  
  - Click **“List on‑chain”** to call the Move `marketplace::list_dataset` entry function; `TransactionStatus` at the top of the page shows PTB progress and explorer links.
- **Buyer – Marketplace & purchase**
  - Browse datasets with search + minimum‑quality filters.  
  - See creator address + **zkEmail verified domain** badge where available.  
  - Click **“Purchase access”** to run `marketplace::purchase_dataset`, then use **“Secure download”** to download a decrypted file with the correct name/extension.
- **Identity – zkEmail attestation**
  - On Dashboard, record a zkEmail‑style attestation by providing an email + Sui tx digest.  
  - Backend validates that the tx belongs to the caller and succeeded, then stores a hashed email + domain.  
  - Datasets created by that address show “Verified @domain”, giving judges a concrete example of **privacy‑preserving identity** integrated with data provenance.

---

## Quick start (local dev)

- **Prerequisites**
  - Node.js ≥ 20, Rust toolchain, Sui CLI (testnet, funded address), Docker or local Postgres.
- **Run everything locally**
  - Follow `docs/GETTING_STARTED.md` for full commands and env samples.  
  - In short:
    - Configure `backend/.env` and `frontend/.env.local` with your Sui package IDs, Walrus URLs, and DB URL.  
    - Start Postgres (Docker), Nautilus (`RUST_LOG=info cargo run --release`), backend (`npm run dev`), and frontend (`npm run dev`).  
    - Open `http://localhost:3000`, connect a Sui testnet wallet, and try the **Upload → Dashboard → Marketplace → Purchase → Secure download** loop.

For a detailed step‑by‑step including **Seal demo scripts** and **real on‑chain ZK tests**, see [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

---

## Repository layout

- **`frontend/`** – Next.js 14 dApp (Upload, Dashboard, Marketplace, zkEmail, TransactionStatus).  
- **`backend/`** – Node + Express API, Walrus/Seal/Nautilus integration, Postgres models, zkEmail and proof endpoints.  
- **`contracts/`** – Move modules for `zk_verifier`, `marketplace`, and tests.  
- **`circuits/`** – Circom circuits, Groth16 artifacts for data authenticity (and future circuits like email attestation).  
- **`nautilus/`** – Rust TEE‑like service for Walrus blob verification and quality scoring (with Dockerfile for containerized deployment).  
- **`sui-vktool/`** – Rust toolchain for converting snarkjs artifacts into Sui‑ready verification keys and proofs.  
- **`docs/`** – Detailed getting‑started and demo scripts.

ZeroVault is built to show **real cryptography, real infrastructure, and real UX** working together: encrypted Walrus blobs, Seal key wrapping, Nautilus attestation, zkEmail identity, and on‑chain Groth16 proofs, all wrapped in a polished dApp that user can click through in minutes.


