/* Unit test for matchesFunding with synthetic HTLC-shaped txs (no chain needed).
 * Synthetic inputs, real predicate — labeled as such. */
import { normalizeTransaction } from "../lib/nimiq/rpc";
import { matchesFunding } from "../lib/payments/nimbTy-nimiq.service";

const ESCROW = "NQ59 H7FY C7MQ 7401 K8A2 LUGA 51B9 562B ETG9";
const WALLET = "NQ05 F2AR XJ0T JLR1 U505 NXJF CUVU YXLH ES5D";
const CONTRACT = "NQ11 3LDC R80J 040V X5EN K777 KB4R VF6Y VKA0";
const C = { payTo: ESCROW, amountLuna: 500000n, memo: "nimbTy:nab12cd", sender: WALLET };

const cases: [string, object, boolean][] = [
  ["direct basic payment", { hash: "a", sender: WALLET, recipient: ESCROW, value: 500000, blockNumber: 100, senderData: "6e696d6274793a6e616231326364", flags: 0, relatedAddresses: [WALLET, ESCROW] }, true],
  ["HTLC-routed (from=contract, wallet in related)", { hash: "b", sender: CONTRACT, recipient: ESCROW, value: 500000, blockNumber: 101, senderData: "nimbTy:nab12cd", flags: 0, relatedAddresses: [CONTRACT, WALLET, ESCROW] }, true],
  ["contract creation excluded", { hash: "c", sender: WALLET, recipient: CONTRACT, value: 11000000000, blockNumber: 102, flags: 1, toType: 2, relatedAddresses: [WALLET, CONTRACT] }, false],
  ["refund to wallet excluded", { hash: "d", sender: CONTRACT, recipient: WALLET, value: 500000, blockNumber: 103, flags: 0, relatedAddresses: [CONTRACT, WALLET] }, false],
  ["wrong memo rejected", { hash: "e", sender: CONTRACT, recipient: ESCROW, value: 500000, blockNumber: 104, senderData: "hello", flags: 0, relatedAddresses: [CONTRACT, WALLET, ESCROW] }, false],
  ["unconfirmed ignored", { hash: "f", sender: CONTRACT, recipient: ESCROW, value: 500000, blockNumber: null, senderData: "nimbTy:nab12cd", flags: 0, relatedAddresses: [CONTRACT, WALLET, ESCROW] }, false],
  ["stranger tx rejected", { hash: "g", sender: CONTRACT, recipient: ESCROW, value: 500000, blockNumber: 105, senderData: "nimbTy:nab12cd", flags: 0, relatedAddresses: [CONTRACT, ESCROW] }, false],
  ["wrong amount rejected", { hash: "h", sender: WALLET, recipient: ESCROW, value: 499999, blockNumber: 106, senderData: "nimbTy:nab12cd", flags: 0, relatedAddresses: [WALLET, ESCROW] }, false],
];

let fail = 0;
for (const [name, raw, want] of cases) {
  const got = matchesFunding(normalizeTransaction(raw as never), C);
  if (got !== want) { console.log("FAIL", name, "want", want, "got", got); fail++; }
  else console.log("PASS", name);
}
if (fail) process.exit(1);
console.log("HTLC_MATCH_OK");
