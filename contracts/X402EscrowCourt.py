# { "Depends": "py-genlayer:kzybg95x1gn21dw72m7hyg0maaap04n4nx55j9yt6fkdqxtz6bz0" }
from genlayer import *

# X402EscrowCourt — the Internet Court escrow for x402 agent payments.
#
# Flow:
#   1. A buyer agent pays for a digital deliverable over x402 (HTTP 402).
#      The payment is held in escrow here, in GEN, instead of going
#      straight to the seller.
#   2. The seller delivers and submits delivery evidence on-chain.
#   3. The buyer confirms (funds released to the seller) or disputes.
#   4. On dispute, the GenLayer validator jury reads the agreement, the
#      delivery evidence and the dispute reason, and renders a verdict:
#      RELEASE (pay the seller) or REFUND (refund the buyer).
#      The verdict is reached with the non-comparative Equivalence
#      Principle: the leader proposes a verdict, validators judge it
#      against the criteria, and the agreed verdict is executed on-chain.
#
# Partner: MetaMask x402 (Internet Court founding partner — payment rails
# via the Smart Accounts Kit and the x402 Facilitator). The demo's seller
# endpoint speaks the x402 v1 protocol (HTTP 402 + EIP-3009 payment
# authorization); settlement happens in this escrow contract on GenLayer.
#
# NOTE on the GenVM v0.4 API (studio-dev, chain 61997): there is no `gl`
# namespace in this runtime. `from genlayer import *` exposes the pieces
# directly: `contract.Contract`, `@public.view`, `@public.write`,
# `@public.write.payable`, `message`, `eq_principle`, `chain`, `Address`,
# `u256`. Verified live against the studio-dev bootloader, 2026-11-21.
class X402EscrowCourt(contract.Contract):
    # GenVM v0.4 storage has no plain dict: mappings are TreeMap,
    # allocated with storage.inmem_allocate(...) in __init__.
    deal_buyer: storage.TreeMap[str, Address]
    deal_seller: storage.TreeMap[str, Address]
    deal_amount: storage.TreeMap[str, u256]
    deal_status: storage.TreeMap[str, str]
    deal_agreement: storage.TreeMap[str, str]
    deal_evidence: storage.TreeMap[str, str]
    deal_reason: storage.TreeMap[str, str]
    deal_verdict: storage.TreeMap[str, str]

    def __init__(self):
        self.deal_buyer = storage.inmem_allocate(storage.TreeMap[str, Address])
        self.deal_seller = storage.inmem_allocate(storage.TreeMap[str, Address])
        self.deal_amount = storage.inmem_allocate(storage.TreeMap[str, u256])
        self.deal_status = storage.inmem_allocate(storage.TreeMap[str, str])
        self.deal_agreement = storage.inmem_allocate(storage.TreeMap[str, str])
        self.deal_evidence = storage.inmem_allocate(storage.TreeMap[str, str])
        self.deal_reason = storage.inmem_allocate(storage.TreeMap[str, str])
        self.deal_verdict = storage.inmem_allocate(storage.TreeMap[str, str])

    def _pay(self, to_addr: Address, amount: u256) -> None:
        # genvm v0.4: send value (only, never runs receiver code).
        chain.Account(to_addr).emit_transfer(value=amount)

    @public.write.payable
    def create_deal(self, deal_id: str, seller: str, agreement: str) -> None:
        if deal_id in self.deal_status:
            raise Exception("deal already exists")
        amount = message.value
        if amount <= 0:
            raise Exception("escrow amount must be > 0")
        self.deal_buyer[deal_id] = message.sender_address
        self.deal_seller[deal_id] = Address(seller)
        self.deal_amount[deal_id] = amount
        self.deal_status[deal_id] = "FUNDED"
        self.deal_agreement[deal_id] = agreement
        self.deal_evidence[deal_id] = ""
        self.deal_reason[deal_id] = ""
        self.deal_verdict[deal_id] = ""

    @public.write
    def submit_delivery(self, deal_id: str, evidence: str) -> None:
        if self.deal_status.get(deal_id, "") != "FUNDED":
            raise Exception("deal is not awaiting delivery")
        if message.sender_address != self.deal_seller.get(deal_id):
            raise Exception("only the seller can submit delivery")
        self.deal_evidence[deal_id] = evidence
        self.deal_status[deal_id] = "DELIVERED"

    @public.write
    def confirm_delivery(self, deal_id: str) -> None:
        if self.deal_status.get(deal_id, "") != "DELIVERED":
            raise Exception("deal is not delivered")
        if message.sender_address != self.deal_buyer.get(deal_id):
            raise Exception("only the buyer can confirm")
        self.deal_status[deal_id] = "RELEASED"
        self._pay(self.deal_seller[deal_id], self.deal_amount[deal_id])

    @public.write
    def dispute(self, deal_id: str, reason: str) -> None:
        if self.deal_status.get(deal_id, "") != "DELIVERED":
            raise Exception("deal is not delivered")
        if message.sender_address != self.deal_buyer.get(deal_id):
            raise Exception("only the buyer can dispute")
        self.deal_reason[deal_id] = reason
        self.deal_status[deal_id] = "DISPUTED"

    @public.write
    def judge(self, deal_id: str) -> None:
        if self.deal_status.get(deal_id, "") != "DISPUTED":
            raise Exception("deal is not disputed")
        agreement = self.deal_agreement[deal_id]
        evidence = self.deal_evidence[deal_id]
        reason = self.deal_reason[deal_id]

        # Comparative consensus (AgentPact pattern): every validator judges
        # independently with the same prompt; the comparative template checks
        # the verdicts agree. prompt_non_comparative would pipe the verdict
        # through a second LLM template and return prose, which cannot be
        # parsed into a strict RELEASE/REFUND token.
        def _judge() -> str:
            return nondet.exec_prompt(
                "You are the judge of an Internet Court escrow dispute.\n\n"
                + "AGREEMENT:\n" + agreement + "\n\n"
                + "DELIVERY EVIDENCE:\n" + evidence + "\n\n"
                + "BUYER DISPUTE:\n" + reason + "\n\n"
                + "Decide whether the delivery satisfies the agreement. "
                + "Answer with exactly one line: RELEASE followed by a one-sentence justification "
                + "if the delivery satisfies the agreement (pay the seller), or REFUND followed by "
                + "a one-sentence justification if it does not (refund the buyer)."
            )

        verdict = eq_principle.prompt_comparative(
            _judge,
            "The two verdicts must reach the same outcome (RELEASE or REFUND) with the same justification.",
        )
        self.deal_verdict[deal_id] = verdict
        amount = self.deal_amount[deal_id]
        if verdict.strip().upper().startswith("RELEASE"):
            self.deal_status[deal_id] = "RELEASED"
            self._pay(self.deal_seller[deal_id], amount)
        else:
            self.deal_status[deal_id] = "REFUNDED"
            self._pay(self.deal_buyer[deal_id], amount)

    @public.view
    def get_deal(self, deal_id: str) -> str:
        status = self.deal_status.get(deal_id, "")
        if status == "":
            return "NOT_FOUND"
        return (
            "deal_id=" + deal_id
            + "|status=" + status
            + "|buyer=" + str(self.deal_buyer[deal_id])
            + "|seller=" + str(self.deal_seller[deal_id])
            + "|amount_wei=" + str(self.deal_amount[deal_id])
            + "|agreement=" + self.deal_agreement[deal_id]
            + "|evidence=" + self.deal_evidence[deal_id]
            + "|reason=" + self.deal_reason[deal_id]
            + "|verdict=" + self.deal_verdict[deal_id]
        )

    @public.view
    def get_verdict(self, deal_id: str) -> str:
        return self.deal_verdict.get(deal_id, "")
