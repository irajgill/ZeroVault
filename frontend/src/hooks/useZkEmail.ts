'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { BACKEND_URL } from "@/constants";
import type { EmailAttestation } from "@/types";
import { sha256Hex } from "@/lib/utils";

export interface UseZkEmailResult {
  attestations: EmailAttestation[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createAttestation: (email: string, txDigest: string) => Promise<EmailAttestation>;
}

export default function useZkEmail(address?: string): UseZkEmailResult {
  const [attestations, setAttestations] = useState<EmailAttestation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${BACKEND_URL}/api/zkemail/attestations/${encodeURIComponent(address)}`;
      const { data } = await axios.get<EmailAttestation[]>(url, { timeout: 15_000 });
      setAttestations(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = (e as Error).message || "Failed to load zkEmail attestations";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setAttestations([]);
      setError(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [address, refresh]);

  const createAttestation = useCallback(
    async (email: string, txDigest: string): Promise<EmailAttestation> => {
      if (!address) {
        throw new Error("Connect your wallet to record a zkEmail attestation");
      }
      const trimmedEmail = (email || "").trim().toLowerCase();
      if (!trimmedEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(trimmedEmail)) {
        throw new Error("Enter a valid email address");
      }
      const parts = trimmedEmail.split("@");
      const domain = parts[1];
      const emailHash = await sha256Hex(trimmedEmail);
      const body = {
        address,
        emailHash,
        domain,
        transactionDigest: txDigest.trim(),
      };
      const url = `${BACKEND_URL}/api/zkemail/attest`;
      const { data } = await axios.post<EmailAttestation>(url, body, { timeout: 20_000 });
      setAttestations((prev) => [data, ...prev]);
      return data;
    },
    [address]
  );

  return useMemo(
    () => ({ attestations, loading, error, refresh, createAttestation }),
    [attestations, loading, error, refresh, createAttestation]
  );
}


