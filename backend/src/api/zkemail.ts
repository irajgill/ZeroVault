import express, { Request, Response, NextFunction } from "express";
import { createEmailAttestation, getEmailAttestationsForAddress } from "../database/models";
import { ValidationError } from "../middleware/errorHandler";
import { getSuiClient } from "../sui";

const router = express.Router();

function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

interface CreateAttestationBody {
  address: string;
  emailHash: string;
  domain: string;
  circuitType?: string;
  transactionDigest: string;
}

// POST /api/zkemail/attest
// Records an email-based ZK attestation after a proof has been verified on-chain.
router.post(
  "/attest",
  asyncHandler(async (req: Request, res: Response) => {
    const body: CreateAttestationBody = req.body;
    if (!body?.address || !body?.emailHash || !body?.domain || !body?.transactionDigest) {
      throw new ValidationError("Missing required fields", ["address", "emailHash", "domain", "transactionDigest"]);
    }
    // Best-effort: verify that the provided transaction digest belongs to this Sui address
    // and executed successfully on the configured network. This ties the zkEmail proof
    // (executed elsewhere) to the caller's wallet.
    try {
      const client = getSuiClient();
      const tx = await client.getTransactionBlock({
        digest: body.transactionDigest,
        options: { showEffects: true, showInput: true },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyTx: any = tx;
      const status = anyTx?.effects?.status?.status;
      const sender = anyTx?.transaction?.data?.sender as string | undefined;
      if (status !== "success") {
        throw new ValidationError("Provided transaction digest did not succeed on-chain");
      }
      if (!sender || sender.toLowerCase() !== body.address.toLowerCase()) {
        throw new ValidationError("Provided transaction digest does not belong to this wallet address");
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        throw e;
      }
      throw new ValidationError("Failed to verify Sui transaction digest for zkEmail attestation");
    }
    const att = await createEmailAttestation({
      address: body.address,
      email_hash: body.emailHash,
      domain: body.domain,
      circuit_type: body.circuitType || "email_attestation",
      transaction_digest: body.transactionDigest,
    });
    return res.json(att);
  })
);

// GET /api/zkemail/attestations/:address
router.get(
  "/attestations/:address",
  asyncHandler(async (req: Request, res: Response) => {
    const { address } = req.params;
    if (!address) throw new ValidationError("address is required");
    const items = await getEmailAttestationsForAddress(address);
    return res.json(items);
  })
);

export default router;


