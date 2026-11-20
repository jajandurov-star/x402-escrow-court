// Deploy X402EscrowCourt to GenLayer Studio testnet (chain 61997).
// Usage: node scripts/deploy.mjs
// Writes the contract address to deployments/studio-dev.json
import fs from 'node:fs';
import {
  loadAccount, makeClient, estimateFees, findContractAddress,
  BUYER_KEYSTORE,
} from './lib.mjs';

const BUYER = '0xa25a0754cCa4c3430e11E455F52FFF7130DCb906';

const { account } = loadAccount(BUYER_KEYSTORE, BUYER);
console.log(`deployer ${account.address}`);

const code = fs.readFileSync(new URL('../contracts/X402EscrowCourt.py', import.meta.url), 'utf8');
const client = makeClient();
const fees = await estimateFees(client, 200n);
console.log(`fee estimate: feeValue=${fees.feeValue}`);

const txHash = await client.deployContract({ account, code, fees });
console.log(`deploy tx ${txHash}`);

const receipt = await client.waitForTransactionReceipt({
  hash: txHash, waitUntil: 'decided', interval: 5000, retries: 150,
});
console.log('receipt status:', receipt?.status ?? receipt?.result?.status ?? 'unknown');
fs.writeFileSync(
  new URL('../deployments/receipt.json', import.meta.url),
  JSON.stringify(receipt, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2),
);

const address = findContractAddress(receipt, account.address);
if (!address) {
  console.error('ERROR: could not find deployed contract address in receipt (see deployments/receipt.json)');
  process.exit(4);
}
console.log(`contract deployed at ${address}`);
const out = {
  network: 'studio-dev', chainId: 61997, address,
  deployTx: txHash, deployer: account.address,
  deployedAtUtc: new Date().toISOString(),
};
fs.writeFileSync(
  new URL('../deployments/studio-dev.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log('saved deployments/studio-dev.json');
