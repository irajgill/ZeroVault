"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const seal_1 = require("../seal");
const walrus_1 = require("../walrus");
const models_1 = require("../database/models");
const errorHandler_1 = require("../middleware/errorHandler");
const router = express_1.default.Router();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
router.post("/dataset", asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body?.file || !body?.metadata) {
        throw new errorHandler_1.ValidationError("Missing file or metadata");
    }
    const base64 = normalizeBase64(body.file);
    if (!base64)
        throw new errorHandler_1.ValidationError("Invalid base64");
    const plaintext = Buffer.from(base64, "base64");
    // Build a temporary policy for dev; real Seal will define policies off-chain
    const expiry = typeof body.expiryTimestamp === "number" ? body.expiryTimestamp : Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const policyId = await (0, seal_1.getSealPolicyId)(body.allowedAddresses || [], expiry);
    // Encrypt with Seal envelope (XSalsa20-Poly1305, nonce||ciphertext)
    const { combined, metadata } = await (0, seal_1.encryptWithSeal)(plaintext, policyId);
    // Upload encrypted bytes to Walrus
    const blob_id = await (0, walrus_1.uploadToWalrus)(combined);
    // Verify the blob is retrievable (lightweight HEAD-equivalent by GET length)
    let stored_size = 0;
    try {
        const buf = await (0, walrus_1.downloadFromWalrus)(blob_id);
        stored_size = buf.length;
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[upload] Walrus post-upload check failed:", e.message);
    }
    // Optional: Call Nautilus for quality verification
    let quality = {};
    try {
        const NAUTILUS_URL = process.env.NAUTILUS_URL || "http://localhost:3000";
        const min_quality_threshold = Number(process.env.MIN_QUALITY_THRESHOLD || 0);
        const resp = await axios_1.default.post(`${NAUTILUS_URL}/verify`, {
            blob_id,
            min_quality_threshold
        }, { timeout: 30000 });
        quality = {
            quality_score: Number(resp.data?.quality_score ?? 0),
            is_valid: Boolean(resp.data?.is_valid ?? false),
            attestation: String(resp.data?.attestation ?? ""),
            timestamp_ms: Number(resp.data?.timestamp_ms ?? 0)
        };
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.log("[upload] Nautilus verify skipped/failed:", e.message);
    }
    // Persist dataset in DB
    const creatorHeader = (req.header("x-creator-address") || "").toLowerCase();
    const creator = body.metadata.creator?.toLowerCase() || creatorHeader || "unknown";
    const originalFilename = body.originalFilename || "";
    const contentType = body.contentType || "";
    const dataset = await (0, models_1.createDataset)({
        name: body.metadata.name,
        description: body.metadata.description,
        creator,
        blob_id,
        seal_policy_id: policyId,
        price: String(body.metadata.price),
        quality_score: typeof quality.quality_score === "number" ? quality.quality_score : null,
        original_filename: originalFilename || null,
        content_type: contentType || null,
    });
    return res.json({
        dataset_id: dataset.id,
        blob_id,
        seal_policy_id: policyId,
        upload_size: combined.length,
        stored_size,
        metadata,
        ...quality
    });
}));
router.get("/status/:blobId", asyncHandler(async (req, res) => {
    const { blobId } = req.params;
    if (!blobId)
        throw new errorHandler_1.ValidationError("Missing blobId");
    const buf = await (0, walrus_1.downloadFromWalrus)(blobId);
    return res.json({ exists: true, size: buf.length });
}));
function normalizeBase64(input) {
    // Strip data URL prefix if present
    const match = input.match(/^data:.*;base64,(.*)$/);
    return match ? match[1] : input;
}
exports.default = router;
