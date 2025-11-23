import axios, { AxiosInstance } from "axios";
import crypto from "crypto";

type WalrusSdkClient = unknown | null;

const DEFAULT_AGGREGATOR = process.env.WALRUS_AGGREGATOR || "https://aggregator.walrus-testnet.walrus.space";

const FALLBACK_PUBLISHER_BASE = "https://publisher.walrus-testnet.walrus.space";
const rawPublisher = (process.env.WALRUS_PUBLISHER || "").trim();
const sanitizedPublisher =
	rawPublisher && rawPublisher.includes("aggregator.walrus-testnet.walrus.space")
		? rawPublisher.replace("aggregator.walrus-testnet.walrus.space", "publisher.walrus-testnet.walrus.space")
		: rawPublisher;
const DEFAULT_PUBLISHER = sanitizedPublisher || FALLBACK_PUBLISHER_BASE;

const DEFAULT_PUBLISHER_PATH = process.env.WALRUS_PUBLISHER_PATH || ""; // e.g. "/v1/store" if your publisher requires it
const DEFAULT_PUBLISHER_UPLOAD_URL =
	(process.env.WALRUS_PUBLISHER_UPLOAD_URL && process.env.WALRUS_PUBLISHER_UPLOAD_URL.trim()) ||
	`${trimTrailingSlash(DEFAULT_PUBLISHER)}/v1/blobs`;

function trimTrailingSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

function getAxios(): AxiosInstance {
	return axios.create({
		maxBodyLength: Infinity,
		maxContentLength: Infinity,
		timeout: 60_000
	});
}

/**
 * Best-effort dynamic import of Walrus SDK if available.
 * Falls back to HTTP if the package is not installed.
 */
export async function getWalrusClient(): Promise<WalrusSdkClient> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const mod = await import("@mysten/walrus").catch(() => null);
		if (!mod) {
			console.log("[Walrus] SDK not found, using HTTP fallback.");
			return null;
		}
		// The SDK API may differ; keep as unknown and prefer HTTP paths in this codebase for now.
		console.log("[Walrus] SDK detected, but HTTP fallback remains primary path for compatibility.");
		return mod as unknown;
	} catch {
		console.log("[Walrus] SDK import failed, using HTTP fallback.");
		return null;
	}
}

function getEndpoints() {
	const aggregator = trimTrailingSlash(DEFAULT_AGGREGATOR);
	const publisher = trimTrailingSlash(DEFAULT_PUBLISHER);
	return { aggregator, publisher };
}

/**
 * Upload raw bytes to Walrus.
 * Returns blob_id (string).
 */
export async function uploadToWalrus(data: Buffer): Promise<string> {
	const allowMock = (process.env.WALRUS_ALLOW_MOCK || "").toLowerCase() === "true" || process.env.WALRUS_ALLOW_MOCK === "1";
	const { publisher } = getEndpoints();

	// Mock path for local dev if publisher is unavailable
	if (allowMock) {
		const id = sha256Hex(data);
		console.log(`[Walrus] WALRUS_ALLOW_MOCK=1 → mock upload, blob_id=${id} (size=${data.length} bytes)`);
		return id;
	}

	// Prefer HTTP API for compatibility
	const http = getAxios();
	// Build candidate publisher endpoints:
	// 1) explicit WALRUS_PUBLISHER_UPLOAD_URL if provided
	// 2) explicit WALRUS_PUBLISHER_PATH if provided
	// 3) canonical Walrus publisher path: /v1/blobs    ← primary
	// 4) legacy guesses (/v1/store, /v1, /store, root)
	const candidates: string[] = [];
	if (DEFAULT_PUBLISHER_UPLOAD_URL) {
		candidates.push(trimTrailingSlash(DEFAULT_PUBLISHER_UPLOAD_URL));
	}
	if (DEFAULT_PUBLISHER_PATH) {
		candidates.push(`${publisher}${DEFAULT_PUBLISHER_PATH.startsWith("/") ? "" : "/"}${DEFAULT_PUBLISHER_PATH}`);
	}
	// Walrus testnet publisher: PUT/POST /v1/blobs
	candidates.push(
		`${publisher}/v1/blobs`,
		// Legacy/guess fallbacks kept for compatibility with older deployments
		`${publisher}/v1/store`,
		`${publisher}/v1`,
		`${publisher}/store`,
		publisher
	);

	let lastErr: unknown = null;
	const triedUrls: string[] = [];
	for (const url of candidates) {
		// simple exponential backoff retry
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				console.log(`[Walrus] Uploading to ${url} (attempt ${attempt}) ...`);
				triedUrls.push(url);
				// Try multiple methods/shapes commonly seen in blob publishers
				// Prefer PUT octet-stream first (Walrus publisher expects PUT /v1/blobs)
				let resp = await http.put(url, data, {
					headers: { "Content-Type": "application/octet-stream" },
					onUploadProgress: (e) => {
						if (e.total) {
							const pct = ((e.loaded / e.total) * 100).toFixed(1);
							console.log(`[Walrus] Upload progress: ${pct}% (${e.loaded}/${e.total})`);
						} else {
							console.log(`[Walrus] Upload progress: ${e.loaded} bytes`);
						}
					}
				});
				// If 404/405 fall back to POST octet-stream
				if ((resp.status === 404 || resp.status === 405) && attempt < 3) {
					console.log("[Walrus] PUT not accepted, retrying with POST octet-stream");
					resp = await http.post(url, data, {
						headers: { "Content-Type": "application/octet-stream" }
					});
				}
				// If still not accepted, try multipart/form-data (field 'file')
				if ((resp.status === 404 || resp.status === 415 || resp.status === 400) && attempt < 3) {
					console.log("[Walrus] Octet-stream not accepted, retrying with multipart/form-data");
					const form = new FormData();
					// @ts-expect-error Node18: FormData exists in undici; fallback via any
					form.append("file", new Blob([data]), "blob.bin");
					resp = await http.post(url, form as any, {
						// @ts-ignore
						headers: (form as any).getHeaders ? (form as any).getHeaders() : {}
					});
				}
				// Accept multiple possible response shapes
				const blobId = extractBlobId(resp.data);
				if (!blobId) {
					throw new Error("Upload response missing blob_id");
				}
				console.log(`[Walrus] Upload success: blob_id=${blobId}`);
				return blobId;
			} catch (err) {
				lastErr = err;
				const msg = (err as Error).message || String(err);
				console.log(`[Walrus] Upload failed at ${url} (attempt ${attempt}): ${msg}`);
				// brief backoff
				await new Promise((r) => setTimeout(r, 500 * attempt));
			}
		}
	}
	throw new Error(
		`Walrus upload failed after trying [${Array.from(new Set(triedUrls)).join(", ")}]: ${(lastErr as Error)?.message || "unknown error"}`
	);
}

/**
 * Download raw bytes from Walrus by blob id.
 */
export async function downloadFromWalrus(blobId: string): Promise<Buffer> {
	const allowMock = (process.env.WALRUS_ALLOW_MOCK || "").toLowerCase() === "true" || process.env.WALRUS_ALLOW_MOCK === "1";
	const { aggregator } = getEndpoints();

	if (allowMock && (blobId.startsWith("test_") || blobId.length === 64)) {
		// Generate deterministic bytes from blobId for local testing
		const seed = Buffer.from(blobId, "utf8");
		const synthetic = expandDeterministic(seed, 32 * 1024);
		console.log(`[Walrus] WALRUS_ALLOW_MOCK=1 → mock download, size=${synthetic.length} bytes`);
		return synthetic;
	}

	// Walrus aggregator exposes blobs under /v1/blobs/{blob_id}
	const url = `${aggregator}/v1/blobs/${encodeURIComponent(blobId)}`;
	console.log(`[Walrus] Downloading from ${url} ...`);
	try {
		const http = getAxios();
		const resp = await http.get(url, {
			responseType: "arraybuffer",
			onDownloadProgress: (e) => {
				if (e.total) {
					const pct = ((e.loaded / e.total) * 100).toFixed(1);
					console.log(`[Walrus] Download progress: ${pct}% (${e.loaded}/${e.total})`);
				} else {
					console.log(`[Walrus] Download progress: ${e.loaded} bytes`);
				}
			}
		});
		const buf = Buffer.from(resp.data as ArrayBuffer);
		console.log(`[Walrus] Download success: ${buf.length} bytes`);
		return buf;
	} catch (err) {
		// Provide clearer diagnostics for aggregator 404s, which are common on testnet
		// when blobs have not yet propagated to committees.
		const anyErr = err as any;
		const status = anyErr?.response?.status;
		if (status === 404) {
			console.log(
				`[Walrus] Download 404 from aggregator for blob ${blobId} – blob may not yet be available network-wide.`
			);
			throw new Error(
				`Walrus aggregator returned 404 for blob ${blobId}. On testnet this often means the blob is not yet available; try again in a few seconds.`
			);
		}
		console.log(`[Walrus] Download failed: ${(err as Error).message}`);
		throw new Error(`Failed to download Walrus blob ${blobId}: ${(err as Error).message}`);
	}
}

function extractBlobId(data: unknown): string | null {
	// Accept a few shapes: { blob_id }, { id }, { blobId }, raw string
	if (typeof data === "string") return data;
	if (data && typeof data === "object") {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const anyData = data as any;
		// Direct fields
		if (anyData.blob_id || anyData.blobId || anyData.id) {
			return anyData.blob_id || anyData.blobId || anyData.id;
		}
		// Publisher BlobStoreResult: alreadyCertified variant
		// Shape: { alreadyCertified: { blob_id, end_epoch, ... } }
		if (anyData.alreadyCertified && typeof anyData.alreadyCertified === "object") {
			const ac = anyData.alreadyCertified as any;
			if (ac.blob_id || ac.blobId) return ac.blob_id || ac.blobId;
		}
		// Publisher BlobStoreResult: newlyCreated variant
		// Common shapes:
		// - { newlyCreated: { blob_object: { blobId, ... }, ... } }
		// - { newlyCreated: { blobObject: { blobId, ... }, ... } }
		if (anyData.newlyCreated && typeof anyData.newlyCreated === "object") {
			const nc = anyData.newlyCreated as any;
			const bo = (nc.blob_object || nc.blobObject) as any;
			if (bo && typeof bo === "object") {
				if (bo.blobId) return bo.blobId;
				// Some implementations may use snake_case
				if (bo.blob_id) return bo.blob_id;
			}
		}
		// Some servers may wrap result under data/result
		if (anyData.result) {
			return extractBlobId(anyData.result);
		}
		if (anyData.data) {
			return extractBlobId(anyData.data);
		}
		// Fallback: try first string value in object that looks like a blob id (URL-safe base64)
		for (const v of Object.values(anyData)) {
			if (typeof v === "string" && /^[A-Za-z0-9_-]+$/.test(v) && v.length >= 20) {
				return v;
			}
		}
		return null;
	}
	return null;
}

function sha256Hex(input: Buffer): string {
	return crypto.createHash("sha256").update(input).digest("hex");
}

function expandDeterministic(seed: Buffer, size: number): Buffer {
	// Simple PRG using repeated sha256 to fill 'size' bytes deterministically
	const out = Buffer.allocUnsafe(size);
	let offset = 0;
	let counter = 0;
	while (offset < size) {
		const h = crypto.createHash("sha256");
		h.update(seed);
		h.update(Buffer.from([counter & 0xff]));
		const chunk = h.digest();
		const toCopy = Math.min(chunk.length, size - offset);
		chunk.copy(out, offset, 0, toCopy);
		offset += toCopy;
		counter++;
	}
	return out;
}

export default {
	getWalrusClient,
	uploadToWalrus,
	downloadFromWalrus
};















