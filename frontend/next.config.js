/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WASM + Docker-friendly output
  swcMinify: false,
  output: "standalone",
  eslint: {
    // Allow build to succeed even if ESLint finds issues (hackathon velocity)
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "aggregator.walrus-testnet.walrus.space",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "publisher.walrus-testnet.walrus.space",
        pathname: "/**",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",
    NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet",
    NEXT_PUBLIC_PACKAGE_ID: process.env.NEXT_PUBLIC_PACKAGE_ID || "",
    NEXT_PUBLIC_MARKETPLACE_ID: process.env.NEXT_PUBLIC_MARKETPLACE_ID || "",
    NEXT_PUBLIC_WALRUS_AGGREGATOR_URL:
      process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || "https://aggregator.walrus-testnet.walrus.space",
    NEXT_PUBLIC_WALRUS_PUBLISHER_URL:
      process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || "https://publisher.walrus-testnet.walrus.space",
    NEXT_PUBLIC_NAUTILUS_URL: process.env.NEXT_PUBLIC_NAUTILUS_URL || "http://localhost:3000",
  },
  webpack: (config) => {
    // Enable WebAssembly for snarkjs
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
    };
    // Prevent bundling server-only node modules into the client
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;


