import axios, { AxiosError } from "axios";
import { BACKEND_URL, WALRUS_URLS } from "@/constants";
import type { Dataset } from "@/types";

export interface UploadResult {
  dataset_id?: string;
  blob_id: string;
  seal_policy_id: string;
  upload_size: number;
  metadata?: unknown;
  quality_score?: number;
  is_valid?: boolean;
  attestation?: string;
  timestamp_ms?: number;
}

/**
 * Upload a file to the backend which encrypts (Seal placeholder) and stores in Walrus.
 * Backend endpoint: POST /api/upload/dataset
 */
export async function uploadToWalrus(file: File): Promise<UploadResult> {
  try {
    // Read file as base64 (without data URL prefix)
    const arrayBuffer = await file.arrayBuffer();
    const base64 = bufferToBase64(new Uint8Array(arrayBuffer));

    const body = {
      file: base64,
      originalFilename: file.name,
      contentType: file.type || "application/octet-stream",
      metadata: {
        name: file.name || "dataset",
        description: `Uploaded via ZeroVault (${new Date().toISOString()})`,
        price: "0", // default 0 for client-side helper; real price set in listing flow
      },
    };

    const url = `${BACKEND_URL}/api/upload/dataset`;
    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    });

    // Backend returns: { dataset_id?, blob_id, seal_policy_id, upload_size, metadata, quality_* }
    const data = resp.data || {};
    if (!data.blob_id) throw new Error("Upload did not return blob_id");

    const result: UploadResult = {
      dataset_id: data.dataset_id,
      blob_id: data.blob_id,
      seal_policy_id: data.seal_policy_id,
      upload_size: Number(data.upload_size || 0),
      metadata: data.metadata,
      quality_score: typeof data.quality_score === "number" ? data.quality_score : undefined,
      is_valid: typeof data.is_valid === "boolean" ? data.is_valid : undefined,
      attestation: typeof data.attestation === "string" ? data.attestation : undefined,
      timestamp_ms: typeof data.timestamp_ms === "number" ? data.timestamp_ms : undefined,
    };

    return result;
  } catch (err) {
    throw wrapAxiosError(err, "Failed to upload dataset to Walrus via backend");
  }
}

/**
 * Download a Walrus blob from the aggregator.
 * Returns a Blob with best-effort content type.
 */
export async function downloadFromWalrus(blobId: string): Promise<Blob> {
  try {
    const url = getBlobUrl(blobId);
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 60_000,
    });
    const contentType = resp.headers["content-type"] || "application/octet-stream";
    return new Blob([resp.data], { type: contentType });
  } catch (err) {
    throw wrapAxiosError(err, `Failed to download Walrus blob ${blobId}`);
  }
}

/**
 * Return the public URL to a Walrus blob on the aggregator.
 */
export function getBlobUrl(blobId: string): string {
  // Walrus testnet aggregator exposes blobs under /v1/blobs/{blob_id}
  return `${WALRUS_URLS.aggregator}/v1/blobs/${encodeURIComponent(blobId)}`;
}

/**
 * Check if a Walrus blob exists using HEAD; falls back to GET if HEAD not supported.
 */
export async function checkBlobExists(blobId: string): Promise<boolean> {
  const url = getBlobUrl(blobId);
  try {
    await axios.head(url, { timeout: 10_000 });
    return true;
  } catch (e) {
    const err = e as AxiosError;
    // Some servers may not support HEAD; fall back to GET
    if (err.response && err.response.status === 405) {
      try {
        await axios.get(url, { timeout: 10_000 });
        return true;
      } catch {
        return false;
      }
    }
    if (err.response && err.response.status === 404) return false;
    // On network errors, report false
    return false;
  }
}

// Helpers
function bufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function wrapAxiosError(err: unknown, prefix: string): Error {
  if (axios.isAxiosError(err)) {
    const code = err.code ? ` (${err.code})` : "";
    const status = err.response?.status ? ` [HTTP ${err.response.status}]` : "";
    const msg = err.message || "unknown axios error";
    return new Error(`${prefix}: ${msg}${code}${status}`);
  }
  return new Error(`${prefix}: ${(err as Error)?.message || String(err)}`);
}

export default {
  uploadToWalrus,
  downloadFromWalrus,
  getBlobUrl,
  checkBlobExists,
};



























