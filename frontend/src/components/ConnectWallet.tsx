'use client';

import React from "react";
import {
  ConnectModal,
  useAccounts,
  useCurrentAccount,
  useDisconnectWallet,
  useSwitchAccount,
} from "@mysten/dapp-kit";
import { truncateAddress } from "@/lib/utils";

export default function ConnectWallet() {
  const account = useCurrentAccount();
  const accounts = useAccounts();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const { mutate: switchAccount } = useSwitchAccount();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  if (!account) {
    return (
      <ConnectModal
        trigger={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-200 transition hover:border-white/30 hover:bg-white/10"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-gray-500" aria-hidden="true" />
            <span>Connect Wallet</span>
          </button>
        }
      />
    );
  }

  const onSelectAccount = (addr: string) => {
    if (addr !== account.address) {
      const selected = accounts.find((acct) => acct.address === addr);
      if (selected) {
        switchAccount({ account: selected });
      }
    }
    setMenuOpen(false);
  };

  const onDisconnect = () => {
    setMenuOpen(false);
    disconnectWallet();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-200 transition hover:border-white/30 hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
        <span>{truncateAddress(account.address)}</span>
        <svg
          className={`h-3 w-3 text-gray-400 transition ${menuOpen ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M3 4l3 3 3-3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-white/10 bg-[#0b0b12] p-2 text-sm text-gray-100 shadow-xl">
          <div className="px-2 pb-2 text-[11px] uppercase tracking-wide text-gray-400">Wallet Accounts</div>
          <div className="max-h-48 overflow-y-auto">
            {accounts.map((acct) => (
              <button
                key={acct.address}
                type="button"
                onClick={() => onSelectAccount(acct.address)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition hover:bg-white/10 ${
                  acct.address === account.address ? "bg-white/5 text-white" : "text-gray-200"
                }`}
              >
                <span>{truncateAddress(acct.address)}</span>
                {acct.address === account.address && <span className="text-[10px] uppercase text-emerald-300">Active</span>}
              </button>
            ))}
            {accounts.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-gray-400">No accounts detected.</div>
            )}
          </div>
          <div className="mt-2 border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={onDisconnect}
              className="flex w-full items-center justify-center rounded-md px-2 py-1.5 text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


