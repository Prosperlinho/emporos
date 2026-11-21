import { toDataSuffix } from "@celo/attribution-tags";
import {
  concat,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import type { ComparedOffer } from "./types.ts";
import { formatUsdc } from "./procurement.ts";

export const CELO_CHAIN_ID = 42220;
export const USDC_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const registerAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string" },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

function getCode(): string {
  const code = process.env.ATTRIBUTION_CODE?.trim();
  if (!code || !/^[a-z0-9_]{1,32}$/.test(code)) {
    throw new Error("Set ATTRIBUTION_CODE to the actual assigned hackathon code before sending a transaction.");
  }
  return code;
}

function getKey(): `0x${string}` {
  const key = process.env.PROCUREMENT_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("Set PROCUREMENT_PRIVATE_KEY to a dedicated Celo wallet key in your local .env file.");
  }
  return key as `0x${string}`;
}

function getClients() {
  const account = privateKeyToAccount(getKey());
  const transport = process.env.CELO_RPC_URL
    ? http(process.env.CELO_RPC_URL)
    : http();
  const publicClient = createPublicClient({ chain: celo, transport });
  const walletClient = createWalletClient({ account, chain: celo, transport });
  return { account, publicClient, walletClient };
}

async function submitTaggedTransaction(to: Address, data: Hex): Promise<Hex> {
  const { account, publicClient, walletClient } = getClients();
  const chainId = await publicClient.getChainId();
  if (chainId !== CELO_CHAIN_ID) {
    throw new Error(`Refusing to transact on chain ${chainId}; expected Celo mainnet (${CELO_CHAIN_ID}).`);
  }

  const taggedData = concat([data, toDataSuffix(getCode())]);
  const [gas, gasPrice, nativeBalance] = await Promise.all([
    publicClient.estimateGas({ account, to, data: taggedData }),
    publicClient.getGasPrice(),
    publicClient.getBalance({ address: account.address }),
  ]);
  const gasLimit = (gas * 120n) / 100n;
  const estimatedFee = gasLimit * gasPrice;
  if (nativeBalance < estimatedFee) {
    throw new Error(
      `Insufficient CELO for gas. Estimated fee: ${estimatedFee} wei; available: ${nativeBalance} wei.`,
    );
  }

  const hash = await walletClient.sendTransaction({
    account,
    chain: celo,
    to,
    data: taggedData,
    gas: gasLimit,
    gasPrice,
  });
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Transaction ${hash} was submitted, but confirmation is unknown (${detail}). ` +
      "Inspect this hash before considering another payment.",
    );
  }
  if (receipt.status !== "success") {
    throw new Error(`Transaction ${hash} reverted; inspect it before attempting another payment.`);
  }
  return hash;
}

export async function paySupplier(offer: ComparedOffer): Promise<Hex> {
  if (!offer.eligible) throw new Error("Cannot pay an offer that does not meet the request constraints.");
  if (!offer.walletAddress || !isAddress(offer.walletAddress)) {
    throw new Error("The selected offer has no valid supplier wallet address.");
  }

  const { account, publicClient } = getClients();
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < offer.total) {
    throw new Error(
      `Insufficient USDC: need ${formatUsdc(offer.total)}, have ${formatUsdc(balance)}.`,
    );
  }

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [offer.walletAddress, offer.total],
  });
  return submitTaggedTransaction(USDC_ADDRESS, data);
}

export async function registerAgent(agentUri: string): Promise<{ hash: Hex; agentId: bigint }> {
  if (!/^https:\/\//i.test(agentUri) && !/^ipfs:\/\//i.test(agentUri) && !/^data:application\/json,/i.test(agentUri)) {
    throw new Error("AGENT_URI must be an HTTPS URL, IPFS URI, or JSON data URI.");
  }

  const data = encodeFunctionData({
    abi: registerAbi,
    functionName: "register",
    args: [agentUri],
  });
  const hash = await submitTaggedTransaction(IDENTITY_REGISTRY, data);
  const { publicClient } = getClients();
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const [registered] = parseEventLogs({
    abi: registerAbi,
    eventName: "Registered",
    logs: receipt.logs,
  });
  if (!registered) {
    throw new Error(`Registration transaction ${hash} succeeded but emitted no Registered event.`);
  }
  return { hash, agentId: registered.args.agentId };
}

export function procurementWalletAddress(): Address {
  return privateKeyToAccount(getKey()).address;
}
