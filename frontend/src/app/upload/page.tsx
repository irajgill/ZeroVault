'use client';

import React, { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { MAX_FILE_SIZE } from "@/constants";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import TransactionStatus from "@/components/TransactionStatus";
import useWalrus from "@/hooks/useWalrus";
import { formatBytes, truncateAddress, sha256Hex } from "@/lib/utils";
import useZKProof from "@/hooks/useZKProof";
import { Lock, UploadCloud, ShieldCheck, Sparkles } from "lucide-react";
import axios from "axios";
import { BACKEND_URL } from "@/constants";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const account = useCurrentAccount();
  const addr = (account?.address || "").toLowerCase();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string>("0"); // in SUI
  const [digest, setDigest] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"pending" | "success" | "failed" | null>(null);
  const [proofInfo, setProofInfo] = useState<{ proof?: string; publicInputs?: string } | null>(null);
  const [creatorKey, setCreatorKey] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { upload, uploading, error: uploadError } = useWalrus();
  const { loading: proofLoading, error: proofError, status, generateProof, verifyProof, submitProofToChain } = useZKProof();
  const [phase, setPhase] = useState<"idle" | "uploading" | "proving" | "submitting" | "complete" | "error">("idle");
  const [uploadSummary, setUploadSummary] = useState<{
    datasetId?: string;
    blobId?: string;
    sealPolicyId?: string;
    uploadSize?: number;
    storedSize?: number;
    qualityScore?: number;
    isValid?: boolean;
  } | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    // Accept any file type; we rely only on size limits and downstream encryption.
  });

  const rejectionMsg = useMemo(() => {
    if (!fileRejections.length) return null;
    const r = fileRejections[0];
    if (r.errors?.length) return r.errors[0].message;
    return "File rejected";
  }, [fileRejections]);

  const normalizeFieldElementInput = useCallback((v: string): string => {
    const t = (v || "").trim();
    if (!t) return "123456"; // dev default
    if (/^0x[0-9a-fA-F]+$/.test(t)) return t;
    if (/^[0-9]+$/.test(t)) return t;
    if (/^[0-9a-fA-F]+$/.test(t)) return "0x" + t;
    throw new Error("Creator key must be decimal or hex (optionally 0x-prefixed).");
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setLocalError(null);
    setTxStatus(null);
    setDigest(null);
    setProofInfo(null);
    setUploadSummary(null);
    setPhase("uploading");
    // Compute dataset hash (plaintext) for proof input
    const buf = await file.arrayBuffer();
    const hashHex = await sha256Hex(buf);

    try {
      // Upload with metadata to backend (Seal + Walrus + Nautilus)
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",").pop() || "");
        reader.readAsDataURL(new File([buf], file.name));
      });

      const body = {
        file: base64,
        originalFilename: file.name,
        contentType: file.type || "application/octet-stream",
        metadata: {
          name,
          description,
          price: String(Number(price || "0") * 1_000_000_000), // SUI -> MIST
          // Persist creator address so dashboard/user filter works
          creator: addr || undefined,
        },
      };
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (addr) {
        headers["x-creator-address"] = addr;
      }
      const resp = await axios.post(`${BACKEND_URL}/api/upload/dataset`, body, {
        headers,
        timeout: 60_000,
      });
      const dataset_id = resp.data?.dataset_id;
      setUploadSummary({
        datasetId: dataset_id,
        blobId: resp.data?.blob_id,
        sealPolicyId: resp.data?.seal_policy_id,
        uploadSize: resp.data?.upload_size,
        storedSize: resp.data?.stored_size,
        qualityScore: typeof resp.data?.quality_score === "number" ? resp.data.quality_score : undefined,
        isValid: typeof resp.data?.is_valid === "boolean" ? resp.data.is_valid : undefined,
      });
      setPhase("proving");

      // Generate authenticity proof
      let creator = "123456";
      try {
        creator = normalizeFieldElementInput(creatorKey);
      } catch (e) {
        setLocalError((e as Error).message);
        setPhase("error");
        return;
      }
      const proof = await generateProof(hashHex, creator);
      setProofInfo({ proof: (proof as any).proof, publicInputs: (proof as any).publicInputs });
      // Verify locally
      const ok = await verifyProof((proof as any).proof, (proof as any).publicInputs, "data_authenticity");
      if (!ok) {
        setPhase("error");
        throw new Error("Local proof verification failed");
      }
      // Submit to chain
      setTxStatus("pending");
      setPhase("submitting");
      const txd = await submitProofToChain((proof as any).proof, (proof as any).publicInputs, "data_authenticity");
      setDigest(txd);
      setTxStatus("success");
      setPhase("complete");
    } catch (e) {
      setPhase("error");
      setLocalError((e as Error).message || "Upload & proof flow failed");
    }
  }, [file, name, description, price, addr, creatorKey, normalizeFieldElementInput, generateProof, verifyProof, submitProofToChain]);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white">Upload dataset</h1>
      <p className="mt-1 text-gray-300">Encrypt, store in Walrus, generate ZK proof-of-origin, and verify on-chain.</p>

      <div
        {...getRootProps()}
        className={`mt-6 rounded-md border-2 border-dashed p-8 text-center transition ${
          isDragActive ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-gray-300">
          {isDragActive ? "Drop the file here..." : "Drag & drop a file here, or click to select"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Max {Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB · Any file type (images, CSV, JSON, binaries, archives, ...)
        </p>
      </div>

      {file ? (
        <div className="mt-4 text-sm text-gray-300">
          Selected: <span className="font-medium text-white">{file.name}</span> ({Math.round(file.size / 1024)} KB)
        </div>
      ) : null}
      {rejectionMsg ? <ErrorMessage error={rejectionMsg} /> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-gray-300">Name</label>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="High-quality financial time-series, medical images, ..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-300">Price (SUI)</label>
          <input
            type="number"
            min="0"
            step="0.001"
            className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm text-gray-300">Description</label>
        <textarea
          className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Describe your dataset, its source, licensing, and ideal use-cases..."
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="mt-6 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-yellow-200">
          Advanced ZK creator binding (optional)
        </p>
        <p className="mt-1 text-xs text-yellow-100/90">
          ZeroVault can bind each dataset to a hidden creator-specific secret inside the ZK proof. In this demo, you may
          enter any numeric or hex value. In a production deployment this would be derived from a secure key manager or
          wallet. Do not paste real wallet private keys here.
        </p>
        <div className="mt-3">
          <label className="block text-sm text-gray-200">Creator binding secret</label>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-yellow-500/40 bg-black/40 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            placeholder="Optional — leave blank to use a demo secret"
            value={creatorKey}
            onChange={(e) => setCreatorKey(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={!file || proofLoading || phase === "uploading" || phase === "proving" || phase === "submitting"}
          onClick={() => handleUpload().catch(() => {})}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-500"
        >
          <UploadCloud className="h-4 w-4" />
          {phase === "idle" || phase === "error" ? "Start Upload & Prove" : "Working..."}
        </button>
        {addr ? (
          <span className="text-xs text-gray-400">
            Connected as <span className="font-medium text-gray-200">{truncateAddress(addr)}</span>
          </span>
        ) : (
          <span className="text-xs text-gray-400">Connect your wallet to mint provenance on Sui.</span>
        )}
      </div>

      {/* ZeroVault pipeline status */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">ZeroVault pipeline</p>
        <ol className="mt-3 space-y-2 text-sm text-gray-200">
          <li className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                phase === "uploading" || phase === "proving" || phase === "submitting" || phase === "complete"
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-gray-300"
              }`}
            >
              1
            </span>
            <span>
              <span className="font-semibold">Encrypt &amp; upload</span>{" "}
              <span className="text-gray-300">
                — Your file is sealed with Seal and stored as an encrypted blob on Walrus.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                phase === "proving" || phase === "submitting" || phase === "complete"
                  ? "bg-purple-600 text-white"
                  : "bg-white/10 text-gray-300"
              }`}
            >
              2
            </span>
            <span>
              <span className="font-semibold">Run ZK proof</span>{" "}
              <span className="text-gray-300">
                — Circom + Groth16 generate a proof that you own this exact dataset without revealing it.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                phase === "submitting" || phase === "complete"
                  ? "bg-emerald-600 text-white"
                  : "bg-white/10 text-gray-300"
              }`}
            >
              3
            </span>
            <span>
              <span className="font-semibold">Verify on-chain</span>{" "}
              <span className="text-gray-300">
                — Sui smart contracts verify the proof and anchor your dataset&apos;s provenance.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                phase === "complete" ? "bg-pink-600 text-white" : "bg-white/10 text-gray-300"
              }`}
            >
              <Sparkles className="h-3 w-3" />
            </span>
            <span>
              <span className="font-semibold">Mint ZeroVault entry</span>{" "}
              <span className="text-gray-300">
                — Your dataset is ready to list and sell on the ZeroVault marketplace.
              </span>
            </span>
          </li>
        </ol>
        {(uploading || proofLoading || phase !== "idle") && (
          <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
            <span>{status || (phase === "complete" ? "Pipeline complete" : "Processing pipeline…")}</span>
          </div>
        )}
      </div>
      {localError ? <div className="mt-4"><ErrorMessage error={localError} /></div> : null}
      {uploadError ? <div className="mt-4"><ErrorMessage error={uploadError} /></div> : null}
      {proofError ? <div className="mt-4"><ErrorMessage error={proofError} /></div> : null}

      {uploadSummary ? (
        <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-xs text-gray-200">
          <p className="mb-2 font-semibold text-gray-100">Upload summary</p>
          {uploadSummary.blobId ? (
            <p className="mt-1">
              Walrus blob: <span className="font-mono text-[11px]">{uploadSummary.blobId}</span>
            </p>
          ) : null}
          {uploadSummary.uploadSize ? (
            <p className="mt-1">Encrypted size: {formatBytes(uploadSummary.uploadSize)}</p>
          ) : null}
          {typeof uploadSummary.qualityScore === "number" ? (
            <p className="mt-1">
              Nautilus quality score:{" "}
              <span className="font-semibold">
                {uploadSummary.qualityScore}
                {uploadSummary.isValid ? " (passes threshold)" : ""}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {txStatus ? (
        <div className="mt-6">
          <TransactionStatus
            status={txStatus}
            digest={digest || undefined}
            message="ZK proof transaction on Sui (real on-chain verification)"
          />
        </div>
      ) : null}
    </div>
  );
}


