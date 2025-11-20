import express, { Request, Response, NextFunction } from "express";
import { Dataset, queryMarketplaceDatasets, verifyTransaction } from "../sui";
import { ValidationError } from "../middleware/errorHandler";
import { createPurchase } from "../database/models";

const router = express.Router();

// In-memory access grants (dev placeholder)
// Key: `${datasetId}:${buyerAddress.toLowerCase()}`
const accessGrants = new Set<string>();

interface PrepareBody {
	datasetId: string;
	buyerAddress: string;
}

interface ConfirmBody {
	datasetId: string;
	transactionDigest: string;
	buyerAddress?: string; // optional, but required to grant access in dev placeholder
	backendDatasetId?: string; // optional: UUID of dataset in backend DB for purchase record
}

function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};
}

router.post("/prepare", asyncHandler(async (req: Request, res: Response) => {
		const { datasetId, buyerAddress } = req.body as PrepareBody;
		if (!datasetId || !buyerAddress) {
			throw new ValidationError("datasetId and buyerAddress are required");
		}
		const marketplaceId = process.env.MARKETPLACE_ID;
		if (!marketplaceId) {
			throw new ValidationError("MARKETPLACE_ID env var not set");
		}
		const datasets = await queryMarketplaceDatasets(marketplaceId);
		const dataset = datasets.find((d) => d.id === datasetId);
		if (!dataset) {
			throw new ValidationError("Dataset not found");
		}
		const payment_amount = dataset.price;
		return res.json({ dataset, payment_amount, marketplace_id: marketplaceId });
}));

router.post("/confirm", asyncHandler(async (req: Request, res: Response) => {
		const { datasetId, transactionDigest, buyerAddress } = req.body as ConfirmBody;
		if (!datasetId || !transactionDigest) {
			throw new ValidationError("datasetId and transactionDigest are required");
		}
		// Dev bypass: treat transaction as successful to grant access and finish E2E
		const ok = process.env.ZK_FAKE_VALID === "1" ? true : await verifyTransaction(transactionDigest);
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
		let blob_id: string | null = null;
		const marketplaceId = process.env.MARKETPLACE_ID;
		if (marketplaceId) {
			const datasets = await queryMarketplaceDatasets(marketplaceId);
			const ds = datasets.find((d) => d.id === datasetId);
			if (ds) blob_id = ds.blob_id;
		}

		// Optional: persist purchase to DB if backendDatasetId and buyerAddress provided
		const { backendDatasetId } = req.body as ConfirmBody;
		if (backendDatasetId && buyerAddress) {
			try {
				await createPurchase({
					dataset_id: backendDatasetId,
					buyer_address: buyerAddress,
					transaction_digest: transactionDigest,
					purchased_at: new Date(),
				});
			} catch (e) {
				// eslint-disable-next-line no-console
				console.error("[purchase] DB createPurchase failed:", (e as Error).message);
			}
		}

		return res.json({ success: true, access_granted, blob_id });
}));

router.get("/access/:datasetId", asyncHandler(async (req: Request, res: Response) => {
		const { datasetId } = req.params;
		const buyer = (req.query.buyer as string) || req.header("x-buyer-address");
		if (!datasetId || !buyer) {
			throw new ValidationError("datasetId and buyer (query or x-buyer-address) required");
		}
		const hasAccess = checkAccess(datasetId, buyer);
		return res.json({ has_access: hasAccess });
}));

function grantAccess(datasetId: string, buyer: string) {
	accessGrants.add(makeGrantKey(datasetId, buyer));
}

function checkAccess(datasetId: string, buyer: string): boolean {
	return accessGrants.has(makeGrantKey(datasetId, buyer));
}

function makeGrantKey(datasetId: string, buyer: string): string {
	return `${datasetId}:${buyer.toLowerCase()}`;
}

export default router;



