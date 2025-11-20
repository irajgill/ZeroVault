"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const snarkjs_1 = require("snarkjs");
const models_1 = require("../database/models");
const errorHandler_1 = require("../middleware/errorHandler");
const router = express_1.default.Router();
// Allow overriding circuits build dir; default assumes backend is started from backend/
const CIRCUITS_BUILD_DIR = process.env.CIRCUITS_BUILD_DIR ||
    path_1.default.resolve(process.cwd(), "../circuits/build");
class ProofGenerationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProofGenerationError";
    }
}
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
router.post("/generate", asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || !body.datasetHash || !body.creatorPrivateKey || !body.creationTimestamp) {
        throw new errorHandler_1.ValidationError("Missing required fields", ["datasetHash", "creatorPrivateKey", "creationTimestamp"]);
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
        ({ proof, publicSignals } = await snarkjs_1.groth16.fullProve(input, wasmPath, zkeyPath));
    }
    catch (e) {
        throw new ProofGenerationError(`Failed to generate authenticity proof: ${e.message}`);
    }
    const proofB64 = encodeAsBase64Bytes(proof);
    const signalsB64 = encodeAsBase64Bytes(publicSignals);
    // Persist proof if datasetId is provided
    if (body.datasetId) {
        await (0, models_1.createProof)({
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
router.post("/verify", asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || !body.proof || !body.publicInputs || !body.circuitType) {
        throw new errorHandler_1.ValidationError("Missing required fields", ["proof", "publicInputs", "circuitType"]);
    }
    const vkeyPath = resolveVkeyPath(body.circuitType);
    const vKey = JSON.parse(fs_1.default.readFileSync(vkeyPath, "utf8"));
    const proof = JSON.parse(Buffer.from(body.proof, "base64").toString("utf8"));
    const publicSignals = JSON.parse(Buffer.from(body.publicInputs, "base64").toString("utf8"));
    console.log(`[proof] Verifying ${body.circuitType} proof with ${vkeyPath}`);
    const isValid = await snarkjs_1.groth16.verify(vKey, publicSignals, proof);
    return res.json({ isValid, circuitType: body.circuitType });
}));
router.post("/quality", asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || !Array.isArray(body.qualityMetrics) || body.qualityMetrics.length === 0) {
        throw new errorHandler_1.ValidationError("qualityMetrics[] is required");
    }
    if (typeof body.minThreshold !== "number" || typeof body.maxThreshold !== "number") {
        throw new errorHandler_1.ValidationError("minThreshold and maxThreshold are required");
    }
    const circuit = "quality_proof";
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
        ({ proof, publicSignals } = await snarkjs_1.groth16.fullProve(input, wasmPath, zkeyPath));
    }
    catch (e) {
        throw new ProofGenerationError(`Failed to generate quality proof: ${e.message}`);
    }
    const proofB64 = encodeAsBase64Bytes(proof);
    const signalsB64 = encodeAsBase64Bytes(publicSignals);
    // Persist proof if datasetId is provided
    if (body.datasetId) {
        await (0, models_1.createProof)({
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
router.get("/export-vk/:circuitType", asyncHandler(async (req, res) => {
    const ct = req.params.circuitType;
    let circuit;
    if (ct === "authenticity" || ct === "data_authenticity") {
        circuit = "data_authenticity";
    }
    else if (ct === "quality" || ct === "quality_proof") {
        circuit = "quality_proof";
    }
    else {
        throw new errorHandler_1.ValidationError("Unsupported circuitType", ["authenticity", "quality"]);
    }
    const vkeyPath = resolveVkeyPath(circuit);
    const vKey = JSON.parse(fs_1.default.readFileSync(vkeyPath, "utf8"));
    return res.json(vKey);
}));
// Prepare byte serialization for on-chain Sui verifier
router.post("/prepare-onchain", asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || !body.proof || !body.publicInputs || !body.circuitType) {
        throw new errorHandler_1.ValidationError("Missing required fields", ["proof", "publicInputs", "circuitType"]);
    }
    const proof = JSON.parse(Buffer.from(body.proof, "base64").toString("utf8"));
    const publicSignals = JSON.parse(Buffer.from(body.publicInputs, "base64").toString("utf8"));
    const proofBytes = formatProofForSui(proof);
    const publicInputBytes = formatPublicSignalsForSui(publicSignals);
    return res.json({
        proofBytesHex: Buffer.from(proofBytes).toString("hex"),
        publicInputsBytesHex: Buffer.from(publicInputBytes).toString("hex"),
        circuitType: body.circuitType
    });
}));
// Helpers
function resolveCircuitArtifacts(circuit) {
    const base = path_1.default.join(CIRCUITS_BUILD_DIR, circuit);
    // Prefer wasm in the circuit root, fallback to circom's default <circuit>_js/<circuit>.wasm location
    let wasmPath = path_1.default.join(base, `${circuit}.wasm`);
    const altWasmPath = path_1.default.join(base, `${circuit}_js`, `${circuit}.wasm`);
    if (!fs_1.default.existsSync(wasmPath) && fs_1.default.existsSync(altWasmPath)) {
        wasmPath = altWasmPath;
    }
    const zkeyPath = path_1.default.join(base, `${circuit}_final.zkey`);
    if (!fs_1.default.existsSync(wasmPath)) {
        throw new Error(`Circuit wasm not found at ${wasmPath}. Did you run circuits/scripts/all-in-one.sh?`);
    }
    if (!fs_1.default.existsSync(zkeyPath)) {
        throw new Error(`Circuit zkey not found at ${zkeyPath}. Did you run circuits/scripts/all-in-one.sh?`);
    }
    return { wasmPath, zkeyPath };
}
function resolveVkeyPath(circuit) {
    const vkey = path_1.default.join(CIRCUITS_BUILD_DIR, circuit, "verification_key.json");
    if (!fs_1.default.existsSync(vkey)) {
        throw new Error(`Verification key not found at ${vkey}`);
    }
    return vkey;
}
function toBigIntString(value) {
    if (typeof value === "number")
        return String(value);
    const v = value.toLowerCase().startsWith("0x") ? BigInt(value) : BigInt(value);
    return v.toString();
}
function encodeAsBase64Bytes(obj) {
    const json = JSON.stringify(obj);
    return Buffer.from(json, "utf8").toString("base64");
}
function normalizeTimestampToSeconds(ts) {
    // If looks like ms (> 10^11), convert to seconds
    return ts > 1e11 ? Math.floor(ts / 1000) : Math.floor(ts);
}
// Attempt to convert poseidon output to decimal string robustly across circomlibjs variants
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poseidonToString(poseidonFn, out) {
    if (typeof out === "bigint")
        return out.toString();
    // builder()-style exposes F.toString
    if (poseidonFn && poseidonFn.F && typeof poseidonFn.F.toString === "function") {
        try {
            return poseidonFn.F.toString(out);
        }
        catch {
            // fallthrough
        }
    }
    // Uint8Array or byte array fallback: convert to hex, then BigInt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyOut = out;
    if (anyOut instanceof Uint8Array || (Array.isArray(anyOut) && typeof anyOut[0] === "number")) {
        const bytes = anyOut instanceof Uint8Array ? Array.from(anyOut) : anyOut;
        const hex = "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
        return BigInt(hex).toString();
    }
    // Last resort stringification
    return String(out);
}
let cachedPoseidon = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPoseidonFn() {
    if (cachedPoseidon)
        return cachedPoseidon;
    // Try ESM dynamic import
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await Promise.resolve().then(() => __importStar(require("circomlibjs")));
        const direct = mod?.poseidon || mod?.default?.poseidon;
        if (typeof direct === "function") {
            cachedPoseidon = direct;
            return cachedPoseidon;
        }
        const builder = mod?.buildPoseidon || mod?.default?.buildPoseidon;
        if (typeof builder === "function") {
            const f = await builder();
            cachedPoseidon = f;
            return cachedPoseidon;
        }
    }
    catch {
        // ignore and fall through
    }
    // CJS require fallback
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cjs = require("circomlibjs");
        const direct = cjs?.poseidon || cjs?.default?.poseidon;
        if (typeof direct === "function") {
            cachedPoseidon = direct;
            return cachedPoseidon;
        }
        const builder = cjs?.buildPoseidon || cjs?.default?.buildPoseidon;
        if (typeof builder === "function") {
            const f = await builder();
            cachedPoseidon = f;
            return cachedPoseidon;
        }
    }
    catch {
        // ignore
    }
    throw new Error("circomlibjs.poseidon unavailable");
}
// Format Groth16 proof JSON into bytes expected by Sui's groth16 verifier
// Order: pi_a[0], pi_a[1], pi_b[0][0], pi_b[0][1], pi_b[1][0], pi_b[1][1], pi_c[0], pi_c[1]
// Each as 32-byte big-endian
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatProofForSui(proof) {
    const pi_a = proof.pi_a;
    // pi_b is [[b0_c1, b0_c0], [b1_c1, b1_c0]] in snarkjs for BN254; we will map to [x.c0, x.c1] ordering required
    const pi_b = proof.pi_b;
    const pi_c = proof.pi_c;
    // normalize helper
    const feTo32be = (v) => {
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
    const parts = [
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
// Serialize publicSignals (array of field elements as decimal/hex strings) to 32-byte big-endian concatenation
function formatPublicSignalsForSui(signals) {
    const feTo32be = (v) => {
        const bi = typeof v === "number" ? BigInt(v) : (v.toString().toLowerCase().startsWith("0x") ? BigInt(v) : BigInt(v));
        let hex = bi.toString(16);
        if (hex.length > 64)
            hex = hex.slice(hex.length - 64);
        hex = hex.padStart(64, "0");
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++)
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        return bytes;
    };
    const parts = signals.map(feTo32be);
    const total = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
    let off = 0;
    for (const p of parts) {
        total.set(p, off);
        off += p.length;
    }
    return total;
}
exports.default = router;
