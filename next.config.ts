import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // WalletConnect pulls in optional Node-only deps that must not be bundled for the browser.
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

export default nextConfig;
