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
import { sha256Hex, canonicalSuiId } from "@/lib/utils";
import TransactionStatus from "@/components/TransactionStatus";

export const dynamic = "force-dynamic";

export default function MarketplacePage() {
  const { datasets, isLoading, error, refetch } = useDatasets();
  const [query, setQuery] = useState("");
  const [minQuality, setMinQuality] = useState<0 | 70 | 80 | 90>(0);
  const { executeTransaction, waitForTransaction, account } = useSui();

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
      await refetch();
    } catch (e) {
      setTxStatus("failed");
      setTxError((e as Error).message || String(e));
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Marketplace</h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search datasets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={minQuality}
            onChange={(e) => setMinQuality(Number(e.target.value) as 0 | 70 | 80 | 90)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={0}>All</option>
            <option value={70}>70+</option>
            <option value={80}>80+</option>
            <option value={90}>90+</option>
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>
      {txStatus ? (
        <div className="mt-4">
          <TransactionStatus
            status={txStatus === "pending" ? "pending" : txStatus === "success" ? "success" : "failed"}
            digest={txDigest}
            message={txError || "Processing purchase transaction"}
          />
        </div>
      ) : null}
      {isLoading ? <div className="mt-6"><LoadingSpinner message="Loading datasets..." /></div> : null}
      {error ? <div className="mt-6"><ErrorMessage error={error} onRetry={() => refetch()} /></div> : null}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered?.map((d) => (
          <DatasetCard
            key={d.id}
            id={d.sui_object_id || d.id}
            name={d.name}
            description={d.description}
            creator={d.creator}
            price={d.price}
            qualityScore={Number(d.quality_score || 0)}
            blobId={d.blob_id}
            // Always allow purchase; Move will abort if dataset_id is not listed.
            onPurchase={() => handlePurchase(d)}
          />
        ))}
      </div>
      {!isLoading && !error && filtered.length === 0 ? (
        <p className="mt-8 text-sm text-gray-400">No datasets found.</p>
      ) : null}
    </div>
  );
}


