import { razorpay, PRICE_PAISE, PRODUCT_ID, allowRequest, tooMany } from "./_lib.js";

// Price is decided HERE on the server, so nobody can change it from the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // A real buyer needs 1–2 orders; this stops one visitor creating hundreds.
  if (!allowRequest(req, "create-order", 15, 10 * 60 * 1000)) return tooMany(res);
  try {
    const order = await razorpay().orders.create({
      amount: PRICE_PAISE,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { product: PRODUCT_ID },
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
