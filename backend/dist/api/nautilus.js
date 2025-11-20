"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const models_1 = require("../database/models");
const errorHandler_1 = require("../middleware/errorHandler");
const router = express_1.default.Router();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
router.post("/verify", asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body?.blobId) {
        throw new errorHandler_1.ValidationError("Missing blobId");
    }
    const minQuality = typeof body.minQualityThreshold === "number" ? body.minQualityThreshold : Number(process.env.MIN_QUALITY_THRESHOLD || 0);
    const NAUTILUS_URL = process.env.NAUTILUS_URL || "http://nautilus:3000";
    const url = `${NAUTILUS_URL.replace(/\/+$/, "")}/verify`;
    const start = Date.now();
    const resp = await axios_1.default.post(url, {
        blob_id: body.blobId,
        min_quality_threshold: minQuality,
    }, { timeout: 30000 });
    const tookMs = Date.now() - start;
    const qualityScore = Number(resp.data?.quality_score ?? 0);
    const isValid = Boolean(resp.data?.is_valid ?? false);
    const attestation = String(resp.data?.attestation ?? "");
    const timestamp = Number(resp.data?.timestamp_ms ?? Date.now());
    // Cache results in DB: update dataset quality_score by blob_id and insert a proof record
    try {
        const client = await models_1.pool.connect();
        try {
            await client.query("BEGIN");
            const ds = await client.query(`SELECT id FROM datasets WHERE blob_id = $1 LIMIT 1`, [body.blobId]);
            if (ds.rowCount && ds.rows[0]?.id) {
                const datasetId = ds.rows[0].id;
                await client.query(`UPDATE datasets SET quality_score = $1, updated_at = NOW() WHERE id = $2`, [qualityScore, datasetId]);
                await (0, models_1.createProof)({
                    dataset_id: datasetId,
                    proof_json: { attestation, took_ms: tookMs },
                    public_inputs: { blobId: body.blobId, minQualityThreshold: minQuality },
                    circuit_type: "tee_quality",
                    verified_at: new Date(timestamp),
                });
            }
            await client.query("COMMIT");
        }
        catch (e) {
            await client.query("ROLLBACK");
            // eslint-disable-next-line no-console
            console.error("[nautilus] cache save failed:", e.message);
        }
        finally {
            client.release();
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error("[nautilus] db connection failed:", e.message);
    }
    return res.json({
        qualityScore,
        isValid,
        attestation,
        timestamp,
    });
}));
exports.default = router;
