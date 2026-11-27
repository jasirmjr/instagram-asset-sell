// Shared server helpers. Files starting with "_" are NOT exposed as API routes on Vercel.
import Razorpay from "razorpay";
import crypto from "crypto";

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const PRODUCT_ID = process.env.PRODUCT_ID || "editing-pack-v1";
export const PRICE_PAISE = Math.round(Number(process.env.PRICE_INR || 49) * 100);

function hmac(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// Razorpay's official check: HMAC_SHA256(order_id + "|" + payment_id, key_secret) === signature
export function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = hmac(`${orderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET);
  return safeEqual(expected, signature);
}

// Access token = proof of payment, stored in the buyer's browser.
// Signed with TOKEN_SECRET so nobody can fake one.
export function signToken(paymentId) {
  const payload = Buffer.from(JSON.stringify({ pid: paymentId, prod: PRODUCT_ID, iat: Date.now() })).toString("base64url");
  return `${payload}.${hmac(payload, process.env.TOKEN_SECRET)}`;
}

export function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!safeEqual(hmac(payload, process.env.TOKEN_SECRET), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.prod === PRODUCT_ID ? data : null;
  } catch {
    return null;
  }
}
