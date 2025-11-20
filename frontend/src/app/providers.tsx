'use client';

import React, { useMemo } from "react";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mysten/dapp-kit/dist/index.css";
import ConnectWallet from "@/components/ConnectWallet";
import { ZK_FAKE_VALID } from "@/constants";

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as
    | "localnet"
    | "devnet"
    | "testnet"
    | "mainnet";
  const url = getFullnodeUrl(network);

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={{ [network]: { url } }} defaultNetwork={network}>
        <WalletProvider autoConnect>
          <div className="min-h-screen flex flex-col">
            <header className="border-b border-white/10">
              <div className="mx-auto max-w-6xl w-full px-4 py-4 flex items-center justify-between">
                <a
                  href="/"
                  className="font-semibold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent"
                >
                  zkDataVault
                </a>
                <div className="flex items-center gap-4">
                  <nav className="hidden sm:flex items-center gap-4 text-sm text-gray-300">
                    <a href="/upload">Upload</a>
                    <a href="/marketplace">Marketplace</a>
                    <a href="/dashboard">Dashboard</a>
                  </nav>
                  <ConnectWallet />
                </div>
              </div>
            </header>
            {ZK_FAKE_VALID && (
              <div className="border-b border-yellow-500/40 bg-yellow-500/10">
                <div className="mx-auto max-w-6xl w-full px-4 py-2 text-xs sm:text-sm text-yellow-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="font-semibold uppercase tracking-wide">
                    Dev ZK bypass enabled
                  </span>
                  <span className="text-yellow-100/80">
                    Proofs are treated as valid without full on-chain verification. Use for development only.
                  </span>
                </div>
              </div>
            )}
            <main className="flex-1">
              <div className="mx-auto max-w-6xl w-full px-4 py-8">{children}</div>
            </main>
            <footer className="border-t border-white/10">
              <div className="mx-auto max-w-6xl w-full px-4 py-6 text-xs text-gray-400">
                Built for Walrus Haulout Hackathon
              </div>
            </footer>
          </div>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
























