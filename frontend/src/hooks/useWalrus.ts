'use client';

import { useCallback, useMemo, useState } from "react";
import { uploadToWalrus, type UploadResult } from "@/lib/walrus-client";

export interface UseWalrusResult {
  uploading: boolean;
  error: string | null;
  progress: number;
  upload: (file: File) => Promise<UploadResult>;
  reset: () => void;
}

export default function useWalrus(): UseWalrusResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const upload = useCallback(async (file: File): Promise<UploadResult> => {
    setUploading(true);
    setError(null);
    setProgress(5);
    try {
      const res = await uploadToWalrus(file);
      setProgress(100);
      return res;
    } catch (e) {
      const msg = (e as Error).message || "Upload failed";
      setError(msg);
      throw e;
    } finally {
      setUploading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setUploading(false);
    setError(null);
    setProgress(0);
  }, []);

  return useMemo(
    () => ({ uploading, error, progress, upload, reset }),
    [uploading, error, progress, upload, reset]
  );
}
























