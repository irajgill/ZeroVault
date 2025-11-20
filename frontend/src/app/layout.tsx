import "./globals.css";
import React from "react";
import Providers from "./providers";

export const metadata = {
  title: "zkDataVault",
  description: "Privacy-first data marketplace powered by ZK proofs, Walrus, Seal, Nautilus and Sui.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

