import express, { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { groth16 } from "snarkjs";
import { createProof } from "../database/models";
import { ValidationError } from "../middleware/errorHandler";

const router = express.Router();

// Allow overriding circuits build dir; default assumes backend is started from backend/
const CIRCUITS_BUILD_DIR =
	process.env.CIRCUITS_BUILD_DIR ||
	path.resolve(process.cwd(), "../circuits/build");

type CircuitType = "data_authenticity" | "quality_proof";

interface GenerateAuthenticityBody {
	datasetHash: string; // hex or decimal string
	creatorPrivateKey: string; // decimal string or hex
	creationTimestamp: number; // ms or seconds
	datasetId?: string; // optional: store proof if provided
	qualityMetrics?: number[]; // optional, ignored here
}

interface VerifyBody {
	proof: string; // base64 of encoded proof bytes (JSON stringified by this API)
	publicInputs: string; // base64 of encoded publicSignals (JSON stringified by this API)
	circuitType: CircuitType;
}

interface GenerateQualityBody {
	qualityMetrics: number[];
	minThreshold: number;
	maxThreshold: number;
	datasetId?: string; // optional: store proof if provided
}

class ProofGenerationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProofGenerationError";
	}
}

function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};
}

router.post("/generate", asyncHandler(async (req: Request, res: Response) => {
		const body: GenerateAuthenticityBody = req.body;
		if (!body || !body.datasetHash || !body.creatorPrivateKey || !body.creationTimestamp) {
			throw new ValidationError("Missing required fields", ["datasetHash", "creatorPrivateKey", "creationTimestamp"]);
		}

		const circuit = "data_authenticity";
		const { wasmPath, zkeyPath } = resolveCircuitArtifacts(circuit);

		// Note: The exact input keys must match your circuit. Adjust if needed.
		const dataHashStr = toBigIntString(body.datasetHash);
		const creatorPrivStr = toBigIntString(body.creatorPrivateKey);
		const creationTsSec = normalizeTimestampToSeconds(body.creationTimestamp);
		const currentTsSec = Math.floor(Date.now() / 1000);

		// Compute required public inputs with Poseidon: publicKeyHash, commitmentHash
		const poseidon = await getPoseidonFn();
		const pkhOut = poseidon([BigInt(creatorPrivStr)]);
		const cmtOut = poseidon([BigInt(dataHashStr)]);
		const publicKeyHash = poseidonToString(poseidon, pkhOut);
		const commitmentHash = poseidonToString(poseidon, cmtOut);

		const input = {
			// private
			creatorPrivateKey: creatorPrivStr,
			dataHash: dataHashStr,
			creationTimestamp: creationTsSec,
			// public
			publicKeyHash,
			commitmentHash,
			currentTimestamp: currentTsSec
		};

		console.log(`[proof] Generating authenticity proof using ${wasmPath} and ${zkeyPath}`);
		let proof, publicSignals;
		try {
			({ proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath));
		} catch (e) {
			throw new ProofGenerationError(`Failed to generate authenticity proof: ${(e as Error).message}`);
		}

		const proofB64 = encodeAsBase64Bytes(proof);
		const signalsB64 = encodeAsBase64Bytes(publicSignals);

		// Persist proof if datasetId is provided
		if (body.datasetId) {
			await createProof({
				dataset_id: body.datasetId,
				proof_json: proof,
				public_inputs: publicSignals,
				circuit_type: "authenticity",
				verified_at: null
			});
		}

		const suiProofBytes = formatProofForSui(proof);

		return res.json({
			proof: proofB64,
			publicInputs: signalsB64,
			suiProofBytesHex: Buffer.from(suiProofBytes).toString("hex"),
			rawProof: proof,
			rawPublicSignals: publicSignals
		});
}));

router.post("/verify", asyncHandler(async (req: Request, res: Response) => {
		const body: VerifyBody = req.body;
		if (!body || !body.proof || !body.publicInputs || !body.circuitType) {
			throw new ValidationError("Missing required fields", ["proof", "publicInputs", "circuitType"]);
		}
		// Dev bypass: pretend proof is valid while we finish wiring E2E
		if (process.env.ZK_FAKE_VALID === "1") {
			return res.json({ isValid: true, circuitType: body.circuitType, devBypass: true });
		}
		const vkeyPath = resolveVkeyPath(body.circuitType);

		const vKey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
		const proof = JSON.parse(Buffer.from(body.proof, "base64").toString("utf8"));
		const publicSignals = JSON.parse(Buffer.from(body.publicInputs, "base64").toString("utf8"));

		console.log(`[proof] Verifying ${body.circuitType} proof with ${vkeyPath}`);
		const isValid = await groth16.verify(vKey, publicSignals, proof);
		return res.json({ isValid, circuitType: body.circuitType });
}));

router.post("/quality", asyncHandler(async (req: Request, res: Response) => {
		const body: GenerateQualityBody = req.body;
		if (!body || !Array.isArray(body.qualityMetrics) || body.qualityMetrics.length === 0) {
			throw new ValidationError("qualityMetrics[] is required");
		}
		if (typeof body.minThreshold !== "number" || typeof body.maxThreshold !== "number") {
			throw new ValidationError("minThreshold and maxThreshold are required");
		}

		const circuit: CircuitType = "quality_proof";
		const { wasmPath, zkeyPath } = resolveCircuitArtifacts(circuit);

		const n = body.qualityMetrics.length;
		const aggregateScore = Math.round(body.qualityMetrics.reduce((a, b) => a + b, 0) / n);

	const qm = body.qualityMetrics.map((v) => Number(v));
	const poseidon = await getPoseidonFn();
	const expOut = poseidon(qm.map((v) => BigInt(v)));
	const expectedHash = poseidonToString(poseidon, expOut);

	const input = {
		qualityMetrics: qm,
		minThreshold: Number(body.minThreshold),
		maxThreshold: Number(body.maxThreshold),
		expectedHash
	};

		console.log(`[proof] Generating quality proof using ${wasmPath} and ${zkeyPath}`);
		let proof, publicSignals;
		try {
			({ proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath));
		} catch (e) {
			throw new ProofGenerationError(`Failed to generate quality proof: ${(e as Error).message}`);
		}

		const proofB64 = encodeAsBase64Bytes(proof);
		const signalsB64 = encodeAsBase64Bytes(publicSignals);

		// Persist proof if datasetId is provided
		if (body.datasetId) {
			await createProof({
				dataset_id: body.datasetId,
				proof_json: proof,
				public_inputs: publicSignals,
				circuit_type: "quality",
				verified_at: null
			});
		}

		const suiProofBytes = formatProofForSui(proof);

		return res.json({
			proof: proofB64,
			publicInputs: signalsB64,
			suiProofBytesHex: Buffer.from(suiProofBytes).toString("hex"),
			rawProof: proof,
			rawPublicSignals: publicSignals,
			aggregateScore
		});
}));

router.get("/export-vk/:circuitType", asyncHandler(async (req: Request, res: Response) => {
	const ct = req.params.circuitType;
	let circuit: CircuitType;
	if (ct === "authenticity" || ct === "data_authenticity") {
		circuit = "data_authenticity";
	} else if (ct === "quality" || ct === "quality_proof") {
		circuit = "quality_proof";
	} else {
		throw new ValidationError("Unsupported circuitType", ["authenticity", "quality"]);
	}
	const vkeyPath = resolveVkeyPath(circuit);
	const vKey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
	return res.json(vKey);
}));

// Prepare byte serialization for on-chain Sui verifier
router.post("/prepare-onchain", asyncHandler(async (req: Request, res: Response) => {
		const body: VerifyBody = req.body;
		if (!body || !body.proof || !body.publicInputs || !body.circuitType) {
			throw new ValidationError("Missing required fields", ["proof", "publicInputs", "circuitType"]);
		}
		const proof = JSON.parse(Buffer.from(body.proof, "base64").toString("utf8"));
		const publicSignals: string[] = JSON.parse(Buffer.from(body.publicInputs, "base64").toString("utf8"));

		// Prefer using the Rust proofprep helper to convert snarkjs proof.json into
		// Arkworks-compressed proof bytes, which we know Sui's groth16 native verifier
		// accepts (see scripts/test-real-zk.sh). Fall back to the TS formatter if the
		// helper binary is unavailable.
		let proofBytes: Uint8Array;
		try {
			proofBytes = await proofToArkworksBytesViaCli(proof, body.circuitType);
		} catch (e) {
			// eslint-disable-next-line no-console
			console.warn("[proof] proofprep helper failed, falling back to TS formatter:", (e as Error).message);
			proofBytes = formatProofForSui(proof);
		}

		const publicInputBytes = formatPublicSignalsForSui(publicSignals);
		return res.json({
			proofBytesHex: Buffer.from(proofBytes).toString("hex"),
			publicInputsBytesHex: Buffer.from(publicInputBytes).toString("hex"),
			circuitType: body.circuitType
		});
	}));

// Helpers
function resolveCircuitArtifacts(circuit: CircuitType): { wasmPath: string; zkeyPath: string } {
	const base = path.join(CIRCUITS_BUILD_DIR, circuit);
	// Prefer wasm in the circuit root, fallback to circom's default <circuit>_js/<circuit>.wasm location
	let wasmPath = path.join(base, `${circuit}.wasm`);
	const altWasmPath = path.join(base, `${circuit}_js`, `${circuit}.wasm`);
	if (!fs.existsSync(wasmPath) && fs.existsSync(altWasmPath)) {
		wasmPath = altWasmPath;
	}
	const zkeyPath = path.join(base, `${circuit}_final.zkey`);
	if (!fs.existsSync(wasmPath)) {
		throw new Error(`Circuit wasm not found at ${wasmPath}. Did you run circuits/scripts/all-in-one.sh?`);
	}
	if (!fs.existsSync(zkeyPath)) {
		throw new Error(`Circuit zkey not found at ${zkeyPath}. Did you run circuits/scripts/all-in-one.sh?`);
	}
	return { wasmPath, zkeyPath };
}

function resolveVkeyPath(circuit: CircuitType): string {
	const vkey = path.join(CIRCUITS_BUILD_DIR, circuit, "verification_key.json");
	if (!fs.existsSync(vkey)) {
		throw new Error(`Verification key not found at ${vkey}`);
	}
	return vkey;
}

/**
 * Convert a snarkjs Groth16 proof JSON into Arkworks-compressed proof bytes
 * using the external Rust helper binary (sui-vktool proofprep).
 *
 * This matches the format expected by Sui's `groth16::proof_points_from_bytes`.
 * If the helper binary is not available or fails, callers should fall back to
 * `formatProofForSui`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function proofToArkworksBytesViaCli(proof: any, circuitType: CircuitType): Promise<Uint8Array> {
	const baseDir = CIRCUITS_BUILD_DIR;
	const circuitDir = path.join(baseDir, circuitType);
	const tmpProofPath = path.join(circuitDir, "proof_runtime.json");
	const outBinPath = path.join(circuitDir, "proof_runtime.bin");

	// Ensure directory exists
	fs.mkdirSync(circuitDir, { recursive: true });
	fs.writeFileSync(tmpProofPath, JSON.stringify(proof), "utf8");

	// Allow overriding helper path via env; default relative to backend/
	const helperPath =
		process.env.PROOFPREP_BIN ||
		path.resolve(process.cwd(), "../sui-vktool/target/release/proofprep");

	await new Promise<void>((resolve, reject) => {
		const child = execFile(helperPath, [tmpProofPath, outBinPath], (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
		// Avoid unhandled error events
		child.on("error", (err) => reject(err));
	});

	const buf = fs.readFileSync(outBinPath);
	// Best-effort cleanup; ignore errors
	try {
		fs.unlinkSync(tmpProofPath);
		fs.unlinkSync(outBinPath);
		// eslint-disable-next-line no-empty
	} catch {}
	return new Uint8Array(buf);
}

function toBigIntString(value: string | number): string {
	if (typeof value === "number") return String(value);
	const v = value.toLowerCase().startsWith("0x") ? BigInt(value) : BigInt(value);
	return v.toString();
}

function encodeAsBase64Bytes(obj: unknown): string {
	const json = JSON.stringify(obj);
	return Buffer.from(json, "utf8").toString("base64");
}

function normalizeTimestampToSeconds(ts: number): number {
	// If looks like ms (> 10^11), convert to seconds
	return ts > 1e11 ? Math.floor(ts / 1000) : Math.floor(ts);
}

// Attempt to convert poseidon output to decimal string robustly across circomlibjs variants
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poseidonToString(poseidonFn: any, out: unknown): string {
	if (typeof out === "bigint") return (out as bigint).toString();
	// builder()-style exposes F.toString
	if (poseidonFn && poseidonFn.F && typeof poseidonFn.F.toString === "function") {
		try {
			return poseidonFn.F.toString(out);
		} catch {
			// fallthrough
		}
	}
	// Uint8Array or byte array fallback: convert to hex, then BigInt
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const anyOut: any = out as any;
	if (anyOut instanceof Uint8Array || (Array.isArray(anyOut) && typeof anyOut[0] === "number")) {
		const bytes: number[] = anyOut instanceof Uint8Array ? Array.from(anyOut) : (anyOut as number[]);
		const hex = "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
		return BigInt(hex).toString();
	}
	// Last resort stringification
	return String(out);
}

let cachedPoseidon: null | ((inputs: bigint[]) => bigint) = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPoseidonFn(): Promise<(inputs: bigint[]) => bigint> {
	if (cachedPoseidon) return cachedPoseidon;
	// Try ESM dynamic import
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mod: any = await import("circomlibjs");
		const direct = mod?.poseidon || mod?.default?.poseidon;
		if (typeof direct === "function") {
			cachedPoseidon = direct as (inputs: bigint[]) => bigint;
			return cachedPoseidon;
		}
		const builder = mod?.buildPoseidon || mod?.default?.buildPoseidon;
		if (typeof builder === "function") {
			const f = await builder();
			cachedPoseidon = f as (inputs: bigint[]) => bigint;
			return cachedPoseidon;
		}
	} catch {
		// ignore and fall through
	}
	// CJS require fallback
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const cjs: any = require("circomlibjs");
		const direct = cjs?.poseidon || cjs?.default?.poseidon;
		if (typeof direct === "function") {
			cachedPoseidon = direct as (inputs: bigint[]) => bigint;
			return cachedPoseidon;
		}
		const builder = cjs?.buildPoseidon || cjs?.default?.buildPoseidon;
		if (typeof builder === "function") {
			const f = await builder();
			cachedPoseidon = f as (inputs: bigint[]) => bigint;
			return cachedPoseidon;
		}
	} catch {
		// ignore
	}
	throw new Error("circomlibjs.poseidon unavailable");
}

// Format Groth16 proof JSON into bytes expected by Sui's groth16 verifier
// Order: pi_a[0], pi_a[1], pi_b[0][0], pi_b[0][1], pi_b[1][0], pi_b[1][1], pi_c[0], pi_c[1]
// Each as 32-byte big-endian
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatProofForSui(proof: any): Uint8Array {
	const pi_a: string[] = proof.pi_a;
	// pi_b is [[b0_c1, b0_c0], [b1_c1, b1_c0]] in snarkjs for BN254; we will map to [x.c0, x.c1] ordering required
	const pi_b: string[][] = proof.pi_b;
	const pi_c: string[] = proof.pi_c;

	// normalize helper
	const feTo32be = (v: string | bigint): Uint8Array => {
		const bi = typeof v === "bigint" ? v : (v.toString().toLowerCase().startsWith("0x") ? BigInt(v) : BigInt(v));
		let hex = bi.toString(16);
		if (hex.length > 64) {
			// Trim leading zeros if any accidental over-padding
			hex = hex.slice(hex.length - 64);
		}
		hex = hex.padStart(64, "0");
		const out = new Uint8Array(32);
		for (let i = 0; i < 32; i++) {
			out[i] = parseInt(hex.substr(i * 2, 2), 16);
		}
		return out;
	};

	const parts: Uint8Array[] = [
		feTo32be(pi_a[0]),
		feTo32be(pi_a[1]),
		// Try alternative ordering: [y.c0, y.c1, x.c0, x.c1]
		feTo32be(pi_b[1][1]), // y.c0
		feTo32be(pi_b[1][0]), // y.c1
		feTo32be(pi_b[0][1]), // x.c0
		feTo32be(pi_b[0][0]), // x.c1
		feTo32be(pi_c[0]),
		feTo32be(pi_c[1]),
	];

	const total = new Uint8Array(parts.reduce((acc, p) => acc + p.length, 0));
	let offset = 0;
	for (const p of parts) {
		total.set(p, offset);
		offset += p.length;
	}
	return total;
}

// Serialize publicSignals (array of field elements as decimal/hex strings) to 32-byte little-endian concatenation.
// Sui's `sui::groth16::public_proof_inputs_from_bytes` expects 32-byte LE scalars.
function formatPublicSignalsForSui(signals: (string | number)[]): Uint8Array {
	const feTo32le = (v: string | number): Uint8Array => {
		const bi = typeof v === "number" ? BigInt(v) : (v.toString().toLowerCase().startsWith("0x") ? BigInt(v) : BigInt(v));
		let hex = bi.toString(16);
		if (hex.length > 64) hex = hex.slice(hex.length - 64);
		hex = hex.padStart(64, "0");
		const beBytes: number[] = [];
		for (let i = 0; i < 32; i++) {
			beBytes.push(parseInt(hex.substr(i * 2, 2), 16));
		}
		// Return as little-endian: reverse the big-endian byte order.
		const leBytes = beBytes.reverse();
		return new Uint8Array(leBytes);
	};
	const parts = signals.map(feTo32le);
	const total = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
	let off = 0;
	for (const p of parts) {
		total.set(p, off);
		off += p.length;
	}
	return total;
}

export default router;


