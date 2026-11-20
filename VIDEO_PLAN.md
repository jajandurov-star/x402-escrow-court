# VIDEO PLAN — x402 Escrow Court (45 seconds max)

Mission 101 requires: polished, edited (not a raw screen recording), max 45s,
and the three logos on screen — **Internet Court, GenLayer, MetaMask (x402)**.
This plan is built from the verified demo run of 2026-11-21 (Studio testnet,
chain 61997). All on-screen values below are real output from that run, not
mockups: escrow `0xCBbBB8740ddB2DDF9438cf1b4fE2888eA5EBa4dd`,
verdict `RELEASE – the brief includes the required top-3 SOL DeFi yields…`,
escrow settled to `0 GEN`, seller `20.00036… → 20.00128… GEN`.

## Assets needed before editing
- Screen capture of `npm run demo` (terminal) — the 10 steps, real output.
- Screen capture of the Studio explorer page for the judge tx
  `0x37660797508773438c6fbc69bea04ebb550e361efda56ddd3f4a326db4253eac`
  (optional, 1 cutaway).
- Logos (PNG with transparency): Internet Court, GenLayer, MetaMask.
  Sources: GenLayer portal/brand assets, MetaMask brand kit
  (`metamask.io` brand page), Internet Court launch assets.
- Background music: neutral, upbeat, low volume. No voiceover actor needed —
  the voiceover lines below are short and can be AI-narrated or captioned.

## Shots (total 45s)

| Time | Visual | On-screen text | Voiceover / caption |
|---|---|---|---|
| 0:00–0:03 | Title card, dark navy + gold. Three logos in a row: **Internet Court · GenLayer · MetaMask x402**. | `x402 Escrow Court` / `When agents pay, who judges?` | "Agents pay each other at machine speed. But who judges when a deal goes wrong?" |
| 0:03–0:08 | Terminal: demo steps [1]–[4]. Highlight the `402` response JSON: `scheme: eip3009`, `amount: 0.001 GEN`, `payTo: 0xCBbB…Ba4dd`. | `1 · Buyer asks for the brief` / `HTTP 402 — Payment Required` | "A buyer agent orders a market brief. The seller answers: 402 — pay first." |
| 0:08–0:14 | Terminal: step [5]. Highlight `create_deal` tx + `EIP-3009 authorization signed`. Cut to a simple diagram: buyer → escrow vault (0.001 GEN locked). | `2 · Payment goes to escrow, not the seller` / `0.001 GEN locked` | "The payment locks in a GenLayer escrow. The seller can't touch it yet." |
| 0:14–0:19 | Terminal: step [6]. Highlight `status: 200` and the delivered yields `Kamino 8.2%, Marginfi 7.1%, Drift 6.4%`. | `3 · Seller delivers` / `HTTP 200 — brief received` | "Payment verified — the seller delivers the brief." |
| 0:19–0:25 | Terminal: steps [7]–[8]. Highlight the dispute line. Red flash on the word `DISPUTED`. | `4 · Buyer disputes` / `"The LST comparison is missing"` | "Then the buyer disputes — claiming the staking comparison is missing." |
| 0:25–0:35 | Terminal: step [9] `judge` → step [10]. Slow zoom on the verdict lines. Show the jury as 5 validator nodes converging. | `5 · The Internet Court judges` / `RELEASE — the brief DOES contain the LST comparison (jitoSOL, mSOL, bSOL)` | "The GenLayer jury reads the agreement and the evidence — and rules: the brief does contain it. RELEASE." |
| 0:35–0:41 | Terminal: settlement lines. Highlight `escrow balance after settlement: 0 GEN` and `seller balance: 20.00036… → 20.00128… GEN`. Diagram: vault → seller. | `6 · Escrow pays the seller` / `0.001 GEN settled on-chain` | "The escrow pays the seller. No middleman, no chargeback fight." |
| 0:41–0:45 | End card: the three logos again + repo URL. | `Internet Court × GenLayer × MetaMask x402` / `github.com/jajandurov-star/x402-escrow-court` / `Run it: npm run demo` | "x402 Escrow Court. Pay like an agent, judge like a court." |

## Editing notes
- Pace: one idea per shot, no shot longer than 6s except the verdict (10s).
- Every number on screen must match the real run in `deployments/demo-run.json`
  (contract `0xCBbB…Ba4dd`, judge tx `0x376607…`, verdict text verbatim).
- The dispute is scripted and wrong on the facts — say so in the video
  description, not in the 45s (no time). The point is the court catching it.
- Keep the terminal font large (min 20px) — the video will be watched on phones.
- Export: 1080×1920 vertical (YouTube Short) + 1920×1080 horizontal master.
  Mission evidence accepts a YouTube Short link.

## If re-recording the demo
Re-running `npm run demo` deploys a fresh contract and produces new addresses,
tx hashes and balances. If the verdict ever comes back REFUND (it shouldn't —
the evidence contains the LST section), do not edit the verdict: re-run the demo
and use the new, honest output, updating the on-screen values and this plan.
