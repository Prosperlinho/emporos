import { encodeFunctionData, parseEventLogs, type Hex, type PublicClient } from "viem";
import { IDENTITY_REGISTRY } from "./chain/config.ts";
import { assertCelo, PaymentError, sendTagged, type Signer } from "./chain/tx.ts";

export const identityRegistryAbi = [
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
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

/** Register the agent in the ERC-8004 Identity Registry. The signer becomes the ERC-721 owner. */
export async function registerAgent(signer: Signer, publicClient: PublicClient, agentURI: string): Promise<{ agentId: string; hash: Hex }> {
  if (!/^https:\/\//i.test(agentURI)) throw new PaymentError("config", "The agent registration URI must be HTTPS so the registry can resolve it.");
  await assertCelo(signer);
  const hash = await sendTagged(signer, publicClient, {
    to: IDENTITY_REGISTRY,
    data: encodeFunctionData({ abi: identityRegistryAbi, functionName: "register", args: [agentURI] }),
  });
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const [event] = parseEventLogs({ abi: identityRegistryAbi, eventName: "Registered", logs: receipt.logs });
  if (!event) throw new PaymentError("unknown", `Registration ${hash} confirmed but emitted no Registered event.`, hash);
  return { agentId: event.args.agentId.toString(), hash };
}
