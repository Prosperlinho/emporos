import type { NextConfig } from "next";

// Optional @x402/* imports inside @coinbase/cdp-sdk (pulled in by RainbowKit's Base Account
// connector). Emporos never uses them; see lib/stubs/x402-unavailable.ts.
const X402_STUB = "./lib/stubs/x402-unavailable.ts";
const x402Aliases = Object.fromEntries(
  ["@x402/core/client", "@x402/evm", "@x402/evm/exact/client", "@x402/evm/upto/client", "@x402/svm/exact/client"].map(
    (specifier) => [specifier, X402_STUB],
  ),
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // WalletConnect pulls in optional Node-only deps that must not be bundled for the browser.
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  turbopack: {
    resolveAlias: x402Aliases,
  },
};

export default nextConfig;
