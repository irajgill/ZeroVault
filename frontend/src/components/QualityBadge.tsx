'use client';

import React, { useMemo } from "react";
import { Award } from "lucide-react";

export interface QualityBadgeProps {
  score: number; // 0-100
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles: Record<NonNullable<QualityBadgeProps["size"]>, { text: string; pad: string; icon: string }> = {
  sm: { text: "text-xs", pad: "px-2 py-0.5", icon: "h-3.5 w-3.5" },
  md: { text: "text-sm", pad: "px-2.5 py-1", icon: "h-4 w-4" },
  lg: { text: "text-base", pad: "px-3 py-1.5", icon: "h-5 w-5" },
};

function getLabel(score: number): string {
  if (score >= 90) return `Excellent (${score})`;
  if (score >= 80) return `Good (${score})`;
  if (score >= 70) return `Fair (${score})`;
  return `Low (${score})`;
}

function getColors(score: number): { bg: string; text: string; ring: string; icon: string } {
  if (score >= 90) return { bg: "bg-emerald-500/10", text: "text-emerald-300", ring: "ring-emerald-400/30", icon: "text-emerald-400" };
  if (score >= 80) return { bg: "bg-blue-500/10", text: "text-blue-300", ring: "ring-blue-400/30", icon: "text-blue-400" };
  if (score >= 70) return { bg: "bg-yellow-500/10", text: "text-yellow-300", ring: "ring-yellow-400/30", icon: "text-yellow-400" };
  return { bg: "bg-red-500/10", text: "text-red-300", ring: "ring-red-400/30", icon: "text-red-400" };
}

export default function QualityBadge({ score, size = "md", className = "" }: QualityBadgeProps) {
  const s = sizeStyles[size];
  const label = useMemo(() => getLabel(Math.max(0, Math.min(100, Math.round(score)))), [score]);
  const colors = useMemo(() => getColors(score), [score]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${s.pad} ${s.text} ${colors.bg} ${colors.text} ring-1 ring-inset ${colors.ring} ${className}`}
      title={`Quality score ${score}/100`}
    >
      <Award className={`${s.icon} ${colors.icon}`} aria-hidden="true" />
      <span className="font-medium">{label}</span>
    </span>
  );
}
























