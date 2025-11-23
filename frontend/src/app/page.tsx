'use client';

import React from "react";

export const dynamic = "force-dynamic";

const HomePage: React.FC = () => {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="mx-auto max-w-6xl grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)] items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-blue-200">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
              ZV
            </span>
            ZeroVault · Encrypted data marketplace on Sui
          </p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-500 to-fuchsia-500 bg-clip-text text-transparent">
            Sell datasets without giving them away
          </h1>
          <p className="mt-4 text-gray-300 text-sm sm:text-base max-w-xl">
            Upload any file, store it as an encrypted Walrus blob, prove authenticity with ZK, and sell access on Sui.
            Buyers get quality and provenance; you keep your raw data private.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/upload"
              className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 shadow-lg shadow-blue-600/30"
            >
              Start uploading
            </a>
            <a
              href="/marketplace"
              className="rounded-md bg-white/10 px-5 py-2.5 text-sm font-medium text-gray-100 hover:bg-white/20"
            >
              Browse marketplace
            </a>
            <span className="text-xs text-gray-400">
              No raw data on-chain — only encrypted blobs, proofs, and attestations.
            </span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 text-xs text-gray-300">
            <div>
              <p className="font-semibold text-gray-100">100% encrypted</p>
              <p className="mt-1 text-gray-400">Seal-style envelopes for every dataset.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-100">Real ZK on Sui</p>
              <p className="mt-1 text-gray-400">Groth16 proofs verified in Move.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-100">Quality scored</p>
              <p className="mt-1 text-gray-400">Nautilus TEE checks every blob.</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-purple-500/10 p-4 sm:p-5 shadow-xl shadow-black/40 space-y-4">
          <p className="text-xs font-medium text-gray-300 uppercase tracking-wide">How ZeroVault works</p>
          <ol className="space-y-3 text-sm text-gray-200">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-blue-600 text-[11px] font-semibold flex items-center justify-center">
                1
              </span>
              <span>
                <span className="font-semibold">Encrypt &amp; ship</span>{" "}
                <span className="text-gray-300">— Your file is sealed and written to Walrus as a private blob.</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-purple-600 text-[11px] font-semibold flex items-center justify-center">
                2
              </span>
              <span>
                <span className="font-semibold">Prove &amp; verify</span>{" "}
                <span className="text-gray-300">
                  — Circom/Groth16 proofs are verified on Sui; Nautilus scores dataset quality.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-emerald-600 text-[11px] font-semibold flex items-center justify-center">
                3
              </span>
              <span>
                <span className="font-semibold">List &amp; sell</span>{" "}
                <span className="text-gray-300">
                  — Buyers pay in Sui and unlock a secure download with the original filename and type.
                </span>
              </span>
            </li>
          </ol>
        </div>
      </section>

      {/* Why teams use ZeroVault */}
      <section className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">Ship fast, stay private</h3>
            <p className="mt-2 text-sm text-gray-300">
              A full pipeline (Walrus, Seal, ZK, Nautilus, Sui) already wired together so you don&apos;t build infra from
              scratch.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">Trust for buyers</h3>
            <p className="mt-2 text-sm text-gray-300">
              On-chain proofs, quality scores, and zkEmail verified creators reduce the risk of junk or fake datasets.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">Built for real infra</h3>
            <p className="mt-2 text-sm text-gray-300">
              Runs on Sui testnet, Walrus testnet, Postgres, Nautilus TEE, and AWS EC2 — not mocks.
            </p>
          </div>
        </div>
      </section>

      {/* Stack strip */}
      <section className="mx-auto max-w-6xl">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">Powered by</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-200 sm:grid-cols-5">
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Sui</p>
              <p className="text-xs text-gray-400">Programmable data ownership &amp; PTBs</p>
            </div>
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Walrus</p>
              <p className="text-xs text-gray-400">Encrypted blob storage on testnet</p>
            </div>
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Seal</p>
              <p className="text-xs text-gray-400">End‑to‑end encryption &amp; key wrapping</p>
            </div>
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">Nautilus</p>
              <p className="text-xs text-gray-400">TEE attestation &amp; quality scoring</p>
            </div>
            <div className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
              <p className="font-medium">AWS</p>
              <p className="text-xs text-gray-400">Single‑box EC2 deployment for the whole stack</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;





