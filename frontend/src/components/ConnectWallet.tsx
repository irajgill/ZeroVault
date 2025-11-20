'use client';

import React from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { truncateAddress } from "@/lib/utils";

export default function ConnectWallet() {
  const account = useCurrentAccount();
  if (account) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-gray-200">{truncateAddress(account.address)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center">
      <ConnectButton />
    </div>
  );
}


