"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sui_1 = require("../sui");
const errorHandler_1 = require("../middleware/errorHandler");
const models_1 = require("../database/models");
const router = express_1.default.Router();
// In-memory access grants (dev placeholder)
// Key: `${datasetId}:${buyerAddress.toLowerCase()}`
const accessGrants = new Set();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
router.post("/prepare", asyncHandler(async (req, res) => {
    const { datasetId, buyerAddress } = req.body;
    if (!datasetId || !buyerAddress) {
        throw new errorHandler_1.ValidationError("datasetId and buyerAddress are required");
    }
    const marketplaceId = process.env.MARKETPLACE_ID;
    if (!marketplaceId) {
        throw new errorHandler_1.ValidationError("MARKETPLACE_ID env var not set");
    }
    const datasets = await (0, sui_1.queryMarketplaceDatasets)(marketplaceId);
    const dataset = datasets.find((d) => d.id === datasetId);
    if (!dataset) {
        throw new errorHandler_1.ValidationError("Dataset not found");
    }
    const payment_amount = dataset.price;
    return res.json({ dataset, payment_amount, marketplace_id: marketplaceId });
}));
router.post("/confirm", asyncHandler(async (req, res) => {
    const { datasetId, transactionDigest, buyerAddress } = req.body;
    if (!datasetId || !transactionDigest) {
        throw new errorHandler_1.ValidationError("datasetId and transactionDigest are required");
    }
    // Dev bypass: treat transaction as successful to grant access and finish E2E
    const ok = process.env.ZK_FAKE_VALID === "1" ? true : await (0, sui_1.verifyTransaction)(transactionDigest);
    if (!ok) {
        return res.status(400).json({ success: false, access_granted: false, error: "Transaction not successful" });
    }
    // Grant access (dev placeholder) if buyerAddress present
    let access_granted = false;
    if (buyerAddress) {
        grantAccess(datasetId, buyerAddress);
        access_granted = true;
    }
    // Best-effort return of blob_id by re-querying marketplace
    let blob_id = null;
    const marketplaceId = process.env.MARKETPLACE_ID;
    if (marketplaceId) {
        const datasets = await (0, sui_1.queryMarketplaceDatasets)(marketplaceId);
        const ds = datasets.find((d) => d.id === datasetId);
        if (ds)
            blob_id = ds.blob_id;
    }
    // Optional: persist purchase to DB if backendDatasetId and buyerAddress provided
    const { backendDatasetId } = req.body;
    if (backendDatasetId && buyerAddress) {
        try {
            await (0, models_1.createPurchase)({
                dataset_id: backendDatasetId,
                buyer_address: buyerAddress,
                transaction_digest: transactionDigest,
                purchased_at: new Date(),
            });
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error("[purchase] DB createPurchase failed:", e.message);
        }
    }
    return res.json({ success: true, access_granted, blob_id });
}));
router.get("/access/:datasetId", asyncHandler(async (req, res) => {
    const { datasetId } = req.params;
    const buyer = req.query.buyer || req.header("x-buyer-address");
    if (!datasetId || !buyer) {
        throw new errorHandler_1.ValidationError("datasetId and buyer (query or x-buyer-address) required");
    }
    const hasAccess = checkAccess(datasetId, buyer);
    return res.json({ has_access: hasAccess });
}));
function grantAccess(datasetId, buyer) {
    accessGrants.add(makeGrantKey(datasetId, buyer));
}
function checkAccess(datasetId, buyer) {
    return accessGrants.has(makeGrantKey(datasetId, buyer));
}
function makeGrantKey(datasetId, buyer) {
    return `${datasetId}:${buyer.toLowerCase()}`;
}
exports.default = router;
