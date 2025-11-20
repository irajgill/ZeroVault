'use client';

import React, { useMemo, useState } from "react";
import { AlertCircle, X, RefreshCw } from "lucide-react";

export interface ErrorMessageProps {
  error: string | Error | null | undefined;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorMessage({ error, onRetry, className = "" }: ErrorMessageProps) {
  const [visible, setVisible] = useState(true);
  const message = useMemo(() => {
    if (!error) return "";
    return typeof error === "string" ? error : error.message || "An unknown error occurred";
  }, [error]);

  if (!error || !visible) return null;

  return (
    <div
      className={`relative w-full rounded-md border border-red-500/30 bg-red-950/40 px-4 py-3 text-red-200 ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium text-red-200">Error</p>
          <p className="mt-1 text-sm text-red-300">{message}</p>
        </div>
        <div className="flex items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md bg-red-600/10 px-2.5 py-1.5 text-xs font-medium text-red-200 ring-1 ring-inset ring-red-400/30 hover:bg-red-600/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded-md p-1 text-red-300 hover:text-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}


