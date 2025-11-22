import { Pool, PoolConfig, QueryResult } from "pg";

// Database pool configuration using either DATABASE_URL or discrete PG* env vars
const poolConfig: PoolConfig =
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : undefined }
    : {
        host: process.env.PGHOST || "localhost",
        port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "",
        database: process.env.PGDATABASE || "zkdatavault",
      };

export const pool = new Pool(poolConfig);

// Interfaces
export interface Dataset {
  id: string;
  name: string;
  description: string;
  creator: string;
  blob_id: string;
  seal_policy_id: string;
  // Use string for atomic price units to avoid JS number precision issues
  price: string;
  quality_score: number | null;
  original_filename: string | null;
  content_type: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Proof {
  id: string;
  dataset_id: string;
  proof_json: unknown; // stored as JSONB
  public_inputs: unknown; // stored as JSONB
  circuit_type: "authenticity" | "quality" | string;
  verified_at: Date | null;
}

export interface Purchase {
  id: string;
  dataset_id: string;
  buyer_address: string;
  transaction_digest: string;
  purchased_at: Date;
}

export interface EmailAttestation {
  id: string;
  address: string;
  email_hash: string;
  domain: string;
  circuit_type: string;
  transaction_digest: string;
  created_at: Date;
}

// SQL schema (PostgreSQL)
export const SQL_ENABLE_PGCRYPTO = `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`;

export const SQL_CREATE_TABLE_DATASETS = `
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

export const SQL_ALTER_TABLE_DATASETS_ADD_ORIGINAL_FILENAME = `
ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS original_filename TEXT;
`;

export const SQL_ALTER_TABLE_DATASETS_ADD_CONTENT_TYPE = `
ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS content_type TEXT;
`;

export const SQL_CREATE_TABLE_PROOFS = `
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

export const SQL_CREATE_TABLE_PURCHASES = `
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

export const SQL_CREATE_TABLE_EMAIL_ATTESTATIONS = `
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
export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(SQL_ENABLE_PGCRYPTO);
    await client.query(SQL_CREATE_TABLE_DATASETS);
    await client.query(SQL_CREATE_TABLE_PROOFS);
    await client.query(SQL_CREATE_TABLE_PURCHASES);
    await client.query(SQL_CREATE_TABLE_EMAIL_ATTESTATIONS);
    // Safe, idempotent column additions for new metadata
    await client.query(SQL_ALTER_TABLE_DATASETS_ADD_ORIGINAL_FILENAME);
    await client.query(SQL_ALTER_TABLE_DATASETS_ADD_CONTENT_TYPE);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Alias for clarity in app startup
export async function initializeDatabase(): Promise<void> {
  await ensureSchema();
}

// Mappers
function mapDatasetRow(row: any): Dataset {
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

function mapProofRow(row: any): Proof {
  return {
    id: row.id,
    dataset_id: row.dataset_id,
    proof_json: row.proof_json,
    public_inputs: row.public_inputs,
    circuit_type: row.circuit_type,
    verified_at: row.verified_at ? new Date(row.verified_at) : null,
  };
}

function mapPurchaseRow(row: any): Purchase {
  return {
    id: row.id,
    dataset_id: row.dataset_id,
    buyer_address: row.buyer_address,
    transaction_digest: row.transaction_digest,
    purchased_at: new Date(row.purchased_at),
  };
}

function mapEmailAttestationRow(row: any): EmailAttestation {
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

// CRUD operations

export type CreateDatasetInput = Omit<Dataset, "id" | "created_at" | "updated_at">;

export async function createDataset(input: CreateDatasetInput): Promise<Dataset> {
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
  const result: QueryResult = await pool.query(q, values);
  return mapDatasetRow(result.rows[0]);
}

export async function getDatasetById(id: string): Promise<Dataset | null> {
  const result = await pool.query(`SELECT * FROM datasets WHERE id = $1 LIMIT 1;`, [id]);
  if (result.rowCount === 0) return null;
  return mapDatasetRow(result.rows[0]);
}

export async function getAllDatasets(): Promise<Dataset[]> {
  const result = await pool.query(`SELECT * FROM datasets ORDER BY created_at DESC;`);
  return result.rows.map(mapDatasetRow);
}

export type CreateProofInput = Omit<Proof, "id">;

export async function createProof(input: CreateProofInput): Promise<Proof> {
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
  const result = await pool.query(q, values);
  return mapProofRow(result.rows[0]);
}

export type CreatePurchaseInput = Omit<Purchase, "id">;

export async function createPurchase(input: CreatePurchaseInput): Promise<Purchase> {
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
  const result = await pool.query(q, values);
  return mapPurchaseRow(result.rows[0]);
}

export type CreateEmailAttestationInput = Omit<EmailAttestation, "id" | "created_at">;

export async function createEmailAttestation(input: CreateEmailAttestationInput): Promise<EmailAttestation> {
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
  const result = await pool.query(q, values);
  return mapEmailAttestationRow(result.rows[0]);
}

export async function getEmailAttestationsForAddress(address: string): Promise<EmailAttestation[]> {
  const result = await pool.query(
    `SELECT * FROM email_attestations WHERE lower(address) = $1 ORDER BY created_at DESC;`,
    [address.toLowerCase()]
  );
  return result.rows.map(mapEmailAttestationRow);
}


