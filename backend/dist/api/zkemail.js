"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const models_1 = require("../database/models");
const errorHandler_1 = require("../middleware/errorHandler");
const sui_1 = require("../sui");
const router = express_1.default.Router();
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
// POST /api/zkemail/attest
// Records an email-based ZK attestation after a proof has been verified on-chain.
router.post("/attest", asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body?.address || !body?.emailHash || !body?.domain || !body?.transactionDigest) {
        throw new errorHandler_1.ValidationError("Missing required fields", ["address", "emailHash", "domain", "transactionDigest"]);
    }
    // Best-effort: verify that the provided transaction digest belongs to this Sui address
    // and executed successfully on the configured network. This ties the zkEmail proof
    // (executed elsewhere) to the caller's wallet.
    try {
        const client = (0, sui_1.getSuiClient)();
        const tx = await client.getTransactionBlock({
            digest: body.transactionDigest,
            options: { showEffects: true, showInput: true },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyTx = tx;
        const status = anyTx?.effects?.status?.status;
        const sender = anyTx?.transaction?.data?.sender;
        if (status !== "success") {
            throw new errorHandler_1.ValidationError("Provided transaction digest did not succeed on-chain");
        }
        if (!sender || sender.toLowerCase() !== body.address.toLowerCase()) {
            throw new errorHandler_1.ValidationError("Provided transaction digest does not belong to this wallet address");
        }
    }
    catch (e) {
        if (e instanceof errorHandler_1.ValidationError) {
            throw e;
        }
        throw new errorHandler_1.ValidationError("Failed to verify Sui transaction digest for zkEmail attestation");
    }
    const att = await (0, models_1.createEmailAttestation)({
        address: body.address,
        email_hash: body.emailHash,
        domain: body.domain,
        circuit_type: body.circuitType || "email_attestation",
        transaction_digest: body.transactionDigest,
    });
    return res.json(att);
}));
// GET /api/zkemail/attestations/:address
router.get("/attestations/:address", asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!address)
        throw new errorHandler_1.ValidationError("address is required");
    const items = await (0, models_1.getEmailAttestationsForAddress)(address);
    return res.json(items);
}));
exports.default = router;
