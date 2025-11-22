'use client';

import React, { useEffect, useMemo, useState } from "react";
import { PackageOpen, ExternalLink, ShoppingCart, Download, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import QualityBadge from "./QualityBadge";
import { formatMist, truncateAddress } from "@/lib/utils";
import { checkBlobExists, getBlobUrl, downloadFromWalrus } from "@/lib/walrus-client";

export interface DatasetCardProps {
  id: string;
  name: string;
  description: string;
  creator: string;
  price: string;
  qualityScore: number;
  blobId: string;
  verifiedDomain?: string;
  onPurchase?: () => Promise<void> | void;
  onDownload?: () => Promise<void> | void;
}

export default function DatasetCard({
  id,
  name,
  description,
  creator,
  price,
  qualityScore,
  blobId,
  verifiedDomain,
  onPurchase,
  onDownload,
}: DatasetCardProps) {
  const [buying, setBuying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [walrusStatus, setWalrusStatus] = useState<"idle" | "checking" | "available" | "unavailable" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!blobId) return;
      try {
        setWalrusStatus("checking");
        const ok = await checkBlobExists(blobId);
        if (!cancelled) setWalrusStatus(ok ? "available" : "unavailable");
      } catch {
        if (!cancelled) setWalrusStatus("error");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [blobId]);
  const handleBuy = async () => {
    if (!onPurchase) return;
    try {
      setBuying(true);
      await onPurchase();
    } finally {
      setBuying(false);
    }
  };

  const handleDownload = async () => {
    if (!onDownload) return;
    try {
      setDownloading(true);
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  const handleRawBlobClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!blobId) return;
    try {
      const blob = await downloadFromWalrus(blobId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name || "zerovault-dataset"}-${blobId}.bin`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download raw Walrus blob", err);
    }
  };

  const canDownload = useMemo(() => Boolean(onDownload), [onDownload]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-white/10 p-2">
            <PackageOpen className="h-5 w-5 text-blue-300" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{name}</h3>
            <p className="mt-1 text-sm text-gray-300 line-clamp-3">{description}</p>
            <div className="mt-2 flex flex-col gap-1 text-xs text-gray-400">
              <div className="flex flex-wrap items-center gap-2">
                <span>Creator: {truncateAddress(creator)}</span>
                {verifiedDomain ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-emerald-500/30">
                    <ShieldCheck className="h-3 w-3" />
                    Verified @{verifiedDomain}
                  </span>
                ) : null}
                {blobId ? (
                  <a
                    href={getBlobUrl(blobId)}
                    onClick={handleRawBlobClick}
                    className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-100"
                    title={getBlobUrl(blobId)}
                  >
                    <span className="font-medium">Download Walrus blob</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="text-xs text-gray-500">No Walrus blob yet</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {walrusStatus === "available" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" />
                    Walrus: available
                  </span>
                ) : walrusStatus === "unavailable" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-300 ring-1 ring-yellow-500/30">
                    <AlertTriangle className="h-3 w-3" />
                    Walrus: not yet available (testnet propagation)
                  </span>
                ) : walrusStatus === "error" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 ring-1 ring-red-500/30">
                    <AlertTriangle className="h-3 w-3" />
                    Walrus status unknown
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-300 ring-1 ring-white/10">
                    Checking Walrus…
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <QualityBadge score={Number(qualityScore || 0)} size="sm" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-gray-200">{formatMist(price)}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!onPurchase || buying}
            onClick={handleBuy}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-500"
          >
            <ShoppingCart className="h-4 w-4" />
            {buying ? "Processing..." : "Purchase"}
          </button>
          <button
            type="button"
            disabled={!canDownload || downloading}
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-purple-500"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Decrypting..." : "Download (dev)"}
          </button>
        </div>
      </div>
    </div>
  );
}


