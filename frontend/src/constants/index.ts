export const BACKEND_URL: string =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

// Dev feature flag: when true, backend is allowed to bypass real ZK verification.
// This is intentionally exposed to the client so the UI can clearly indicate
// that proofs are running in “fake valid” / development mode.
export const ZK_FAKE_VALID: boolean =
  process.env.NEXT_PUBLIC_ZK_FAKE_VALID === "1" ||
  process.env.NEXT_PUBLIC_ZK_FAKE_VALID?.toLowerCase() === "true";

export const CONTRACT_IDS = {
  package: process.env.NEXT_PUBLIC_PACKAGE_ID || "",
  marketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ID || "",
  proof_registry: process.env.NEXT_PUBLIC_PROOF_REGISTRY_ID || "",
  vk: process.env.NEXT_PUBLIC_VK_OBJECT_ID || "",
};

// Platform treasury address used for marketplace fees (e.g. 3%).
// Default to the main hackathon wallet if not provided explicitly.
export const PLATFORM_TREASURY: string =
  process.env.NEXT_PUBLIC_PLATFORM_TREASURY ||
  "0xc9a00b905cd59e93eb633fb2d1023de775e22a595d0c56b6802f5a521c4fea2b";

export const WALRUS_URLS = {
  aggregator:
    process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ||
    "https://aggregator.walrus-testnet.walrus.space",
  publisher:
    process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ||
    "https://publisher.walrus-testnet.walrus.space",
};

export const QUALITY_THRESHOLDS = {
  excellent: 90,
  good: 80,
  fair: 70,
};

// 2 minutes
export const PROOF_GENERATION_TIMEOUT = 120_000;

// 100 MB
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Grouped timeouts for convenient imports
export const TIMEOUTS = {
  PROOF_GENERATION: PROOF_GENERATION_TIMEOUT,
};

export const SUPPORTED_FILE_TYPES: string[] = [
  "text/csv",
  "application/json",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/octet-stream",
];


