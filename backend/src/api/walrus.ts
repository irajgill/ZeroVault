import express, { Request, Response, NextFunction } from "express";
import { downloadFromWalrus } from "../walrus";
import { ValidationError } from "../middleware/errorHandler";

const router = express.Router();

function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};
}

router.get("/status/:blobId", asyncHandler(async (req: Request, res: Response) => {
	const { blobId } = req.params;
	if (!blobId) throw new ValidationError("Missing blobId");
	const buf = await downloadFromWalrus(blobId);
	return res.json({ ok: true, size: buf.length });
}));

export default router;












