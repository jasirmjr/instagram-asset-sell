import crypto from "crypto";
import { razorpay } from "./_lib.js";
import { recordSale, markRefunded, safeEqual } from "./_referrals.js";

// Razorpay calls this directly (Dashboard → Webhooks), so a sale is credited to the influencer
// even if the buyer closed the page before /api/verify-payment ran.
// Events: payment.captured, refund.processed

// Vercel buffers the body and replays it to "data"/"end" listeners, so listen for those
// (not `for await`). Don't read req.body here: it is the parsed JSON, not the exact bytes.
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("webhook: RAZORPAY_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Not configured" });
  }

  // The signature is over the exact bytes Razorpay sent, so read the raw body.
  const body = await rawBody(req);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (!safeEqual(expected, req.headers["x-razorpay-signature"] || "")) {
    return res.status(400).json({ error: "Bad signature" });
  }

  let event;
  try { event = JSON.parse(body); } catch { return res.status(400).json({ error: "Bad body" }); }

  try {
    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        const order = await razorpay().orders.fetch(payment.order_id);
        // The order may not show "paid" yet at this instant; the captured payment is the proof.
        await recordSale({ ...order, amount_paid: payment.amount }, payment.id);
      }
    } else if (event.event === "refund.processed") {
      const paymentId = event.payload?.refund?.entity?.payment_id;
      if (paymentId) {
        const payment = await razorpay().payments.fetch(paymentId);
        if (payment?.order_id) {
          const order = await razorpay().orders.fetch(payment.order_id);
          if (order.notes?.ref) {
            // The sale may not be saved yet (its own webhook can arrive later or be retrying).
            // Save it first (no-op if already there), so the refund is never lost.
            await recordSale({ ...order, amount_paid: payment.amount }, paymentId);
            await markRefunded(order.notes.ref, paymentId);
          }
        }
      }
    }
  } catch (err) {
    // A non-2xx makes Razorpay retry later, which is what we want for a temporary failure.
    console.error("webhook handling failed", event.event, err?.error || err?.message || err);
    return res.status(500).json({ error: "Try again" });
  }
  res.status(200).json({ ok: true });
}
