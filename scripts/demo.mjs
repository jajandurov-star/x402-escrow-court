// X402EscrowCourt — end-to-end demo.
//   Buyer agent buys "Agent Market Brief #42" from a seller agent over x402.
//   Payment (0.001 GEN) is held in the GenLayer escrow contract; the seller
//   delivers, the buyer disputes, and the GenLayer validator jury judges.
//   The contract then releases the escrow to the seller or refunds the buyer.
//
// Usage: node scripts/demo.mjs
//   Keystores come from env (GENLAYER_BUYER_KEYSTORE / GENLAYER_SELLER_KEYSTORE)
//   and default to the local test wallets OUTSIDE this repo. No secrets are
//   written anywhere by this script.
//
// Run with: NODE_USE_ENV_PROXY=1 node scripts/demo.mjs
import http from 'node:http';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  loadAccount, makeClient, estimateFees, writeAndWait, readDeal,
  findContractAddress, ESCROW_AMOUNT_WEI, BUYER_KEYSTORE, SELLER_KEYSTORE,
} from './lib.mjs';

const BUYER_ADDR = '0xa25a0754cCa4c3430e11E455F52FFF7130DCb906';
const SELLER_ADDR = '0xE13641FcCd5d7AA40D6F6B6C3D70081d4f512D0d';
const DEAL_ID = 'deal-1';
const PORT = 8091;

const AGREEMENT = 'Deliver Agent Market Brief #42 covering: (1) top-3 SOL DeFi yields with APYs, '
  + '(2) a SOL liquid-staking comparison of at least 3 LSTs, (3) risk notes. '
  + 'Delivery within this session as JSON.';

const REPORT = {
  title: 'Agent Market Brief #42',
  yields: [
    { protocol: 'Kamino', apy: '8.2%' },
    { protocol: 'Marginfi', apy: '7.1%' },
    { protocol: 'Drift', apy: '6.4%' },
  ],
  lstComparison: [
    { lst: 'jitoSOL', apy: '7.9%', fee: '4% of rewards', liquidity: 'deep' },
    { lst: 'mSOL', apy: '7.4%', fee: '0%', liquidity: 'deep' },
    { lst: 'bSOL', apy: '7.6%', fee: '0%', liquidity: 'moderate' },
  ],
  risks: ['smart-contract risk', 'LST depeg risk', 'validator concentration risk'],
};
const EVIDENCE = 'Delivered Agent Market Brief #42: top-3 SOL DeFi yields '
  + '(Kamino 8.2%, Marginfi 7.1%, Drift 6.4%); LST comparison '
  + '(jitoSOL vs mSOL vs bSOL: APY, fees, liquidity); risk notes '
  + '(smart-contract risk, depeg risk, validator concentration).';
// Scripted dispute: wrong on the facts — the brief DOES contain the LST
// comparison. The court should protect the honest seller (RELEASE).
const DISPUTE_REASON = 'The brief is missing the promised SOL liquid-staking comparison section.';

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

async function main() {
  const buyer = loadAccount(BUYER_KEYSTORE, BUYER_ADDR);
  const seller = loadAccount(SELLER_KEYSTORE, SELLER_ADDR);
  const client = makeClient();
  const summary = { dealId: DEAL_ID, amountWei: ESCROW_AMOUNT_WEI.toString() };

  step(1, `accounts — buyer ${buyer.account.address} | seller ${seller.account.address}`);
  const balBefore = {};
  for (const [name, addr] of [['buyer', BUYER_ADDR], ['seller', SELLER_ADDR]]) {
    balBefore[name] = await client.getBalance({ address: addr });
    console.log(`  ${name} balance: ${Number(balBefore[name]) / 1e18} GEN`);
  }

  step(2, 'deploying X402EscrowCourt to Studio testnet (chain 61997)…');
  const code = fs.readFileSync(new URL('../contracts/X402EscrowCourt.py', import.meta.url), 'utf8');
  const deployFees = await estimateFees(client, 200n);
  const deployTx = await client.deployContract({ account: buyer.account, code, fees: deployFees });
  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTx, waitUntil: 'decided', interval: 5000, retries: 150,
  });
  const escrow = findContractAddress(deployReceipt, buyer.account.address);
  if (!escrow) throw new Error('deploy receipt has no contract address');
  console.log(`  escrow contract: ${escrow} (deploy tx ${deployTx})`);
  summary.contract = escrow;
  summary.deployTx = deployTx;

  // ---- x402 seller endpoint (MetaMask x402 protocol, v1) ----
  step(3, `starting x402 seller on http://127.0.0.1:${PORT}/report`);
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/report') { res.writeHead(404); res.end('not found'); return; }
    const payment = req.headers['x-payment'];
    if (!payment) {
      // No payment attached: HTTP 402 with the payment requirements.
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        x402Version: 1,
        error: 'Payment Required',
        accepts: [{
          scheme: 'eip3009',
          network: 'genlayer-studio-61997',
          amount: ESCROW_AMOUNT_WEI.toString(),
          asset: 'GEN',
          payTo: escrow,
          description: 'Agent Market Brief #42 — SOL DeFi yields, LST comparison, risk notes',
          mimeType: 'application/json',
          maxTimeoutSeconds: 3600,
        }],
      }));
      return;
    }
    try {
      const { payload } = unb64(payment);
      const auth = payload.authorization;
      const domain = { name: 'GEN', version: '1', chainId: 61997, verifyingContract: escrow };
      const message = {
        from: auth.from, to: auth.to,
        value: BigInt(auth.value), validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore), nonce: auth.nonce,
      };
      const signer = await recoverTypedDataAddress({
        domain, types: EIP3009_TYPES, primaryType: 'TransferWithAuthorization',
        message, signature: payload.signature,
      });
      const now = BigInt(Math.floor(Date.now() / 1000));
      const deal = await readDeal(client, escrow, DEAL_ID);
      const ok = signer.toLowerCase() === BUYER_ADDR.toLowerCase()
        && auth.to.toLowerCase() === escrow.toLowerCase()
        && BigInt(auth.value) === ESCROW_AMOUNT_WEI
        && message.validBefore > now
        && deal?.status === 'FUNDED';
      if (!ok) throw new Error(`verification failed (signer=${signer} deal=${deal?.status})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ report: REPORT, deliveryEvidence: EVIDENCE }));
    } catch (e) {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ x402Version: 1, error: String(e).slice(0, 200) }));
    }
  });
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  try {
    step(4, 'buyer requests the brief → HTTP 402 (payment required)');
    const r402 = await fetch(`http://127.0.0.1:${PORT}/report`);
    console.log(`  status: ${r402.status}`);
    const req402 = await r402.json();
    console.log(`  accepts: ${JSON.stringify(req402.accepts[0])}`);
    summary.x402Offer = req402.accepts[0];

    step(5, 'buyer funds the escrow (create_deal, 0.001 GEN) + signs the x402 authorization');
    const fundFees = await estimateFees(client, 200n);
    const { txHash: fundTx } = await writeAndWait(client, {
      account: buyer.account, address: escrow, functionName: 'create_deal',
      args: [DEAL_ID, SELLER_ADDR, AGREEMENT], value: ESCROW_AMOUNT_WEI, fees: fundFees,
    }, 'create_deal');
    summary.fundTx = fundTx;
    const auth = {
      from: BUYER_ADDR, to: escrow,
      value: ESCROW_AMOUNT_WEI.toString(), validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 3600),
      nonce: '0x' + randomBytes(32).toString('hex'),
    };
    const domain = { name: 'GEN', version: '1', chainId: 61997, verifyingContract: escrow };
    const viemBuyer = privateKeyToAccount(buyer.privateKey);
    const signature = await viemBuyer.signTypedData({
      domain, types: EIP3009_TYPES, primaryType: 'TransferWithAuthorization',
      message: {
        ...auth, value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore),
      },
    });
    console.log(`  EIP-3009 authorization signed: ${signature.slice(0, 18)}…`);

    step(6, 'buyer presents payment → seller verifies signature + escrow → delivers');
    const r200 = await fetch(`http://127.0.0.1:${PORT}/report`, {
      headers: {
        'X-PAYMENT': b64({
          x402Version: 1, scheme: 'eip3009', network: 'genlayer-studio-61997',
          payload: { signature, authorization: auth },
        }),
      },
    });
    console.log(`  status: ${r200.status}`);
    if (r200.status !== 200) throw new Error('seller rejected payment: ' + (await r200.text()).slice(0, 300));
    const delivered = await r200.json();
    console.log(`  delivered: ${delivered.report.title} — yields: ${delivered.report.yields.map((y) => y.protocol + ' ' + y.apy).join(', ')}`);
    console.log(`  LST comparison rows: ${delivered.report.lstComparison.length} (jitoSOL, mSOL, bSOL)`);

    step(7, 'seller submits delivery evidence on-chain (submit_delivery)');
    const delFees = await estimateFees(client, 200n);
    const { txHash: delTx } = await writeAndWait(client, {
      account: seller.account, address: escrow, functionName: 'submit_delivery',
      args: [DEAL_ID, EVIDENCE], fees: delFees,
    }, 'submit_delivery');
    summary.deliveryTx = delTx;

    step(8, 'buyer disputes (scripted, wrong on the facts)');
    console.log(`  reason: "${DISPUTE_REASON}"`);
    const disFees = await estimateFees(client, 200n);
    const { txHash: disTx } = await writeAndWait(client, {
      account: buyer.account, address: escrow, functionName: 'dispute',
      args: [DEAL_ID, DISPUTE_REASON], fees: disFees,
    }, 'dispute');
    summary.disputeTx = disTx;

    step(9, 'GenLayer jury judges the dispute (judge) — LLM verdict by validator consensus');
    const judgeFees = await estimateFees(client, 600n);
    const { txHash: judgeTx } = await writeAndWait(client, {
      account: buyer.account, address: escrow, functionName: 'judge',
      args: [DEAL_ID], fees: judgeFees,
    }, 'judge');
    summary.judgeTx = judgeTx;

    step(10, 'verdict + settlement');
    const deal = await readDeal(client, escrow, DEAL_ID);
    console.log(`  deal status: ${deal.status}`);
    console.log(`  verdict: ${deal.verdict}`);
    summary.finalDeal = deal;
    // The payout is an async message: the verdict tx is decided first, and
    // the transfer to the winner finalizes ~1-2 min later on Studio devnet.
    // Poll until the escrow is empty (max 3 min) before reporting balances.
    let escrowBal = await client.getBalance({ address: escrow });
    for (let i = 0; escrowBal > 0n && i < 18; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      escrowBal = await client.getBalance({ address: escrow });
    }
    console.log(`  escrow balance after settlement: ${Number(escrowBal) / 1e18} GEN`);
    for (const [name, addr] of [['buyer', BUYER_ADDR], ['seller', SELLER_ADDR]]) {
      const after = await client.getBalance({ address: addr });
      console.log(`  ${name} balance: ${Number(after) / 1e18} GEN (was ${Number(balBefore[name]) / 1e18})`);
      summary[`${name}BalanceAfterWei`] = after.toString();
    }
    summary.escrowBalanceAfterWei = escrowBal.toString();
    if (escrowBal > 0n) throw new Error('settlement did not land within 3 min (escrow still funded)');
  } finally {
    server.close();
  }

  fs.writeFileSync(
    new URL('../deployments/demo-run.json', import.meta.url),
    JSON.stringify(summary, null, 2),
  );
  console.log('\nDone. Summary saved to deployments/demo-run.json');
}

main().catch((e) => { console.error('DEMO FAILED:', e); process.exit(1); });
