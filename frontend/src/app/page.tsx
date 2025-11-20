'use client';

import React from "react";
import Providers from "./providers";

export const dynamic = "force-dynamic";

export default function HomePage() {
  if (typeof window === "undefined") {
    return <div />;
  }
  return (
    <Providers>
    <div className="space-y-12">
      {/* Hero */}
      <section className="mx-auto max-w-5xl text-center">
        <h1 className="text-3xl sm:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-500 to-fuchsia-500 bg-clip-text text-transparent">
          Privacy-First Data Marketplace
        </h1>
        <p className="mt-4 text-gray-300">
          Prove authenticity with Zero-Knowledge proofs. Encrypt with Seal. Store on Walrus. Verify with Nautilus in TEE. Trade on Sui.
        </p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <a href="/upload" className="rounded-md bg-blue-600 px-5 py-2 text-white hover:bg-blue-500">
            Upload Dataset
          </a>
          <a href="/marketplace" className="rounded-md bg-white/10 px-5 py-2 text-gray-100 hover:bg-white/20">
            Browse Marketplace
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">🔐 Zero-Knowledge Privacy</h3>
            <p className="mt-2 text-sm text-gray-300">Prove facts about your dataset without revealing the data itself.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">✅ Verified Authenticity</h3>
            <p className="mt-2 text-sm text-gray-300">On-chain verification of proof-of-origin and timestamps.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">🤖 AI-Safe Data</h3>
            <p className="mt-2 text-sm text-gray-300">TEE-based quality checks prevent synthetic contamination.</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Total Datasets", value: "—" },
            { label: "Verified Proofs", value: "—" },
            { label: "Total Volume", value: "—" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-sm text-gray-300">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="mx-auto max-w-6xl">
        <h2 className="text-xl font-semibold text-white">How it works</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[
            { title: "Upload", desc: "Encrypt and store in Walrus" },
            { title: "Prove", desc: "Generate ZK proof of authenticity" },
            { title: "Verify", desc: "On-chain verification + TEE quality" },
            { title: "Trade", desc: "List and earn royalties" },
          ].map((it) => (
            <div key={it.title} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">{it.title}</p>
              <p className="mt-1 text-sm text-gray-300">{it.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
    </Providers>
  );
}


