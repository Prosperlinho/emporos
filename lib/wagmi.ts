import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const transports = { [celo.id]: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || undefined) };

// With a WalletConnect project ID you get the full RainbowKit wallet list (mobile wallets via QR/deep link).
// Without one, only injected wallets work: MiniPay, Valora's browser, MetaMask/Rabby extensions.
export const wagmiConfig = projectId
  ? getDefaultConfig({ appName: "Emporos", projectId, chains: [celo], transports, ssr: true })
  : createConfig({
      chains: [celo],
      transports,
      ssr: true,
      connectors: connectorsForWallets([{ groupName: "Browser wallet", wallets: [injectedWallet] }], {
        appName: "Emporos",
        projectId: "not-configured",
      }),
    });

export const walletConnectConfigured = Boolean(projectId);
