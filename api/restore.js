import { razorpay, signToken, PRODUCT_ID, PRICE_PAISE } from "./_lib.js";

// Lets a buyer unlock on a new phone/browser using either:
//  - their Razorpay Payment ID (pay_XXXX, in the Razorpay receipt email), or
//  - the UPI transaction ID / UTR (12 digits, shown in GPay / PhonePe / Paytm).
// Checks with Razorpay directly, so no database is needed.

const LOOKBACK_DAYS = 180; // how far back to search when restoring by UPI transaction ID
const MAX_PAGES = 20; // 100 payments per page

async function findPaymentByUpiRef(ref) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - LOOKBACK_DAYS * 24 * 60 * 60;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items = [] } = await razorpay.payments.all({ from, to, count: 100, skip: page * 100 });
    const hit = items.find(
      (p) => p.acquirer_data?.rrn === ref || p.acquirer_data?.upi_transaction_id === ref
    );
    if (hit) return hit;
    if (items.length < 100) break;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const input = String(req.body?.paymentId || "").replace(/\s+/g, "");
  const isPaymentId = /^pay_[A-Za-z0-9]+$/.test(input);
  const isUpiRef = /^\d{10,16}$/.test(input);
  if (!isPaymentId && !isUpiRef) {
    return res.status(400).json({
      error: "Enter your Payment ID (starts with pay_) or the 12-digit UPI transaction ID from your UPI app",
    });
  }
  const notFound = isUpiRef
    ? "No completed purchase found for this UPI transaction ID"
    : "No completed purchase found for this Payment ID";
  try {
    const payment = isPaymentId ? await razorpay.payments.fetch(input) : await findPaymentByUpiRef(input);
    if (!payment?.order_id || payment.status !== "captured") {
      return res.status(404).json({ error: notFound });
    }
    const order = await razorpay.orders.fetch(payment.order_id);
    const valid =
      order.status === "paid" &&
      order.notes?.product === PRODUCT_ID &&
      order.amount_paid >= PRICE_PAISE;
    if (!valid) return res.status(404).json({ error: notFound });
    res.status(200).json({ token: signToken(payment.id), paymentId: payment.id });
  } catch (err) {
    console.error("restore failed", err?.error || err);
    res.status(404).json({ error: notFound });
  }
}
