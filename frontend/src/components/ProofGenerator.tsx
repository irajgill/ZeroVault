'use client';

import React, { useCallback, useMemo, useState } from "react";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import useZKProof from "@/hooks/useZKProof";
import TransactionStatus from "./TransactionStatus";

export interface ProofGeneratorProps {
  datasetHash: string;
  onProofGenerated?: (args: { proofB64: string; publicInputsB64: string; digest?: string }) => void;
}

export default function ProofGenerator({ datasetHash, onProofGenerated }: ProofGeneratorProps) {
  const { loading, error, generateProof, verifyProof, submitProofToChain } = useZKProof();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [digest, setDigest] = useState<string | null>(null);

  const percent = useMemo(() => {
    if (step === 0) return 0;
    if (step === 1) return 33;
    if (step === 2) return 66;
    if (step === 3) return 90;
    return 0;
  }, [step]);

  const handleGenerateProof = useCallback(async () => {
    setStep(1);
    const creatorKey = "987654"; // demo only; replace with wallet-bound secret in future
    const res = await generateProof(datasetHash, creatorKey);
    const p = (res as unknown as { proof: string }).proof;
    const s = (res as unknown as { publicInputs: string }).publicInputs;

    setStep(2);
    const ok = await verifyProof(p, s, "data_authenticity");
    if (!ok) throw new Error("Local verification failed");

    setStep(3);
    const txd = await submitProofToChain(p, s, "data_authenticity");
    setDigest(txd);
    onProofGenerated?.({ proofB64: p, publicInputsB64: s, digest: txd });
  }, [datasetHash, generateProof, verifyProof, submitProofToChain, onProofGenerated]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-semibold text-white">Proof of Authenticity</h3>
      <p className="mt-1 text-xs text-gray-400">Prove creator key ownership and data hash commitment</p>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          disabled={loading || step > 0}
          onClick={() => handleGenerateProof().catch(() => {})}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-500"
        >
          Generate & Submit Proof
        </button>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : null}
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 text-sm">
          <span className={step >= 1 ? "text-white" : "text-gray-400"}>1. Generating ZK Proof</span>
          {step >= 1 && !loading ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : null}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className={step >= 2 ? "text-white" : "text-gray-400"}>2. Verifying Locally</span>
          {step >= 2 && !loading ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : null}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className={step >= 3 ? "text-white" : "text-gray-400"}>3. Submitting to Blockchain</span>
          {digest ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : null}
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded bg-white/10">
          <div className="h-full bg-blue-500" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {digest ? (
        <div className="mt-4">
          <TransactionStatus status="success" digest={digest} message="ZK proof submitted successfully" />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}


