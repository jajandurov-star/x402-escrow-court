# x402 Escrow Court — Internet Court × MetaMask x402 × GenLayer

An AI agent buys a digital deliverable from another agent over **x402** (HTTP 402).
The payment is held in a **GenLayer Intelligent Contract** escrow instead of going
straight to the seller. If the buyer disputes the delivery, the GenLayer validator
jury reads the agreement, the delivery evidence and the dispute reason, and renders
a verdict — **RELEASE** (pay the seller) or **REFUND** (refund the buyer) — and the
contract settles it on-chain.

Built for **GenLayer Mission 101 — "Internet Court: Partner Demo Lab"**
(contribution type: Projects). GenLayer is central to the workflow: without the
jury's verdict, the escrow cannot move.

## Partner: MetaMask x402 — why this one

The Internet Court is an open standard founded by the GenLayer Foundation with
27 firms, including **MetaMask, OKX, Matter Labs (ZKsync) and 0G Labs** (later
reports count 35 consortium members, adding NEAR, ConsenSys and UMA). Each partner
fills a role in the Court's lifecycle: discovery, negotiation, contract, payment
and escrow, execution, verification and disputes.

| Partner | Role in the Court | Why not picked for this demo |
|---|---|---|
| **MetaMask x402** | Payment rails: Smart Accounts Kit + x402 Facilitator, bounded/revocable spending authority for agents | **Picked** — see below |
| ZKsync / Matter Labs | Settlement chain (ZK Stack) | Infrastructure layer, not an integration surface for a small demo |
| 0G Labs | Staked timestamping of real-world events (evidence) | Real, but needs its own testnet onboarding (faucet, indexer, SDK) — a multi-hour risk on its own |
| Collective Memory | Photo authentication for payment | No public API/SDK to integrate with |
| argue.fun | Agents debate, GenLayer resolves | No public API; the concept is re-implemented here in spirit (see below) |
| UMA / Kleros | Appeal layer for disputed verdicts | Appeal path, not the core payment→verdict flow |
| OKX | AI agent marketplace | Needs exchange API keys and an account |

**MetaMask x402 was picked because:**
1. **Public, documented protocol.** x402 is an open standard (HTTP `402` + payment
   requirements + signed payment authorization); MetaMask documents the flow,
   the Smart Accounts Kit API (`createx402DelegationProvider`, `x402Erc7710Client`)
   and the ERC-7710 delegation model at `docs.metamask.io`.
2. **It is the Court's payment leg.** MetaMask supplies the account and payment
   rails of the Internet Court lifecycle — exactly the step this demo puts under
   escrow.
3. **Buildable and verifiable in hours.** The x402 v1 handshake (402 offer →
   EIP-3009 authorization → verify → settle) can be implemented faithfully with
   plain HTTP + a real ECDSA signature, and the settlement is a real GenLayer
   contract call — no mainnet funds, no exchange account, no facilitator API key.

**Honest scope note.** The x402 settlement in this demo happens in the GenLayer
escrow contract on Studio testnet (GEN), not through MetaMask's hosted facilitator
or a MetaMask Smart Account — there is no USDC and no facilitator on chain 61997.
What is real and protocol-faithful: the `402` offer format, the EIP-3009
`TransferWithAuthorization` signature (created with the buyer's key, verified by
`recoverTypedDataAddress` on the seller side), and the verify-then-deliver gate.
The seller in this repo is a local demo facilitator implementing the x402
verify/settle interface; the README of the demo marks exactly that. Swapping the
local facilitator for MetaMask's x402 Facilitator on an EVM chain is the production
step — the contract side does not change.

## How it works

```
Buyer agent                              Seller agent (x402 endpoint)
    │                                          │
    │  GET /report                             │
    │ ────────────────────────────────────────>│
    │  HTTP 402 + paymentRequirements          │
    │ <────────────────────────────────────────│
    │  (scheme eip3009, network                │
    │   genlayer-studio-61997, amount 0.001    │
    │   GEN, payTo = escrow contract)          │
    │                                          │
    │  create_deal() + 0.001 GEN ──> GenLayer escrow contract
    │  sign EIP-3009 authorization             │
    │                                          │
    │  POST /report + X-PAYMENT header         │
    │ ────────────────────────────────────────>│
    │        seller verifies signature +       │
    │        on-chain escrow FUNDED            │
    │  200 + deliverable + evidence            │
    │ <────────────────────────────────────────│
    │                                          │
    │                  seller: submit_delivery(evidence) ──> escrow
    │  buyer: dispute(reason) ─────────────────────────────> escrow
    │  judge() ──> GenLayer validator jury (LLM, comparative
    │              consensus) ──> RELEASE / REFUND ──> escrow pays
    │              the winner on-chain
```

The demo scripts a dispute that is **wrong on the facts** (the buyer claims the
LST comparison is missing; the delivered brief contains it). The jury is supposed
to catch that — and it does (see *Verified run* below).

## Repository layout

```
contracts/
  X402EscrowCourt.py      Intelligent Contract (Python, GenVM v0.4)
scripts/
  lib.mjs                 shared helpers (accounts, fees, receipts)
  deploy.mjs              deploy the contract alone
  demo.mjs                full end-to-end demo (x402 server + escrow + verdict)
deployments/
  studio-dev.json         latest deployment (address + tx)
  demo-run.json           machine-readable summary of the last demo run
```

## Setup

```bash
npm install
```

Node 18+ required. The demo needs two GenLayer Studio testnet wallets with a
little GEN (fees + 0.001 GEN escrow). Point the scripts at their keystores —
**keystores are never committed**:

```bash
export GENLAYER_BUYER_KEYSTORE=/path/to/buyer-keystore.json
export GENLAYER_SELLER_KEYSTORE=/path/to/seller-keystore.json
```

Keystore format: `{"private_key": "0x..."}` (same as the GenLayer Wizard runner).
Defaults point at `../../eoa-testnet/keystore*.json` (outside this repo) when the
env vars are unset. The demo runs against Studio testnet (chain 61997) through
`genlayer-js@2.0.0-rc.3`; if your network needs an egress proxy, run with
`NODE_USE_ENV_PROXY=1`.

## Run

```bash
# Deploy only
npm run deploy

# Full demo: deploy + x402 402 flow + escrow + delivery + dispute + jury verdict
npm run demo
```

The demo deploys a fresh escrow contract on every run, then prints each step.
Total runtime is a few minutes (validator consensus per write; the jury call is
the slowest). A `deployments/demo-run.json` summary is written at the end.

## The contract

`contracts/X402EscrowCourt.py` — one escrow court, many deals:

| Method | Who | What |
|---|---|---|
| `create_deal(deal_id, seller, agreement)` | buyer, payable | Funds the escrow with `message.value`; status `FUNDED` |
| `submit_delivery(deal_id, evidence)` | seller | Stores delivery evidence; status `DELIVERED` |
| `confirm_delivery(deal_id)` | buyer | Happy path: status `RELEASED`, escrow pays the seller |
| `dispute(deal_id, reason)` | buyer | Status `DISPUTED` |
| `judge(deal_id)` | anyone | Jury verdict; status `RELEASED`/`REFUNDED`, escrow pays the winner |
| `get_deal(deal_id)` / `get_verdict(deal_id)` | anyone, view | Deal state / verdict |

Verdict mechanism: `eq_principle.prompt_comparative` — every validator judges
the delivery against the agreement with an LLM and must return the same
`RELEASE`/`REFUND` outcome. (Deliberate choice: `prompt_non_comparative` pipes
the leader's output through a second LLM template and returns prose, which cannot
be parsed into a strict token — the AgentPact contract on Studio documents the
same lesson.)

Payout: `chain.Account(addr).emit_transfer(value=...)`. The transfer is an async
message — it finalizes ~1–2 minutes after the verdict transaction is decided.
The demo polls the escrow balance until it is empty before reporting.

## Verified run (Studio testnet, chain 61997, 2026-11-21)

```
[1] accounts — buyer 0xa25a…b906 | seller 0xE136…2D0d
[2] deploying X402EscrowCourt … escrow contract: 0xCBbBB8740ddB2DDF9438cf1b4fE2888eA5EBa4dd
      (deploy tx 0x97ec267c184c246cd4df12772431c0866be6a255a0a1b872dc55100521f1bbce)
[4] buyer requests the brief → HTTP 402 (payment required)
[5] buyer funds the escrow (create_deal, 0.001 GEN) + signs the x402 authorization
[6] buyer presents payment → seller verifies signature + escrow → delivers (HTTP 200)
[7] seller submits delivery evidence on-chain (submit_delivery)
[8] buyer disputes: "The brief is missing the promised SOL liquid-staking comparison section."
[9] GenLayer jury judges the dispute (judge)
[10] deal status: RELEASED
      verdict: RELEASE – the brief includes the required top-3 SOL DeFi yields,
      a comparison of three SOL liquid-staking tokens (jitoSOL, mSOL, bSOL),
      and risk notes, thus fulfilling the agreement.
      escrow balance after settlement: 0 GEN
      buyer balance: 24.994539861749974 GEN (was 24.995902898499978)
      seller balance: 20.00128791974999 GEN (was 20.00036655049999)
```

Transaction hashes (all on Studio testnet 61997): deploy `0x97ec26…`, fund
`0x2baa88…`, delivery `0xe02752…`, dispute `0xfe16b7…`, judge `0x376607…`.
Full detail: `deployments/demo-run.json`.

The seller received the 0.001 GEN escrow (its balance rose by the escrow minus
its own `submit_delivery` fee); the buyer paid the escrow plus its own fees.
The jury correctly rejected the frivolous dispute.

## GenVM v0.4 notes (found the hard way, 2026-11-21)

Studio-dev runs genvm v0.4 (runner `py-genlayer:kzybg95x1gn21dw72m7hyg0maaap04n4nx55j9yt6fkdqxtz6bz0`).
The public docs still show the v0.3 patterns, which **do not work** here:

- There is **no `gl` namespace**: `from genlayer import *` does not define `gl`,
  `import genlayer.gl` fails (`No module named 'genlayer.gl'`), `from genlayer import gl`
  fails. Use the flat names: `contract.Contract`, `@public.view`,
  `@public.write`, `@public.write.payable`, `message`, `eq_principle`, `chain`,
  `Address`, `u256`.
- **No plain `dict` in storage**: `dict[str, X]` fields fail with
  `use TreeMap instead of a dict`. Use `storage.TreeMap[K, V]` fields, allocated
  in `__init__` with `storage.inmem_allocate(storage.TreeMap[K, V])`
  (calling `TreeMap()` directly fails: "generic storage classes can not be
  instantiated with __init__").
- `prompt_non_comparative(fn, task, criteria)`: `task`/`criteria` are
  **keyword-only** in the SDK signature — passing them positionally raises
  `takes 1 positional argument but 3 were given`. (And for a strict verdict
  token, prefer `prompt_comparative` — see above.)
- `chain.Account(addr).emit_transfer(value=...)` is the v0.4 way to send value
  (replaces `gl.contract.get_at(addr).emit_transfer(...)`).
- A "decided" receipt is not enough: check `txExecutionResultName` — a deploy
  can be `ACCEPTED` yet `FINISHED_WITH_ERROR` (e.g. a contract import error).
  The leader receipt's `genvm_result.stderr` holds the real Python traceback.

## Demo video

`VIDEO_PLAN.md` — shot-by-shot 45-second plan built from the verified run above
(real contract address, real verdict text, real balances). The video shows the
Internet Court, GenLayer and MetaMask logos.

## License

MIT — see `LICENSE`.
