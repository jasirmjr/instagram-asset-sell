// Shared server helpers. Files starting with "_" are NOT exposed as API routes on Vercel.
import Razorpay from "razorpay";
import crypto from "crypto";

// Created on first use, so a missing key fails only the route that needs Razorpay
// instead of crashing every route (including /api/access and /api/download).
let client;
export function razorpay() {
  if (!client) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
    }
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

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
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  if (![orderId, paymentId, signature].every((v) => typeof v === "string" && v)) return false;
  return safeEqual(hmac(`${orderId}|${paymentId}`, secret), signature);
}

// Access token = proof of payment, stored in the buyer's browser.
// Signed with TOKEN_SECRET so nobody can fake one.
export function signToken(paymentId) {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) throw new Error("TOKEN_SECRET is not set");
  const payload = Buffer.from(JSON.stringify({ pid: paymentId, prod: PRODUCT_ID, iat: Date.now() })).toString("base64url");
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifyToken(token) {
  const secret = process.env.TOKEN_SECRET;
  if (!secret || typeof token !== "string" || token.length > 2000) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!safeEqual(hmac(payload, secret), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.prod === PRODUCT_ID ? data : null;
  } catch {
    return null;
  }
}

// Simple per-visitor rate limit. Kept in memory, so it is per server instance:
// it stops one person hammering a route, not a large distributed attack
// (Vercel's firewall handles that).
const hits = new Map();
export function allowRequest(req, route, limit, windowMs) {
  const ip =
    String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const key = `${route}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return allowed;
}

export function tooMany(res) {
  res.setHeader("Retry-After", "600");
  return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
}

// Razorpay being down or rate-limiting us is not the buyer's fault: say "try again", not "not found".
export function isRazorpayOutage(err) {
  const code = err?.statusCode ?? err?.status;
  return code === 429 || code >= 500 || !code;
}
