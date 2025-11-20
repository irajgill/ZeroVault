'use client';

import React from "react";
import { Loader2 } from "lucide-react";

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  className?: string;
}

const sizeMap: Record<NonNullable<LoadingSpinnerProps["size"]>, string> = {
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

export default function LoadingSpinner({
  size = "md",
  message,
  className = "",
}: LoadingSpinnerProps) {
  const spinnerSize = sizeMap[size];
  return (
    <div
      className={`flex flex-col items-center justify-center text-gray-300 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className={`animate-spin text-blue-500 ${spinnerSize}`} />
      {message ? (
        <p className="mt-2 text-sm text-gray-400 text-center">{message}</p>
      ) : null}
    </div>
  );
}



























