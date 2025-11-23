"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQL_CREATE_TABLE_EMAIL_ATTESTATIONS = exports.SQL_CREATE_TABLE_PURCHASES = exports.SQL_CREATE_TABLE_PROOFS = exports.SQL_ALTER_TABLE_DATASETS_ADD_CONTENT_TYPE = exports.SQL_ALTER_TABLE_DATASETS_ADD_ORIGINAL_FILENAME = exports.SQL_CREATE_TABLE_DATASETS = exports.SQL_ENABLE_PGCRYPTO = exports.pool = void 0;
exports.ensureSchema = ensureSchema;
exports.initializeDatabase = initializeDatabase;
exports.createDataset = createDataset;
exports.getDatasetById = getDatasetById;
exports.getAllDatasets = getAllDatasets;
exports.createProof = createProof;
exports.createPurchase = createPurchase;
exports.createEmailAttestation = createEmailAttestation;
exports.getEmailAttestationsForAddress = getEmailAttestationsForAddress;
const pg_1 = require("pg");
// Database pool configuration using either DATABASE_URL or discrete PG* env vars
const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : undefined }
    : {
        host: process.env.PGHOST || "localhost",
        port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "",
        database: process.env.PGDATABASE || "zkdatavault",
    };
exports.pool = new pg_1.Pool(poolConfig);
// SQL schema (PostgreSQL)
exports.SQL_ENABLE_PGCRYPTO = `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`;
exports.SQL_CREATE_TABLE_DATASETS = `
CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  creator TEXT NOT NULL,
  blob_id TEXT NOT NULL UNIQUE,
  seal_policy_id TEXT NOT NULL,
  price BIGINT NOT NULL,
  quality_score INTEGER,
  original_filename TEXT,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_datasets_creator ON datasets(creator);
`;
exports.SQL_ALTER_TABLE_DATASETS_ADD_ORIGINAL_FILENAME = `
ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS original_filename TEXT;
`;
exports.SQL_ALTER_TABLE_DATASETS_ADD_CONTENT_TYPE = `
ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS content_type TEXT;
`;
exports.SQL_CREATE_TABLE_PROOFS = `
CREATE TABLE IF NOT EXISTS proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  proof_json JSONB NOT NULL,
  public_inputs JSONB NOT NULL,
  circuit_type TEXT NOT NULL,
  verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_proofs_dataset ON proofs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_proofs_circuit_type ON proofs(circuit_type);
`;
exports.SQL_CREATE_TABLE_PURCHASES = `
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  buyer_address TEXT NOT NULL,
  transaction_digest TEXT NOT NULL UNIQUE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_dataset ON purchases(dataset_id);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON purchases(buyer_address);
`;
exports.SQL_CREATE_TABLE_EMAIL_ATTESTATIONS = `
CREATE TABLE IF NOT EXISTS email_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  domain TEXT NOT NULL,
  circuit_type TEXT NOT NULL,
  transaction_digest TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_attestations_address ON email_attestations(address);
CREATE INDEX IF NOT EXISTS idx_email_attestations_domain ON email_attestations(domain);
`;
/**
 * Creates required tables if they do not already exist.
 */
async function ensureSchema() {
    const client = await exports.pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(exports.SQL_ENABLE_PGCRYPTO);
        await client.query(exports.SQL_CREATE_TABLE_DATASETS);
        await client.query(exports.SQL_CREATE_TABLE_PROOFS);
        await client.query(exports.SQL_CREATE_TABLE_PURCHASES);
        await client.query(exports.SQL_CREATE_TABLE_EMAIL_ATTESTATIONS);
        // Safe, idempotent column additions for new metadata
        await client.query(exports.SQL_ALTER_TABLE_DATASETS_ADD_ORIGINAL_FILENAME);
        await client.query(exports.SQL_ALTER_TABLE_DATASETS_ADD_CONTENT_TYPE);
        await client.query("COMMIT");
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
// Alias for clarity in app startup
async function initializeDatabase() {
    await ensureSchema();
}
// Mappers
function mapDatasetRow(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        creator: row.creator,
        blob_id: row.blob_id,
        seal_policy_id: row.seal_policy_id,
        price: String(row.price),
        quality_score: row.quality_score !== null ? Number(row.quality_score) : null,
        original_filename: row.original_filename ?? null,
        content_type: row.content_type ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    };
}
function mapProofRow(row) {
    return {
        id: row.id,
        dataset_id: row.dataset_id,
        proof_json: row.proof_json,
        public_inputs: row.public_inputs,
        circuit_type: row.circuit_type,
        verified_at: row.verified_at ? new Date(row.verified_at) : null,
    };
}
function mapPurchaseRow(row) {
    return {
        id: row.id,
        dataset_id: row.dataset_id,
        buyer_address: row.buyer_address,
        transaction_digest: row.transaction_digest,
        purchased_at: new Date(row.purchased_at),
    };
}
function mapEmailAttestationRow(row) {
    return {
        id: row.id,
        address: row.address,
        email_hash: row.email_hash,
        domain: row.domain,
        circuit_type: row.circuit_type,
        transaction_digest: row.transaction_digest,
        created_at: new Date(row.created_at),
    };
}
async function createDataset(input) {
    const q = `
    INSERT INTO datasets (name, description, creator, blob_id, seal_policy_id, price, quality_score, original_filename, content_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;
    const values = [
        input.name,
        input.description,
        input.creator,
        input.blob_id,
        input.seal_policy_id,
        input.price,
        input.quality_score,
        input.original_filename,
        input.content_type,
    ];
    const result = await exports.pool.query(q, values);
    return mapDatasetRow(result.rows[0]);
}
async function getDatasetById(id) {
    const result = await exports.pool.query(`SELECT * FROM datasets WHERE id = $1 LIMIT 1;`, [id]);
    if (result.rowCount === 0)
        return null;
    return mapDatasetRow(result.rows[0]);
}
async function getAllDatasets() {
    const result = await exports.pool.query(`SELECT * FROM datasets ORDER BY created_at DESC;`);
    return result.rows.map(mapDatasetRow);
}
async function createProof(input) {
    const q = `
    INSERT INTO proofs (dataset_id, proof_json, public_inputs, circuit_type, verified_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
    const values = [
        input.dataset_id,
        input.proof_json,
        input.public_inputs,
        input.circuit_type,
        input.verified_at,
    ];
    const result = await exports.pool.query(q, values);
    return mapProofRow(result.rows[0]);
}
async function createPurchase(input) {
    const q = `
    INSERT INTO purchases (dataset_id, buyer_address, transaction_digest, purchased_at)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
    const values = [
        input.dataset_id,
        input.buyer_address,
        input.transaction_digest,
        input.purchased_at,
    ];
    const result = await exports.pool.query(q, values);
    return mapPurchaseRow(result.rows[0]);
}
async function createEmailAttestation(input) {
    const q = `
    INSERT INTO email_attestations (address, email_hash, domain, circuit_type, transaction_digest)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
    const values = [
        input.address.toLowerCase(),
        input.email_hash,
        input.domain.toLowerCase(),
        input.circuit_type,
        input.transaction_digest,
    ];
    const result = await exports.pool.query(q, values);
    return mapEmailAttestationRow(result.rows[0]);
}
async function getEmailAttestationsForAddress(address) {
    const result = await exports.pool.query(`SELECT * FROM email_attestations WHERE lower(address) = $1 ORDER BY created_at DESC;`, [address.toLowerCase()]);
    return result.rows.map(mapEmailAttestationRow);
}
