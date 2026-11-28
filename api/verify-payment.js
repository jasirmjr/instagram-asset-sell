import { verifyRazorpaySignature, signToken, razorpay, PRODUCT_ID, PRICE_PAISE, isRazorpayOutage } from "./_lib.js";
import { recordSale } from "./_referrals.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return res.status(400).json({ error: "Payment could not be verified" });
  }

  // The signature proves the payment belongs to an order on this Razorpay account.
  // Also make sure that order was for THIS pack at THIS price, so a payment for a
  // cheaper product on the same account can't unlock it.
  let order;
  try {
    order = await razorpay().orders.fetch(razorpay_order_id);
    if (order.notes?.product !== PRODUCT_ID || order.amount < PRICE_PAISE) {
      return res.status(400).json({ error: "Payment could not be verified" });
    }
  } catch (err) {
    console.error("verify-payment order check failed", err?.error || err);
    return res
      .status(isRazorpayOutage(err) ? 503 : 400)
      .json({ error: "Payment could not be verified right now" });
  }

  // Credit the influencer. Never block the buyer's download on this: the webhook records it too.
  if (order.notes?.ref) {
    await recordSale({ ...order, amount_paid: order.amount_paid || order.amount }, razorpay_payment_id).catch((err) =>
      console.error("recordSale failed (webhook will retry)", err.message)
    );
  }

  res.status(200).json({ token: signToken(razorpay_payment_id), paymentId: razorpay_payment_id });
}
