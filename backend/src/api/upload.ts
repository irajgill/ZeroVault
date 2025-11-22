import express, { Request, Response, NextFunction } from "express";
import axios from "axios";
import { encryptWithSeal, getSealPolicyId } from "../seal";
import { uploadToWalrus, downloadFromWalrus } from "../walrus";
import { createDataset } from "../database/models";
import { ValidationError } from "../middleware/errorHandler";

const router = express.Router();

interface UploadBody {
	file: string; // base64 string (optionally data URL)
	originalFilename?: string;
	contentType?: string;
	metadata: {
		name: string;
		description: string;
		price: string | number;
		creator?: string; // optional creator address; or use x-creator-address header
	};
	allowedAddresses?: string[];
	expiryTimestamp?: number; // seconds since epoch
}

function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};
}

router.post("/dataset", asyncHandler(async (req: Request, res: Response) => {
		const body = req.body as UploadBody;
		if (!body?.file || !body?.metadata) {
			throw new ValidationError("Missing file or metadata");
		}
		const base64 = normalizeBase64(body.file);
		if (!base64) throw new ValidationError("Invalid base64");

		const plaintext = Buffer.from(base64, "base64");

		// Build a temporary policy for dev; real Seal will define policies off-chain
		const expiry =
			typeof body.expiryTimestamp === "number" ? body.expiryTimestamp : Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
		const policyId = await getSealPolicyId(body.allowedAddresses || [], expiry);

		// Encrypt with Seal envelope (XSalsa20-Poly1305, nonce||ciphertext)
		const { combined, metadata } = await encryptWithSeal(plaintext, policyId);

		// Upload encrypted bytes to Walrus
		const blob_id = await uploadToWalrus(combined);
		// Verify the blob is retrievable (lightweight HEAD-equivalent by GET length)
		let stored_size = 0;
		try {
			const buf = await downloadFromWalrus(blob_id);
			stored_size = buf.length;
		} catch (e) {
			// eslint-disable-next-line no-console
			console.warn("[upload] Walrus post-upload check failed:", (e as Error).message);
		}

		// Optional: Call Nautilus for quality verification
		let quality: {
			quality_score?: number;
			is_valid?: boolean;
			attestation?: string;
			timestamp_ms?: number;
		} = {};
		try {
			const NAUTILUS_URL = process.env.NAUTILUS_URL || "http://localhost:3000";
			const min_quality_threshold = Number(process.env.MIN_QUALITY_THRESHOLD || 0);
			const resp = await axios.post(`${NAUTILUS_URL}/verify`, {
				blob_id,
				min_quality_threshold
			}, { timeout: 30000 });
			quality = {
				quality_score: Number(resp.data?.quality_score ?? 0),
				is_valid: Boolean(resp.data?.is_valid ?? false),
				attestation: String(resp.data?.attestation ?? ""),
				timestamp_ms: Number(resp.data?.timestamp_ms ?? 0)
			};
		} catch (e) {
			// eslint-disable-next-line no-console
			console.log("[upload] Nautilus verify skipped/failed:", (e as Error).message);
		}

		// Persist dataset in DB
		const creatorHeader = (req.header("x-creator-address") || "").toLowerCase();
		const creator = body.metadata.creator?.toLowerCase() || creatorHeader || "unknown";
		const originalFilename = body.originalFilename || "";
		const contentType = body.contentType || "";
		const dataset = await createDataset({
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

router.get("/status/:blobId", asyncHandler(async (req: Request, res: Response) => {
	const { blobId } = req.params;
	if (!blobId) throw new ValidationError("Missing blobId");
	const buf = await downloadFromWalrus(blobId);
	return res.json({ exists: true, size: buf.length });
}));

function normalizeBase64(input: string): string {
	// Strip data URL prefix if present
	const match = input.match(/^data:.*;base64,(.*)$/);
	return match ? match[1] : input;
}

export default router;


