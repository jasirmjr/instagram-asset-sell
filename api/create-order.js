import { razorpay, PRICE_PAISE, PRODUCT_ID, allowRequest, tooMany } from "./_lib.js";
import { findInfluencer } from "./_referrals.js";

// Price is decided HERE on the server, so nobody can change it from the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // A real buyer needs 1–2 orders. 50 leaves room for many buyers sharing one
  // mobile-network IP (Jio/Airtel), while still stopping someone creating thousands.
  if (!allowRequest(req, "create-order", 50, 10 * 60 * 1000)) return tooMany(res);
  // Creator code the buyer came with. Only active influencers' codes are saved; anything else is ignored.
  // If the database is down, sell anyway without the code rather than block the buyer.
  const inf = await findInfluencer(req.body?.ref).catch((err) => {
    console.error("create-order: creator code lookup failed", err.message);
    return null;
  });
  try {
    const order = await razorpay().orders.create({
      amount: PRICE_PAISE,
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
