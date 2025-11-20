"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalrusClient = getWalrusClient;
exports.uploadToWalrus = uploadToWalrus;
exports.downloadFromWalrus = downloadFromWalrus;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const DEFAULT_AGGREGATOR = process.env.WALRUS_AGGREGATOR || "https://aggregator.walrus-testnet.walrus.space";
const DEFAULT_PUBLISHER = process.env.WALRUS_PUBLISHER ||
    process.env.WALRUS_AGGREGATOR ||
    "https://aggregator.walrus-testnet.walrus.space";
function trimTrailingSlash(url) {
    return url.replace(/\/+$/, "");
}
function getAxios() {
    return axios_1.default.create({
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60_000
    });
}
/**
 * Best-effort dynamic import of Walrus SDK if available.
 * Falls back to HTTP if the package is not installed.
 */
async function getWalrusClient() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = await Promise.resolve().then(() => __importStar(require("@mysten/walrus"))).catch(() => null);
        if (!mod) {
            console.log("[Walrus] SDK not found, using HTTP fallback.");
            return null;
        }
        // The SDK API may differ; keep as unknown and prefer HTTP paths in this codebase for now.
        console.log("[Walrus] SDK detected, but HTTP fallback remains primary path for compatibility.");
        return mod;
    }
    catch {
        console.log("[Walrus] SDK import failed, using HTTP fallback.");
        return null;
    }
}
function getEndpoints() {
    const aggregator = trimTrailingSlash(DEFAULT_AGGREGATOR);
    const publisher = trimTrailingSlash(DEFAULT_PUBLISHER);
    return { aggregator, publisher };
}
/**
 * Upload raw bytes to Walrus.
 * Returns blob_id (string).
 */
async function uploadToWalrus(data) {
    const allowMock = (process.env.WALRUS_ALLOW_MOCK || "").toLowerCase() === "true" || process.env.WALRUS_ALLOW_MOCK === "1";
    const { publisher } = getEndpoints();
    // Mock path for local dev if publisher is unavailable
    if (allowMock) {
        const id = sha256Hex(data);
        console.log(`[Walrus] WALRUS_ALLOW_MOCK=1 → mock upload, blob_id=${id} (size=${data.length} bytes)`);
        return id;
    }
    // Prefer HTTP API for compatibility
    const http = getAxios();
    // Common Walrus publisher endpoints seen in the wild are /v1/store or /v1.
    // Try /v1/store first; fall back to /v1 if needed.
    const candidates = [`${publisher}/v1/store`, `${publisher}/v1`];
    let lastErr = null;
    for (const url of candidates) {
        try {
            console.log(`[Walrus] Uploading to ${url} ...`);
            const resp = await http.post(url, data, {
                headers: { "Content-Type": "application/octet-stream" },
                onUploadProgress: (e) => {
                    if (e.total) {
                        const pct = ((e.loaded / e.total) * 100).toFixed(1);
                        console.log(`[Walrus] Upload progress: ${pct}% (${e.loaded}/${e.total})`);
                    }
                    else {
                        console.log(`[Walrus] Upload progress: ${e.loaded} bytes`);
                    }
                }
            });
            // Accept multiple possible response shapes
            const blobId = extractBlobId(resp.data);
            if (!blobId) {
                throw new Error("Upload response missing blob_id");
            }
            console.log(`[Walrus] Upload success: blob_id=${blobId}`);
            return blobId;
        }
        catch (err) {
            lastErr = err;
            console.log(`[Walrus] Upload failed at ${url}: ${err.message}`);
        }
    }
    throw new Error(`Walrus upload failed: ${lastErr?.message || "unknown error"}`);
}
/**
 * Download raw bytes from Walrus by blob id.
 */
async function downloadFromWalrus(blobId) {
    const allowMock = (process.env.WALRUS_ALLOW_MOCK || "").toLowerCase() === "true" || process.env.WALRUS_ALLOW_MOCK === "1";
    const { aggregator } = getEndpoints();
    if (allowMock && (blobId.startsWith("test_") || blobId.length === 64)) {
        // Generate deterministic bytes from blobId for local testing
        const seed = Buffer.from(blobId, "utf8");
        const synthetic = expandDeterministic(seed, 32 * 1024);
        console.log(`[Walrus] WALRUS_ALLOW_MOCK=1 → mock download, size=${synthetic.length} bytes`);
        return synthetic;
    }
    const url = `${aggregator}/v1/${encodeURIComponent(blobId)}`;
    console.log(`[Walrus] Downloading from ${url} ...`);
    try {
        const http = getAxios();
        const resp = await http.get(url, {
            responseType: "arraybuffer",
            onDownloadProgress: (e) => {
                if (e.total) {
                    const pct = ((e.loaded / e.total) * 100).toFixed(1);
                    console.log(`[Walrus] Download progress: ${pct}% (${e.loaded}/${e.total})`);
                }
                else {
                    console.log(`[Walrus] Download progress: ${e.loaded} bytes`);
                }
            }
        });
        const buf = Buffer.from(resp.data);
        console.log(`[Walrus] Download success: ${buf.length} bytes`);
        return buf;
    }
    catch (err) {
        console.log(`[Walrus] Download failed: ${err.message}`);
        throw new Error(`Failed to download Walrus blob ${blobId}: ${err.message}`);
    }
}
function extractBlobId(data) {
    // Accept a few shapes: { blob_id }, { id }, { blobId }, raw string
    if (typeof data === "string")
        return data;
    if (data && typeof data === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyData = data;
        return anyData.blob_id || anyData.blobId || anyData.id || null;
    }
    return null;
}
function sha256Hex(input) {
    return crypto_1.default.createHash("sha256").update(input).digest("hex");
}
function expandDeterministic(seed, size) {
    // Simple PRG using repeated sha256 to fill 'size' bytes deterministically
    const out = Buffer.allocUnsafe(size);
    let offset = 0;
    let counter = 0;
    while (offset < size) {
        const h = crypto_1.default.createHash("sha256");
        h.update(seed);
        h.update(Buffer.from([counter & 0xff]));
        const chunk = h.digest();
        const toCopy = Math.min(chunk.length, size - offset);
        chunk.copy(out, offset, 0, toCopy);
        offset += toCopy;
        counter++;
    }
    return out;
}
exports.default = {
    getWalrusClient,
    uploadToWalrus,
    downloadFromWalrus
};
