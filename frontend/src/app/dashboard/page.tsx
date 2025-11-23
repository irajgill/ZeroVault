'use client';

import React, { useEffect, useState } from "react";
export const dynamic = "force-dynamic";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { truncateAddress, sha256Hex, canonicalSuiId, formatTimestamp } from "@/lib/utils";
import useSui from "@/hooks/useSui";
import { CONTRACT_IDS } from "@/constants";
import { Transaction } from "@mysten/sui/transactions";
import { fetchUserDatasets } from "@/hooks/useDatasets";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import DatasetCard from "@/components/DatasetCard";
import useSecureDownload from "@/hooks/useSecureDownload";
import TransactionStatus from "@/components/TransactionStatus";
import { Layers3, Mail, ShieldCheck } from "lucide-react";
import useZkEmail from "@/hooks/useZkEmail";

export default function DashboardPage() {
  const account = useCurrentAccount();
  const addr = account?.address || "";
  const [isClient, setIsClient] = useState(false);
  const [state, setState] = useState<{ loading: boolean; error: string | null; items: any[] }>({
    loading: false,
    error: null,
    items: [],
  });
  const [listTx, setListTx] = useState<{
    status: "pending" | "success" | "failed";
    digest?: string;
    message?: string;
  } | null>(null);

  const { executeTransaction, waitForTransaction } = useSui();

  const { downloading, error: downloadError, plaintext, filename, contentType, downloadAndDecrypt, reset: resetDownload } =
    useSecureDownload();

  const { attestations, loading: zkEmailLoading, error: zkEmailError, createAttestation } = useZkEmail(
    addr || undefined
  );
  const [emailInput, setEmailInput] = useState("");
  const [txInput, setTxInput] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailLocalError, setEmailLocalError] = useState<string | null>(null);
  const [zkEmailStatus, setZkEmailStatus] = useState<{
    status: "pending" | "success" | "failed";
    digest?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!addr) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchUserDatasets(addr)
      .then((items) => mounted && setState({ loading: false, error: null, items }))
      .catch((e) => mounted && setState({ loading: false, error: (e as Error).message, items: [] }));
    return () => {
      mounted = false;
    };
  }, [addr]);

  async function handleCreateEmailAttestation(e: React.FormEvent) {
    e.preventDefault();
    if (!addr) return;
    setEmailLocalError(null);
    try {
      setEmailSubmitting(true);
      const trimmedTx = txInput.trim();
      const trimmedEmail = emailInput.trim().toLowerCase();
      setZkEmailStatus({
        status: "pending",
        digest: trimmedTx || undefined,
        message: "Verifying zkEmail transaction on Sui and recording attestation…",
      });
      await createAttestation(trimmedEmail, trimmedTx);
      setEmailInput("");
      setTxInput("");
      setZkEmailStatus({
        status: "success",
        digest: trimmedTx || undefined,
        message: `zkEmail attestation recorded for ${trimmedEmail}. This transaction belongs to your wallet and succeeded on Sui.`,
      });
    } catch (err) {
      setEmailLocalError((err as Error).message || "Failed to record zkEmail attestation");
      setZkEmailStatus({
        status: "failed",
        digest: txInput.trim() || undefined,
        message: (err as Error).message || "Failed to verify zkEmail transaction or record attestation",
      });
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handleSecureDownload(dataset: any) {
    const plain = await downloadAndDecrypt(dataset.id);
    if (typeof window === "undefined") return;
    try {
      const normalized = plain as Uint8Array<ArrayBuffer>;
      const buffer = normalized.buffer.slice(
        normalized.byteOffset,
        normalized.byteOffset + normalized.byteLength
      );
      const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const fallbackName = `${dataset.name || "zerovault-dataset"}-${dataset.id}`;
      const nameWithExt = filename || fallbackName;
      link.download = nameWithExt;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to trigger dataset download", e);
    }
  }

  async function handleListOnChain(dataset: any) {
    if (!isClient) throw new Error("Wallet not ready");
    if (!addr) throw new Error("Connect your wallet to list");
    if (!CONTRACT_IDS.package || !CONTRACT_IDS.marketplace) {
      throw new Error("Marketplace contract IDs are not configured");
    }

    const datasetId = canonicalSuiId(await sha256Hex(dataset.id));
    const blobBytes = new TextEncoder().encode(dataset.blob_id || "");
    const priceMist = BigInt(dataset.price || "0");
    const quality = Number(dataset.quality_score || 0);
    const sealId = canonicalSuiId(
      typeof dataset.seal_policy_id === "string" && dataset.seal_policy_id.startsWith("0x")
        ? dataset.seal_policy_id
        : `0x${dataset.seal_policy_id}`
    );
    const marketplaceId = canonicalSuiId(CONTRACT_IDS.marketplace);

    const tx = new Transaction();
    tx.moveCall({
      target: `${canonicalSuiId(CONTRACT_IDS.package)}::marketplace::list_dataset`,
      arguments: [
        tx.object(marketplaceId),
        tx.pure.address(datasetId),
        tx.pure.u64(priceMist),
        tx.pure.vector("u8", Array.from(blobBytes)),
        tx.pure.address(sealId),
        tx.pure.u8(quality),
      ],
    });
    setListTx({
      status: "pending",
      message: `Listing "${dataset.name}" on-chain…`,
    });
    try {
      const digest = await executeTransaction(tx);
      setListTx({
        status: "pending",
        digest,
        message: `Listing "${dataset.name}" on-chain…`,
      });
      await waitForTransaction(digest);
      setListTx({
        status: "success",
        digest,
        message: `Dataset "${dataset.name}" successfully listed on-chain. This is a real Sui transaction.`,
      });
    } catch (e) {
      setListTx({
        status: "failed",
        message: (e as Error).message ?? "Failed to list dataset on-chain",
      });
      throw e;
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Your ZeroVault</h1>
        <p className="mt-1 text-gray-300">
          {addr ? (
            <>
              Connected as{" "}
              <span className="font-medium text-white">{truncateAddress(addr)}</span>. Manage the datasets you've
              uploaded and decrypt previews after secure purchase.
            </>
          ) : (
            "Connect your wallet to view and manage your datasets."
          )}
        </p>
      </header>

      {zkEmailStatus ? (
        <div className="mt-4">
          <TransactionStatus
            status={zkEmailStatus.status}
            digest={zkEmailStatus.digest}
            message={zkEmailStatus.message}
          />
        </div>
      ) : null}

      {addr ? (
        <section className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-white/10 p-2">
                <Mail className="h-4 w-4 text-blue-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100">zkEmail creator verification</p>
                <p className="text-xs text-gray-300">
                  Prove you control an email address off-chain with zkEmail, then record the attestation here to show a
                  verified creator badge.
                </p>
              </div>
            </div>
            {attestations.length > 0 ? (
              <div className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Verified: @{attestations[0].domain}</span>
              </div>
            ) : (
              <span className="text-[11px] text-gray-400">No zkEmail attestation yet</span>
            )}
          </div>
          <form onSubmit={handleCreateEmailAttestation} className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_2fr_auto]">
            <input
              type="email"
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Sui tx digest from zkEmail verification"
              value={txInput}
              onChange={(e) => setTxInput(e.target.value)}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={emailSubmitting || !emailInput || !txInput}
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50 hover:bg-blue-500"
            >
              {emailSubmitting ? "Saving…" : "Record zkEmail"}
            </button>
          </form>
          {zkEmailLoading ? <p className="text-[11px] text-gray-400">Loading existing attestations…</p> : null}
          {zkEmailError || emailLocalError ? (
            <p className="text-[11px] text-red-300">
              {emailLocalError || zkEmailError}
            </p>
          ) : null}
          {attestations.length > 0 ? (
            <div className="mt-2 space-y-1 text-[11px] text-gray-400">
              <p className="font-semibold text-gray-300">Recent attestations</p>
              {attestations.slice(0, 2).map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-200">@{a.domain}</span>
                  <span className="text-gray-500">· {formatTimestamp(new Date(a.created_at).getTime())}</span>
                  <a
                    href={`https://explorer.sui.io/txblock/${a.transaction_digest}?network=${encodeURIComponent(
                      (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet").toLowerCase()
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted hover:text-gray-200"
                  >
                    View tx
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {listTx ? (
        <div className="sticky top-4 z-10">
          <TransactionStatus
            status={listTx.status}
            digest={listTx.digest}
            message={listTx.message}
          />
        </div>
      ) : null}

      {!addr ? null : state.loading ? (
        <div className="mt-4">
          <LoadingSpinner message="Loading your datasets..." />
        </div>
      ) : state.error ? (
        <div className="mt-4">
          <ErrorMessage error={state.error} />
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Your datasets</h2>
            <a
              href="/upload"
              className="text-xs rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-gray-100 hover:bg-white/10"
            >
              Upload new
            </a>
          </div>
          {state.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-sm text-gray-300">
              You haven\'t uploaded any datasets yet.{" "}
              <a href="/upload" className="font-medium text-blue-400 hover:text-blue-300">
                Upload your first dataset
              </a>{" "}
              to mint a new ZeroVault entry backed by ZK proofs.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.items.map((d: any) => (
                <div key={d.id} className="space-y-2">
                  <DatasetCard
                    id={d.id}
                    name={d.name}
                    description={d.description}
                    creator={d.creator}
                    price={d.price}
                    qualityScore={Number(d.quality_score || 0)}
                    blobId={d.blob_id}
                    verifiedDomain={attestations[0]?.domain}
                    onDownload={() => handleSecureDownload(d)}
                  />
                  <button
                    type="button"
                    disabled={!addr}
                    onClick={() => handleListOnChain(d)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-gray-100 hover:bg-white/10 disabled:opacity-50"
                  >
                    <Layers3 className="h-3.5 w-3.5" />
                    List on-chain
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {listTx ? (
        <div className="mt-4">
          <TransactionStatus
            status={listTx.status}
            digest={listTx.digest}
            message={listTx.message}
          />
        </div>
      ) : null}
      {downloadError ? (
        <div className="mt-4">
          <ErrorMessage error={downloadError} onRetry={resetDownload} />
        </div>
      ) : null}
      {plaintext ? (
        <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3">
          <p className="mb-1 text-xs text-gray-300">Decrypted preview (first 256 bytes, UTF-8):</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-100">
            {new TextDecoder().decode(plaintext.subarray(0, 256))}
          </pre>
        </div>
      ) : null}
    </div>
  );
}


