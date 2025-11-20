import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import { BACKEND_URL, TIMEOUTS, CONTRACT_IDS, ZK_FAKE_VALID } from "@/constants";
import type { ProofResponse } from "@/types";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import useSui from "./useSui";

type CircuitType = "data_authenticity" | "quality_proof";

interface UseZKProof {
  loading: boolean;
  error: string | null;
  status: string | null;
  generateProof: (datasetHash: string, creatorKey: string) => Promise<ProofResponse>;
  verifyProof: (proofB64: string, publicInputsB64: string, circuit: CircuitType) => Promise<boolean>;
  submitProofToChain: (proofB64: string, publicInputsB64: string, circuit: CircuitType) => Promise<string>;
}

function hexToByteArray(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.substr(i, 2), 16));
  }
  return out;
}

export function useZKProof(): UseZKProof {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { executeTransaction, waitForTransaction } = useSui();

  const generateProof = useCallback(async (datasetHash: string, creatorKey: string): Promise<ProofResponse> => {
    setLoading(true);
    setError(null);
    setStatus("Generating authenticity proof");
    try {
      const response = await axios.post<ProofResponse>(
        `${BACKEND_URL}/api/proof/generate`,
        {
          datasetHash,
          creatorPrivateKey: creatorKey,
          creationTimestamp: Date.now(),
        },
        { timeout: TIMEOUTS.PROOF_GENERATION }
      );
      setStatus("Proof generated");
      return response.data;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || "Failed to generate proof";
      setError(errorMsg);
      setStatus("Error");
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyProof = useCallback(async (proofB64: string, publicInputsB64: string, circuit: CircuitType): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setStatus(ZK_FAKE_VALID ? "Bypassing proof verification (dev mode)" : "Verifying proof");
    try {
      if (ZK_FAKE_VALID) {
        // Short‑circuit verification in dev mode: trust backend flag instead of real cryptography.
        return true;
      }
      const { data } = await axios.post(
        `${BACKEND_URL}/api/proof/verify`,
        { proof: proofB64, publicInputs: publicInputsB64, circuitType: circuit },
        { timeout: 30_000 }
      );
      const ok = Boolean(data?.isValid);
      setStatus(ok ? "Proof valid" : "Proof invalid");
      return ok;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || "Failed to verify proof";
      setError(errorMsg);
      setStatus("Error");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const submitProofToChain = useCallback(
    async (proofB64: string, publicInputsB64: string, circuit: CircuitType): Promise<string> => {
      setLoading(true);
      setError(null);
      setStatus(ZK_FAKE_VALID ? "Skipping on-chain proof submission (dev mode)" : "Preparing on-chain submission");
      try {
        if (ZK_FAKE_VALID) {
          // In dev bypass mode we do not submit the proof PTB; instead we return a
          // pseudo-digest to satisfy callers while keeping UX honest via the banner.
          return "0xDEV_BYPASS_ZK_PROOF";
        }
        // Convert proof/public inputs into byte arrays via backend helper
        const prep = await axios.post(
          `${BACKEND_URL}/api/proof/prepare-onchain`,
          { proof: proofB64, publicInputs: publicInputsB64, circuitType: circuit },
          { timeout: 20_000 }
        );
        const proofHex: string = prep.data?.proofBytesHex;
        const inputsHex: string = prep.data?.publicInputsBytesHex;
        if (!proofHex || !inputsHex) {
          throw new Error("Backend did not return prepared byte arrays");
        }

        // Ensure required on-chain object IDs are present
        if (!CONTRACT_IDS.package || !CONTRACT_IDS.vk || !CONTRACT_IDS.proof_registry) {
          throw new Error("Missing CONTRACT_IDS (package/vk/proof_registry)");
        }

        const tx = new Transaction();
        const proofBytes = hexToByteArray(proofHex);
        const inputBytes = hexToByteArray(inputsHex);
        const proofBcs = bcs.vector(bcs.u8()).serialize(Uint8Array.from(proofBytes)).toBytes();
        const inputsBcs = bcs.vector(bcs.u8()).serialize(Uint8Array.from(inputBytes)).toBytes();

        // Call Move verifier; function name must match your deployed contract
        // target: <package_id>::zk_verifier::verify_data_authenticity
        (tx as any).moveCall({
          target: `${CONTRACT_IDS.package}::zk_verifier::verify_data_authenticity`,
          arguments: [
            tx.object(CONTRACT_IDS.vk),
            // Use 'pure' with explicit bytes; TS types vary across SDK versions
            (tx as any).pure(inputsBcs),
            (tx as any).pure(proofBcs),
            tx.object(CONTRACT_IDS.proof_registry),
          ],
        });

        setStatus("Submitting transaction");
        const digest = await executeTransaction(tx);
        setStatus("Waiting for finality");
        await waitForTransaction(digest);
        setStatus("Submitted");
        return digest;
      } catch (err: any) {
        const errorMsg = err?.response?.data?.error || err?.message || "Failed to submit proof on-chain";
        setError(errorMsg);
        setStatus("Error");
        throw new Error(errorMsg);
      } finally {
        setLoading(false);
      }
    },
    [executeTransaction, waitForTransaction]
  );

  return useMemo(
    () => ({
      loading,
      error,
      status,
      generateProof,
      verifyProof,
      submitProofToChain,
    }),
    [loading, error, status, generateProof, verifyProof, submitProofToChain]
  );
}

export default useZKProof;


