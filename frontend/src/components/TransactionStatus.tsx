'use client';

import React, { useMemo } from "react";
import { Loader2, CheckCircle, XCircle, ExternalLink } from "lucide-react";

export interface TransactionStatusProps {
  status: "pending" | "success" | "failed";
  digest?: string;
  message?: string;
  className?: string;
}

function getExplorerUrl(digest: string): string {
  const net = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet").toLowerCase();
  const base = "https://explorer.sui.io/txblock";
  if (net === "mainnet") return `${base}/${digest}`;
  return `${base}/${digest}?network=${encodeURIComponent(net)}`;
}

export default function TransactionStatus({
  status,
  digest,
  message,
  className = "",
}: TransactionStatusProps) {
  const icon = useMemo(() => {
    if (status === "pending") return <Loader2 className="h-5 w-5 animate-spin text-blue-400" aria-hidden="true" />;
    if (status === "success") return <CheckCircle className="h-5 w-5 text-emerald-400" aria-hidden="true" />;
    return <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />;
  }, [status]);

  const colors = useMemo(() => {
    if (status === "pending") return "bg-blue-500/10 text-blue-200 ring-blue-400/30";
    if (status === "success") return "bg-emerald-500/10 text-emerald-200 ring-emerald-400/30";
    return "bg-red-500/10 text-red-200 ring-red-400/30";
  }, [status]);

  const label = useMemo(() => {
    if (status === "pending") return "Pending";
    if (status === "success") return "Success";
    return "Failed";
  }, [status]);

  return (
    <div className={`w-full rounded-md ring-1 ring-inset px-4 py-3 ${colors} ${className}`}>
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1">
          <p className="font-medium">{label}</p>
          {message ? <p className="mt-1 text-sm opacity-90">{message}</p> : null}
          {digest ? (
            <a
              className="mt-2 inline-flex items-center gap-1 text-xs underline decoration-dotted opacity-90 hover:opacity-100"
              href={getExplorerUrl(digest)}
              target="_blank"
              rel="noreferrer"
            >
              View on Explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          {status === "pending" ? (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-white/10">
              <div className="h-full w-1/3 animate-slide rounded bg-current" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


