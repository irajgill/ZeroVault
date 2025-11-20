import { useQuery } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { BACKEND_URL } from "@/constants";
import type { Dataset } from "@/types";

export async function fetchDatasets(): Promise<Dataset[]> {
  const url = `${BACKEND_URL}/api/datasets`;
  try {
    const { data } = await axios.get(url, { timeout: 20_000 });
    // Accept either raw array or { data: [] }
    const list = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(list)) return [];
    return list as Dataset[];
  } catch (e) {
    throw normalizeAxiosError(e, "Failed to fetch datasets");
  }
}

export async function fetchDatasetById(id: string): Promise<Dataset> {
  if (!id) throw new Error("dataset id is required");
  const url = `${BACKEND_URL}/api/datasets/${encodeURIComponent(id)}`;
  try {
    const { data } = await axios.get(url, { timeout: 20_000 });
    const d = data?.data ?? data;
    return d as Dataset;
  } catch (e) {
    throw normalizeAxiosError(e, `Failed to fetch dataset ${id}`);
  }
}

export async function fetchUserDatasets(address: string): Promise<Dataset[]> {
  if (!address) throw new Error("address is required");
  const url = `${BACKEND_URL}/api/datasets/user/${encodeURIComponent(address)}`;
  try {
    const { data } = await axios.get(url, { timeout: 20_000 });
    const list = Array.isArray(data) ? data : data?.data;
    return (list || []) as Dataset[];
  } catch (e) {
    throw normalizeAxiosError(e, `Failed to fetch datasets for ${address}`);
  }
}

export function useDatasets() {
  const query = useQuery({
    queryKey: ["datasets"],
    queryFn: fetchDatasets,
    staleTime: 30_000,
    retry: 1,
  });

  const datasets = (query.data || []) as Dataset[];
  const isLoading = query.isLoading || query.isFetching;
  const error = query.error ? (query.error as Error).message : null;
  const refetch = query.refetch;

  return { datasets, isLoading, error, refetch };
}

function normalizeAxiosError(err: unknown, prefix: string): Error {
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError;
    const status = e.response?.status ? ` [HTTP ${e.response.status}]` : "";
    const msg = e.message || "network error";
    return new Error(`${prefix}: ${msg}${status}`);
  }
  return new Error(`${prefix}: ${(err as Error)?.message || String(err)}`);
}

export default useDatasets;



























