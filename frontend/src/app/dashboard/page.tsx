'use client';

import React, { useEffect, useState } from "react";
export const dynamic = "force-dynamic";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { truncateAddress, sha256Hex, canonicalSuiId } from "@/lib/utils";
import useSui from "@/hooks/useSui";
import { CONTRACT_IDS } from "@/constants";
import { Transaction } from "@mysten/sui/transactions";
import { fetchUserDatasets } from "@/hooks/useDatasets";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import DatasetCard from "@/components/DatasetCard";
import useSecureDownload from "@/hooks/useSecureDownload";
import TransactionStatus from "@/components/TransactionStatus";
import { Layers3 } from "lucide-react";

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

  async function handleSecureDownload(dataset: any) {
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


