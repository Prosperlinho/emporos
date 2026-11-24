// Build-time stand-in for @x402/* packages.
//
// RainbowKit → wagmi's Base Account connector → @coinbase/cdp-sdk references @x402/* as optional
// dependencies for its own x402 payment helpers. Emporos never calls those helpers, and the packages
// are not installed, so Turbopack fails to resolve them. next.config.ts aliases each @x402 import to
// this module. If anything ever does call into it, it fails loudly instead of silently doing nothing.

function unavailable(name: string): never {
  throw new Error(`${name} is not available: @x402 packages are not installed in Emporos.`);
}

export const toClientEvmSigner = () => unavailable("toClientEvmSigner");
export const registerExactEvmScheme = () => unavailable("registerExactEvmScheme");
export const registerExactSvmScheme = () => unavailable("registerExactSvmScheme");
export class x402Client {
  constructor() {
    unavailable("x402Client");
  }
}
export class UptoEvmScheme {
  constructor() {
    unavailable("UptoEvmScheme");
  }
}
export class ExactSvmScheme {
  constructor() {
    unavailable("ExactSvmScheme");
  }
}

export default {};
