import { verifyRazorpaySignature, signToken } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return res.status(400).json({ error: "Payment could not be verified" });
  }
  res.status(200).json({ token: signToken(razorpay_payment_id), paymentId: razorpay_payment_id });
}
