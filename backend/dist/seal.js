"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptWithSeal = encryptWithSeal;
exports.getSealPolicyId = getSealPolicyId;
const crypto_1 = __importDefault(require("crypto"));
/**
 * TODO: Replace with actual Seal SDK when available.
 * Placeholder encryption using AES-256-CBC.
 *
 * - Generates a random 32-byte key and 16-byte IV
 * - Returns encrypted data and non-sensitive metadata (no key returned)
 * - Key handling: In real Seal integration, keys are derived and split via IBE policies.
 */
async function encryptWithSeal(data, policyId) {
    // 32-byte key for AES-256, 16-byte IV for CBC
    const key = crypto_1.default.randomBytes(32);
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const keyFingerprint = sha256Hex(key);
    const metadata = {
        policyId,
        algorithm: "AES-256-CBC",
        keyFingerprint,
        iv: iv.toString("base64")
    };
    // NOTE: We intentionally do NOT return the key.
    // In production, manage key material via Seal KMS/SDK and enclave-bound derivation.
    return { encryptedData: encrypted, metadata };
}
/**
 * TODO: Replace with actual Seal SDK when available.
 * Deterministically derive a policy id from inputs for development.
 */
async function getSealPolicyId(allowedAddresses, expiryTimestamp) {
    const normalized = [...allowedAddresses].map((a) => a.toLowerCase()).sort();
    const input = JSON.stringify({ allowed: normalized, exp: expiryTimestamp });
    return sha256Hex(Buffer.from(input, "utf8"));
}
function sha256Hex(buf) {
    return crypto_1.default.createHash("sha256").update(buf).digest("hex");
}
exports.default = {
    encryptWithSeal,
    getSealPolicyId
};
