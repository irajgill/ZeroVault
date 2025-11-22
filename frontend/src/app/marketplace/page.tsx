'use client';

import React, { useEffect, useMemo, useState } from "react";
import useDatasets from "@/hooks/useDatasets";
import DatasetCard from "@/components/DatasetCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import useSui from "@/hooks/useSui";
import { CONTRACT_IDS, PLATFORM_TREASURY } from "@/constants";
import { Transaction } from "@mysten/sui/transactions";
import type { Dataset } from "@/types";
import { sha256Hex, canonicalSuiId, formatBytes } from "@/lib/utils";
import TransactionStatus from "@/components/TransactionStatus";
import useSecureDownload from "@/hooks/useSecureDownload";
import useZkEmail from "@/hooks/useZkEmail";
import { Filter, ShoppingBag, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function MarketplacePage() {
  const { datasets, isLoading, error, refetch } = useDatasets();
  const [query, setQuery] = useState("");
  const [minQuality, setMinQuality] = useState<0 | 70 | 80 | 90>(0);
  const { executeTransaction, waitForTransaction, account } = useSui();

  const {
    downloading,
    error: downloadError,
    plaintext,
    filename,
    contentType,
    downloadAndDecrypt,
    reset: resetDownload,
  } = useSecureDownload();

  const currentAddress = account?.address || "";
  const { attestations } = useZkEmail(currentAddress || undefined);

  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);

  const [txStatus, setTxStatus] = useState<"pending" | "success" | "failed" | null>(null);
  const [txDigest, setTxDigest] = useState<string | undefined>(undefined);
  const [txError, setTxError] = useState<string | null>(null);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const filtered = useMemo(() => {
    return (datasets || []).filter((d) => {
      const qok = Number(d.quality_score || 0) >= (minQuality || 0);
      const sok =
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.description.toLowerCase().includes(query.toLowerCase());
      return qok && sok;
    });
  }, [datasets, query, minQuality]);

  const totalVolume = useMemo(() => {
    if (!datasets?.length) return 0;
    return datasets.reduce((acc, d) => acc + Number(d.price || 0), 0);
  }, [datasets]);

  const avgQuality = useMemo(() => {
    if (!datasets?.length) return 0;
    const scores = datasets.map((d) => Number(d.quality_score || 0));
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [datasets]);

  async function handlePurchase(dataset: Dataset) {
    if (!isClient) throw new Error("Wallet not ready");
    if (!account?.address) {
      throw new Error("Connect your wallet to purchase");
    }
    if (!CONTRACT_IDS.package || !CONTRACT_IDS.marketplace) {
      throw new Error("Marketplace contract IDs are not configured (NEXT_PUBLIC_PACKAGE_ID / NEXT_PUBLIC_MARKETPLACE_ID)");
    }
    // Derive a deterministic Sui ID from the dataset UUID for marketplace bookkeeping.
    const datasetId = canonicalSuiId(await sha256Hex(dataset.id));
    const priceMist = BigInt(dataset.price || "0");
    if (priceMist <= 0n) {
      throw new Error("Invalid dataset price");
    }

    const marketplaceId = canonicalSuiId(CONTRACT_IDS.marketplace);
    const platformTreasury = canonicalSuiId(PLATFORM_TREASURY);

    const tx = new Transaction();
    // Split payment from gas coin
    const [payment] = tx.splitCoins(tx.gas, [priceMist]);

    tx.moveCall({
      target: `${canonicalSuiId(CONTRACT_IDS.package)}::marketplace::purchase_dataset`,
      arguments: [
        tx.object(marketplaceId),
        tx.pure.address(datasetId), // dataset_id: ID
        payment,
        tx.pure.address(platformTreasury),
      ],
    });

    try {
      setTxStatus("pending");
      setTxError(null);
      setTxDigest(undefined);
      const digest = await executeTransaction(tx);
      setTxDigest(digest);
      const ok = await waitForTransaction(digest);
      setTxStatus(ok ? "success" : "failed");
      if (ok) {
        setPurchasedIds((prev) => (prev.includes(dataset.id) ? prev : [...prev, dataset.id]));
      }
      await refetch();
    } catch (e) {
      setTxStatus("failed");
      setTxError((e as Error).message || String(e));
    }
  }

  async function handleSecureDownload(dataset: Dataset) {
    const plain = await downloadAndDecrypt(dataset.id);
    if (typeof window === "undefined") return;
    try {
      const blob = new Blob([plain], { type: contentType || "application/octet-stream" });
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
      console.error("Failed to trigger dataset download from marketplace", e);
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">ZeroVault marketplace</h1>
            <p className="mt-1 text-sm text-gray-300">
              Browse encrypted datasets with on-chain provenance. Every purchase runs through Walrus, Seal, Nautilus, and Sui.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
            <input
              type="text"
              placeholder="Search datasets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-1 text-[11px] text-gray-200">
              <span className="hidden sm:inline text-gray-400 mr-1">Quality:</span>
              {[0, 70, 80, 90].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setMinQuality(q as 0 | 70 | 80 | 90)}
                  className={`rounded-full px-2 py-0.5 transition ${
                    minQuality === q ? "bg-blue-500 text-white" : "bg-transparent text-gray-200 hover:bg-white/10"
                  }`}
                >
                  {q === 0 ? "All" : `${q}+`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
            >
              <Filter className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 text-xs text-gray-300 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-blue-300" />
            <div>
              <p className="font-semibold text-gray-100">Listings</p>
              <p>{datasets?.length ?? 0} total datasets</p>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <div>
              <p className="font-semibold text-gray-100">Average quality</p>
              <p>{avgQuality || 0} / 100 (Nautilus score)</p>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-xs font-bold text-white">
              ZV
            </span>
            <div>
              <p className="font-semibold text-gray-100">Real purchases</p>
              <p>Pay with Sui PTBs; proofs verified on-chain.</p>
            </div>
          </div>
        </div>
        {txStatus ? (
          <div className="sticky top-4 z-10">
            <TransactionStatus
              status={txStatus === "pending" ? "pending" : txStatus === "success" ? "success" : "failed"}
              digest={txDigest}
              message={
                txError ||
                (txStatus === "pending"
                  ? "Processing your purchase on Sui…"
                  : "Purchase completed. This is a real Sui transaction.")
              }
            />
          </div>
        ) : null}
      </header>
      {isLoading ? (
        <div className="mt-4">
          <LoadingSpinner message="Loading datasets..." />
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorMessage error={error} onRetry={() => refetch()} />
        </div>
      ) : null}
      <section className="mt-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-200">Available datasets</h2>
          <p className="text-xs text-gray-400">
            Showing {filtered.length} of {datasets?.length ?? 0}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((d) => {
            const hasPurchased = purchasedIds.includes(d.id);
            const creatorVerifiedDomain =
              attestations.length > 0 && d.creator && currentAddress && d.creator.toLowerCase() === currentAddress.toLowerCase()
                ? attestations[0].domain
                : undefined;
            return (
              <DatasetCard
                key={d.id}
                id={d.sui_object_id || d.id}
                name={d.name}
                description={d.description}
                creator={d.creator}
                price={d.price}
                qualityScore={Number(d.quality_score || 0)}
                blobId={d.blob_id}
                verifiedDomain={creatorVerifiedDomain}
                // Purchase triggers on-chain PTB; download is only enabled after a successful purchase.
                onPurchase={() => handlePurchase(d)}
                onDownload={hasPurchased ? () => handleSecureDownload(d) : undefined}
              />
            );
          })}
        </div>
        {!isLoading && !error && filtered.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No datasets match your filters yet.</p>
        ) : null}
      </section>
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


