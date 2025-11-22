'use client';

import React from "react";

export const dynamic = "force-dynamic";

const HomePage: React.FC = () => {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)] items-center">
        <div>
          <p className="inline-flex items-center rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-blue-200">
            ZeroVault · ZK data vault on Sui
          </p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-500 to-fuchsia-500 bg-clip-text text-transparent">
            Privacy-first data vault and marketplace
          </h1>
          <p className="mt-4 text-gray-300 text-sm sm:text-base">
            Prove authenticity with Zero-Knowledge proofs, encrypt with Seal, store on Walrus, verify with Nautilus in
            TEE, and trade safely on Sui — all in one streamlined flow.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/upload"
              className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 shadow-lg shadow-blue-600/30"
            >
              Upload dataset
            </a>
            <a
              href="/marketplace"
              className="rounded-md bg-white/10 px-5 py-2.5 text-sm font-medium text-gray-100 hover:bg-white/20"
            >
              Browse marketplace
            </a>
            <span className="text-xs text-gray-400">
              No raw data ever leaves your vault — only proofs and encrypted blobs.
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-purple-500/10 p-4 sm:p-5 shadow-xl shadow-black/40">
          <p className="text-xs font-medium text-gray-300 uppercase tracking-wide">ZeroVault pipeline</p>
          <ol className="mt-3 space-y-2 text-sm text-gray-200">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-blue-600 text-[11px] font-semibold flex items-center justify-center">
                1
              </span>
              <span>
                <span className="font-semibold">Encrypt &amp; upload</span> — Your dataset is sealed and stored on Walrus.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-purple-600 text-[11px] font-semibold flex items-center justify-center">
                2
              </span>
              <span>
                <span className="font-semibold">Prove authenticity</span> — Circom + Groth16 proofs are generated off-chain.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-emerald-600 text-[11px] font-semibold flex items-center justify-center">
                3
              </span>
              <span>
                <span className="font-semibold">Verify &amp; attest</span> — Sui smart contracts and Nautilus TEE verify integrity.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-pink-600 text-[11px] font-semibold flex items-center justify-center">
                4
              </span>
              <span>
                <span className="font-semibold">List &amp; monetize</span> — Buyers acquire access while you retain cryptographic control.
              </span>
            </li>
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">🔐 Zero-Knowledge privacy</h3>
            <p className="mt-2 text-sm text-gray-300">
              Prove facts about your dataset (origin, timestamp, integrity) without revealing the underlying data.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">✅ On-chain authenticity</h3>
            <p className="mt-2 text-sm text-gray-300">
              Sui Move contracts verify Groth16 proofs and anchor your dataset&apos;s provenance on-chain.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">🤖 TEE-backed quality</h3>
            <p className="mt-2 text-sm text-gray-300">
              Nautilus TEEs run quality checks to guard against synthetic contamination and low-signal data.
            </p>
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="mx-auto max-w-6xl">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">Built on</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-200 sm:grid-cols-4">
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Sui</p>
              <p className="text-xs text-gray-400">Programmable data ownership &amp; PTBs</p>
            </div>
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Walrus</p>
              <p className="text-xs text-gray-400">Durable testnet blob storage</p>
            </div>
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Seal</p>
              <p className="text-xs text-gray-400">End-to-end encryption &amp; key wrapping</p>
            </div>
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Nautilus</p>
              <p className="text-xs text-gray-400">TEE attestation &amp; quality scoring</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;


