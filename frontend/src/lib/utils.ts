import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(clsx(classes));
}

export async function sha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
  let data: Uint8Array;
  if (typeof input === "string") {
    data = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    data = new Uint8Array(input);
  } else {
    data = input;
  }
  const src = data as Uint8Array;
  const ab = new ArrayBuffer(src.byteLength);
  new Uint8Array(ab).set(src);
  const digest = await crypto.subtle.digest("SHA-256", ab);
  return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return "0x" + hex;
}

/**
 * Canonicalise any Sui-style hex ID / address into 0x + 64 hex chars.
 * This makes the frontend tolerant of IDs copied in padded form
 * (e.g. 0x0000...0009a8...) which otherwise trip the dapp-kit schema.
 */
export function canonicalSuiId(id: string): string {
  if (!id) {
    throw new Error("Missing Sui ID");
  }
  let s = id.trim().toLowerCase();
  if (s.startsWith("0x")) s = s.slice(2);
  // Drop any non-hex characters just in case (newlines, spaces, etc.)
  s = s.replace(/[^0-9a-f]/g, "");
  // Remove leading zeros, then pad back to 32 bytes.
  s = s.replace(/^0+/, "");
  if (s.length === 0) s = "0";
  if (s.length > 64) {
    // In practice, extra length is almost always just left padding;
    // keep the least-significant 32 bytes.
    s = s.slice(-64);
  }
  return "0x" + s.padStart(64, "0");
}

export function truncateAddress(addr: string, size = 6): string {
  if (!addr) return "";
  const a = addr.toString();
  if (a.length <= size * 2 + 2) return a;
  return `${a.slice(0, size + 2)}…${a.slice(-size)}`;
}

export function formatMist(mist: string | number): string {
  const n = typeof mist === "string" ? BigInt(mist) : BigInt(mist);
  // 1 SUI = 10^9 MIST
  const whole = n / 1_000_000_000n;
  const frac = (n % 1_000_000_000n).toString().padStart(9, "0").slice(0, 3);
  return `${whole}.${frac} SUI`;
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = (bytes / Math.pow(k, i)).toFixed(1);
  return `${val} ${sizes[i]}`;
}


