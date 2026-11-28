import { razorpay, PRICE_PAISE, FULL_PRICE_PAISE, PRODUCT_ID, allowRequest, tooMany } from "./_lib.js";
import { findInfluencer, normalizeCode } from "./_referrals.js";

// Price is decided HERE on the server, so nobody can change it from the browser.
// verify-payment and restore accept any order of at least PRICE_PAISE (the code price).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // A real buyer needs 1–2 orders. 50 leaves room for many buyers sharing one
  // mobile-network IP (Jio/Airtel), while still stopping someone creating thousands.
  if (!allowRequest(req, "create-order", 50, 10 * 60 * 1000)) return tooMany(res);
  // Creator code the buyer came with: a valid one gets the lower price and is saved on the order.
  const rawRef = req.body?.ref;
  let inf = null;
  let codePrice = false;
  if (normalizeCode(rawRef)) {
    try {
      inf = await findInfluencer(rawRef);
      if (!inf) {
        // The page showed the code price, but the code was paused or never existed.
        // Don't silently charge more: tell the page so it can show the real price first.
        return res.status(409).json({ error: "This creator code is no longer active.", codeInvalid: true });
      }
      codePrice = true;
    } catch (err) {
      // Database down: honour the price the buyer was shown, just without crediting anyone.
      console.error("create-order: creator code lookup failed", err.message);
      codePrice = true;
    }
  }
  try {
    const order = await razorpay().orders.create({
      amount: codePrice ? PRICE_PAISE : FULL_PRICE_PAISE,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: inf ? { product: PRODUCT_ID, ref: inf.code } : { product: PRODUCT_ID },
    });
    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("create-order failed", err?.error || err);
    res.status(500).json({ error: "Could not start payment" });
  }
}
