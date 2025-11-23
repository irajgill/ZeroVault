"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptWithSeal = encryptWithSeal;
exports.getSealPolicyId = getSealPolicyId;
exports.wrapKeyForRecipient = wrapKeyForRecipient;
const crypto_1 = __importDefault(require("crypto"));
const tweetnacl_1 = __importDefault(require("tweetnacl"));
// Derive a stable 32-byte dataset key from policy id using HMAC(SHA256)
function deriveDatasetKey(policyId) {
    const master = (process.env.SEAL_MASTER_SECRET || "zkdatavault-dev-master").normalize();
    const h = crypto_1.default.createHmac("sha256", Buffer.from(master, "utf8"));
    h.update(Buffer.from(policyId, "utf8"));
    const digest = h.digest(); // 32 bytes
    return digest;
}
/**
 * Envelope encryption using NaCl secretbox (XSalsa20-Poly1305).
 * - Dataset key derived deterministically from policyId (server-side secret).
 * - Random 24-byte nonce; upload 'combined' bytes: nonce || ciphertext.
 */
async function encryptWithSeal(data, policyId) {
    const key = deriveDatasetKey(policyId);
    const nonce = crypto_1.default.randomBytes(24);
    const boxed = tweetnacl_1.default.secretbox(new Uint8Array(data), new Uint8Array(nonce), new Uint8Array(key));
    const ciphertext = Buffer.from(boxed);
    const combined = Buffer.concat([nonce, ciphertext]);
    const keyFingerprint = sha256Hex(Buffer.from(key));
    const metadata = {
        policyId,
        algorithm: "XSALSA20-POLY1305",
        keyFingerprint,
        nonce_b64: nonce.toString("base64")
    };
    return { combined, ciphertext, nonce, metadata };
}
/**
 * Deterministically derive a policy id from inputs (dev + server-side derivation).
 */
async function getSealPolicyId(allowedAddresses, expiryTimestamp) {
    const normalized = [...allowedAddresses].map((a) => a.toLowerCase()).sort();
    const input = JSON.stringify({ allowed: normalized, exp: expiryTimestamp });
    return sha256Hex(Buffer.from(input, "utf8"));
}
/**
 * Re-wrap dataset key for a recipient (X25519 box).
 * Returns server public key, nonce, and box of the dataset key.
 */
async function wrapKeyForRecipient(policyId, recipientPublicKeyB64) {
    const datasetKey = deriveDatasetKey(policyId);
    const serverSeed = crypto_1.default.createHash("sha256").update(process.env.SEAL_SERVER_SEED || "zkdatavault-seal-server").digest();
    // tweetnacl does not expose box.keyPair.fromSeed; instead, derive a deterministic
    // X25519 keypair from the seed by treating it as the secret key directly.
    const serverSecretKey = new Uint8Array(serverSeed);
    const serverKp = tweetnacl_1.default.box.keyPair.fromSecretKey(serverSecretKey);
    const recipientPk = Buffer.from(recipientPublicKeyB64, "base64");
    if (recipientPk.length !== 32) {
        throw new Error("Invalid recipient public key");
    }
    const nonce = crypto_1.default.randomBytes(24);
    const boxed = tweetnacl_1.default.box(new Uint8Array(datasetKey), new Uint8Array(nonce), new Uint8Array(recipientPk), serverKp.secretKey);
    return {
        serverPublicKeyB64: Buffer.from(serverKp.publicKey).toString("base64"),
        nonceB64: nonce.toString("base64"),
        boxB64: Buffer.from(boxed).toString("base64"),
        algorithm: "X25519-XSalsa20-Poly1305",
    };
}
function sha256Hex(buf) {
    return crypto_1.default.createHash("sha256").update(buf).digest("hex");
}
exports.default = {
    encryptWithSeal,
    getSealPolicyId,
    wrapKeyForRecipient
};
