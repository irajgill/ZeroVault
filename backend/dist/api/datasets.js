"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const models_1 = require("../database/models");
const walrus_1 = require("../walrus");
const seal_1 = require("../seal");
const errorHandler_1 = require("../middleware/errorHandler");
const router = express_1.default.Router();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
// GET /api/datasets
router.get("/", asyncHandler(async (_req, res) => {
    const items = await (0, models_1.getAllDatasets)();
    return res.json(items);
}));
// GET /api/datasets/:id
router.get("/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id)
        throw new errorHandler_1.ValidationError("id is required");
    const item = await (0, models_1.getDatasetById)(id);
    if (!item)
        return res.status(404).json({ error: "Dataset not found" });
    return res.json(item);
}));
// GET /api/datasets/user/:address
router.get("/user/:address", asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!address)
        throw new errorHandler_1.ValidationError("address is required");
    const addr = address.toLowerCase();
    const result = await models_1.pool.query(`SELECT * FROM datasets WHERE lower(creator) = $1 ORDER BY created_at DESC;`, [addr]);
    return res.json(result.rows || []);
}));
// POST /api/datasets/secure-download/:id
// Returns encrypted bytes (nonce||ciphertext) from Walrus and a Seal-wrapped dataset key
// for the provided recipient public key. In production you should ensure that the caller
// is authorized to access the dataset (e.g. by verifying a prior purchase).
router.post("/secure-download/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id)
        throw new errorHandler_1.ValidationError("id is required");
    const recipientPublicKeyB64 = req.body?.recipientPublicKeyB64 || "";
    if (!recipientPublicKeyB64) {
        throw new errorHandler_1.ValidationError("recipientPublicKeyB64 is required (base64 32 bytes)");
    }
    const ds = await (0, models_1.getDatasetById)(id);
    if (!ds)
        return res.status(404).json({ error: "Dataset not found" });
    // Fetch encrypted bytes (nonce||ciphertext)
    const buf = await (0, walrus_1.downloadFromWalrus)(ds.blob_id);
    if (buf.length < 24) {
        throw new errorHandler_1.ValidationError("Stored blob too small");
    }
    const nonce = buf.subarray(0, 24);
    const ciphertext = buf.subarray(24);
    // Wrap dataset key for recipient
    const wrapped = await (0, seal_1.wrapKeyForRecipient)(ds.seal_policy_id, recipientPublicKeyB64);
    return res.json({
        blob_id: ds.blob_id,
        original_filename: ds.original_filename || null,
        content_type: ds.content_type || null,
        nonce_b64: Buffer.from(nonce).toString("base64"),
        ciphertext_b64: Buffer.from(ciphertext).toString("base64"),
        wrapped_key: wrapped,
        algorithm: "XSALSA20-POLY1305",
    });
}));
exports.default = router;
