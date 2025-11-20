import { useCallback, useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransactionBlock } from "@mysten/dapp-kit";
import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

interface UseSuiResult {
  account: ReturnType<typeof useCurrentAccount>;
  client: ReturnType<typeof useSuiClient>;
  executeTransaction: (tx: any) => Promise<string>;
  waitForTransaction: (digest: string) => Promise<boolean>;
  getBalance: () => Promise<string>;
  loading: boolean;
  error: string | null;
}

/**
 * React hook that wires common Sui wallet + client operations:
 * - executeTransaction: sign and execute a built Transaction
 * - waitForTransaction: poll node for final status
 * - getBalance: fetch owner's SUI balance (in MIST string)
 */
export function useSui(): UseSuiResult {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransactionBlock();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeTransaction = useCallback(
    async (tx: any): Promise<string> => {
      if (!account) {
        throw new Error("Wallet not connected");
      }
      setLoading(true);
      setError(null);
      try {
        const res = await signAndExecute({
          transactionBlock: tx as any,
          // options may vary by kit version; defaults are typically fine
        });
        const digest: string = (res as any)?.digest || (res as any)?.effects?.transactionDigest || (res as any)?.effectsCert?.certificate?.transactionDigest || "";
        if (!digest) {
          throw new Error("Missing transaction digest in response");
        }
        return digest;
      } catch (e) {
        const msg = (e as Error).message || String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [account, signAndExecute]
  );

  const waitForTransaction = useCallback(
    async (digest: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        // Wait for finality; showEffects to inspect status
        const res: any = await client.waitForTransactionBlock({
          digest,
          options: { showEffects: true },
        });
        const status = res?.effects?.status?.status;
        return status === "success";
      } catch (e) {
        const msg = (e as Error).message || String(e);
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const getBalance = useCallback(async (): Promise<string> => {
    if (!account) {
      throw new Error("Wallet not connected");
    }
    setLoading(true);
    setError(null);
    try {
      const bal = await client.getBalance({ owner: account.address });
      // totalBalance is a string in MIST
      return bal.totalBalance ?? "0";
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [account, client]);

  return useMemo(
    () => ({
      account,
      client,
      executeTransaction,
      waitForTransaction,
      getBalance,
      loading,
      error,
    }),
    [account, client, executeTransaction, waitForTransaction, getBalance, loading, error]
  );
}

export default useSui;


