import axios, { AxiosError } from "axios";
import { BACKEND_URL } from "@/constants";

export interface SealPolicy {
  policyId: string;
  allowedAddresses: string[];
  expiryTimestamp: number;
}

/**
 * Generate/derive a Seal policy id for a set of allowed addresses until an expiry timestamp.
 * - Attempts to call a backend endpoint if available (future-proof)
 * - Falls back to a deterministic mock policy id for development
 *
 * TODO: Replace with real Seal SDK integration when publicly available:
 *  - Use Seal IBE policy construction
 *  - Create and manage policy objects server-side
 *  - Bind decryption capabilities to enclave attestations / wallet addresses
 */
export async function generateSealPolicy(
  allowedAddresses: string[],
  expiryTimestamp: number
): Promise<SealPolicy> {
  const normalized = [...new Set(allowedAddresses.map((a) => a.toLowerCase()))].sort();

  // Best-effort backend call (not required; mocked in dev)
  try {
    const url = `${BACKEND_URL}/api/policy/derive`;
    const { data } = await axios.post(
      url,
      { allowedAddresses: normalized, expiryTimestamp },
      { timeout: 10_000 }
    );
    const policyId: string = String(data?.policyId || data?.policy_id || "");
    if (policyId) {
      return { policyId, allowedAddresses: normalized, expiryTimestamp };
    }
  } catch (e) {
    // Ignore if endpoint doesn't exist or errors; fallback to mock
    const err = e as AxiosError;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[seal-client] backend policy derive skipped:", err.message);
    }
  }

  // Mock/deterministic policy id for development
  const policyId = await deriveMockPolicyId(normalized, expiryTimestamp);
  return { policyId, allowedAddresses: normalized, expiryTimestamp };
}

async function deriveMockPolicyId(allowed: string[], expiry: number): Promise<string> {
  const payload = JSON.stringify({ allowed, expiry });

  // Prefer Web Crypto API when available (browser)
  const subtle = (globalThis.crypto && "subtle" in globalThis.crypto && globalThis.crypto.subtle) || undefined;
  if (subtle) {
    const enc = new TextEncoder();
    const buf = enc.encode(payload);
    const digest = await subtle.digest("SHA-256", buf);
    return "mock_" + bufferToHex(new Uint8Array(digest));
  }

  // Next.js server (Node) has crypto in runtime; avoid bundling it in browser
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require("crypto") as typeof import("crypto");
    const hash = nodeCrypto.createHash("sha256").update(payload).digest("hex");
    return "mock_" + hash;
  } catch {
    // Pure JS fallback (DJB2) - weak but deterministic
    let h = 5381;
    for (let i = 0; i < payload.length; i++) {
      h = (h * 33) ^ payload.charCodeAt(i);
    }
    // Convert to unsigned hex
    const hex = (h >>> 0).toString(16).padStart(8, "0");
    return "mock_" + hex;
  }
}

function bufferToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export default { generateSealPolicy };



























