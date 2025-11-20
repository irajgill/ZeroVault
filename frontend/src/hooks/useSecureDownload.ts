'use client';

import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import nacl from "tweetnacl";
import { BACKEND_URL } from "@/constants";

interface SecureDownloadResult {
  downloading: boolean;
  error: string | null;
  plaintext: Uint8Array | null;
  downloadAndDecrypt: (datasetId: string) => Promise<Uint8Array>;
  reset: () => void;
}

interface SecureDownloadResponse {
  blob_id: string;
  nonce_b64: string;
  ciphertext_b64: string;
  wrapped_key: {
    serverPublicKeyB64: string;
    nonceB64: string;
    boxB64: string;
    algorithm: string;
  };
  algorithm: string;
}

export function useSecureDownload(): SecureDownloadResult {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState<Uint8Array | null>(null);

  const reset = useCallback(() => {
    setDownloading(false);
    setError(null);
    setPlaintext(null);
  }, []);

  const downloadAndDecrypt = useCallback(async (datasetId: string): Promise<Uint8Array> => {
    if (!datasetId) throw new Error("dataset id is required");
    setDownloading(true);
    setError(null);
    setPlaintext(null);
    try {
      // Generate an ephemeral recipient keypair for this download (dev-only).
      // In a real app the user would have a long-lived X25519 key pair tied to their wallet.
      const recipient = nacl.box.keyPair();
      const recipientPublicKeyB64 = Buffer.from(recipient.publicKey).toString("base64");

      const url = `${BACKEND_URL}/api/datasets/secure-download/${encodeURIComponent(datasetId)}`;
      const { data } = await axios.post<SecureDownloadResponse>(
        url,
        { recipientPublicKeyB64 },
        { timeout: 20_000 }
      );

      const nonce = Buffer.from(data.nonce_b64, "base64");
      const ciphertext = Buffer.from(data.ciphertext_b64, "base64");

      const ek = data.wrapped_key;
      const ephemeralPub = Buffer.from(ek.serverPublicKeyB64, "base64");
      const wrappedKeyCiphertext = Buffer.from(ek.boxB64, "base64");
      const keyNonce = Buffer.from(ek.nonceB64, "base64");

      if (ephemeralPub.length !== nacl.box.publicKeyLength) {
        throw new Error("Invalid ephemeral public key length");
      }

      // Derive shared secret using X25519 (NaCl box).
      const shared = nacl.box.open(
        new Uint8Array(wrappedKeyCiphertext),
        new Uint8Array(keyNonce),
        new Uint8Array(ephemeralPub),
        recipient.secretKey
      );
      if (!shared) {
        throw new Error("Failed to unwrap dataset key");
      }

      // shared holds the XSalsa20-Poly1305 key bytes
      if (shared.length !== nacl.secretbox.keyLength) {
        throw new Error("Unwrapped key has unexpected length");
      }

      const decrypted = nacl.secretbox.open(
        new Uint8Array(ciphertext),
        new Uint8Array(nonce),
        shared
      );
      if (!decrypted) {
        throw new Error("Failed to decrypt ciphertext");
      }

      const plain = new Uint8Array(decrypted);
      setPlaintext(plain);
      return plain;
    } catch (e) {
      const msg = (e as Error).message || "Secure download failed";
      setError(msg);
      throw e;
    } finally {
      setDownloading(false);
    }
  }, []);

  return useMemo(
    () => ({ downloading, error, plaintext, downloadAndDecrypt, reset }),
    [downloading, error, plaintext, downloadAndDecrypt, reset]
  );
}

export default useSecureDownload;




