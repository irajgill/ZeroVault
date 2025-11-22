import express, { Request, Response, NextFunction } from "express";
import { getAllDatasets, getDatasetById, pool } from "../database/models";
import { downloadFromWalrus } from "../walrus";
import { wrapKeyForRecipient } from "../seal";
import { ValidationError } from "../middleware/errorHandler";

const router = express.Router();

function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};
}

// GET /api/datasets
router.get("/", asyncHandler(async (_req: Request, res: Response) => {
	const items = await getAllDatasets();
	return res.json(items);
}));

// GET /api/datasets/:id
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
	const { id } = req.params;
	if (!id) throw new ValidationError("id is required");
	const item = await getDatasetById(id);
	if (!item) return res.status(404).json({ error: "Dataset not found" });
	return res.json(item);
}));

// GET /api/datasets/user/:address
router.get("/user/:address", asyncHandler(async (req: Request, res: Response) => {
	const { address } = req.params;
	if (!address) throw new ValidationError("address is required");
	const addr = address.toLowerCase();
	const result = await pool.query(`SELECT * FROM datasets WHERE lower(creator) = $1 ORDER BY created_at DESC;`, [addr]);
	return res.json(result.rows || []);
}));

// POST /api/datasets/secure-download/:id
// Returns encrypted bytes (nonce||ciphertext) from Walrus and a Seal-wrapped dataset key
// for the provided recipient public key. In production you should ensure that the caller
// is authorized to access the dataset (e.g. by verifying a prior purchase).
router.post("/secure-download/:id", asyncHandler(async (req: Request, res: Response) => {
	const { id } = req.params;
	if (!id) throw new ValidationError("id is required");
	const recipientPublicKeyB64 = (req.body?.recipientPublicKeyB64 as string) || "";
	if (!recipientPublicKeyB64) {
		throw new ValidationError("recipientPublicKeyB64 is required (base64 32 bytes)");
	}
	const ds = await getDatasetById(id);
	if (!ds) return res.status(404).json({ error: "Dataset not found" });
	// Fetch encrypted bytes (nonce||ciphertext)
	const buf = await downloadFromWalrus(ds.blob_id);
	if (buf.length < 24) {
		throw new ValidationError("Stored blob too small");
	}
	const nonce = buf.subarray(0, 24);
	const ciphertext = buf.subarray(24);
	// Wrap dataset key for recipient
	const wrapped = await wrapKeyForRecipient(ds.seal_policy_id, recipientPublicKeyB64);
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

export default router;














