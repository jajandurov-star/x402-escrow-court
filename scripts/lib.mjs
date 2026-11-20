// Shared helpers for the X402EscrowCourt demo.
// Keystores are NEVER in this repo: pass their paths via env vars.
// Defaults point at the local test wallets OUTSIDE the repo (same pattern
// as the GenLayer Wizard runner).
import { createClient, createAccount } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import fs from 'node:fs';

export const BUYER_KEYSTORE = process.env.GENLAYER_BUYER_KEYSTORE
  ?? new URL('../../../eoa-testnet/keystore.json', import.meta.url).pathname;
export const SELLER_KEYSTORE = process.env.GENLAYER_SELLER_KEYSTORE
  ?? new URL('../../../eoa-testnet/keystore2.json', import.meta.url).pathname;

export const ESCROW_AMOUNT_WEI = 1_000_000_000_000_000n; // 0.001 GEN

export function loadAccount(keystorePath, expectedAddress) {
  const ks = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
  const pk = ks.private_key.startsWith('0x') ? ks.private_key : '0x' + ks.private_key;
  const account = createAccount(pk);
  if (expectedAddress && account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(`keystore address ${account.address} != expected ${expectedAddress}`);
  }
  return { account, privateKey: pk };
}

export function makeClient() {
  return createClient({ chain: studioDevnet });
}

export async function estimateFees(client, validatorUnits = 200n) {
  const estimate = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 100n,
    validatorTimeunitsAllocation: validatorUnits,
  });
  return { distribution: estimate.distribution, feeValue: estimate.feeValue };
}

export async function writeAndWait(client, args, label) {
  const txHash = await client.writeContract(args);
  console.log(`  [${label}] tx ${txHash}`);
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash, waitUntil: 'decided', interval: 5000, retries: 150,
  });
  const status = receipt?.status ?? receipt?.result?.status ?? 'unknown';
  const exec = receipt?.txExecutionResultName ?? '';
  console.log(`  [${label}] decided, status=${status} exec=${exec}`);
  if (exec === 'FINISHED_WITH_ERROR') {
    const lr = receipt?.consensus_data?.leader_receipt?.[0];
    const err = (lr?.genvm_result?.stderr || '').slice(-1200);
    throw new Error(`[${label}] execution failed:\n${err}`);
  }
  return { txHash, receipt };
}

// Extract the deployed contract address from a deploy receipt.
// Tries the obvious fields first, then scans the receipt JSON for an
// address that is neither the deployer nor the zero address.
export function findContractAddress(receipt, deployerAddress) {
  const direct = receipt?.contractAddress ?? receipt?.contract_address
    ?? receipt?.data?.contract_address ?? receipt?.data?.contractAddress
    ?? receipt?.address ?? receipt?.result?.contractAddress;
  if (typeof direct === 'string' && /^0x[0-9a-fA-F]{40}$/.test(direct)) return direct;
  const text = JSON.stringify(receipt);
  // (?![0-9a-fA-F]) so a 64-hex tx hash is not mistaken for an address.
  const addrs = [...new Set([...text.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)].map((m) => m[0]))];
  const zero = '0x0000000000000000000000000000000000000000';
  const candidates = addrs.filter((a) => a.toLowerCase() !== zero
    && (!deployerAddress || a.toLowerCase() !== deployerAddress.toLowerCase()));
  return candidates[0] ?? null;
}

export function parseDeal(raw) {
  if (!raw || raw === 'NOT_FOUND') return null;
  const out = {};
  for (const part of String(raw).split('|')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

export async function readDeal(client, address, dealId) {
  const raw = await client.readContract({ address, functionName: 'get_deal', args: [dealId] });
  return parseDeal(raw);
}
