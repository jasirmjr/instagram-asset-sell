import { razorpay, signToken, PRODUCT_ID, PRICE_PAISE } from "./_lib.js";

// Lets a buyer unlock on a new phone/browser using their Razorpay Payment ID.
// Checks with Razorpay directly, so no database is needed.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const paymentId = String(req.body?.paymentId || "").trim();
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
    return res.status(400).json({ error: "That doesn't look like a valid Payment ID (it starts with pay_)" });
  }
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    if (!payment?.order_id) throw new Error("no order");
    const order = await razorpay.orders.fetch(payment.order_id);
    const valid =
      order.status === "paid" &&
      order.notes?.product === PRODUCT_ID &&
      order.amount_paid >= PRICE_PAISE;
    if (!valid) return res.status(404).json({ error: "No completed purchase found for this Payment ID" });
    res.status(200).json({ token: signToken(paymentId), paymentId });
  } catch (err) {
    console.error("restore failed", err?.error || err);
    res.status(404).json({ error: "No completed purchase found for this Payment ID" });
  }
}
