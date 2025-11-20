'use client';

import React from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl py-16">
      <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
      <p className="mt-2 text-gray-300">{error?.message || "Unexpected error"}</p>
      <button
        className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}


