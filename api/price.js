import { PRICE_PAISE, FULL_PRICE_PAISE } from "./_lib.js";

// The page shows these, so what's shown always matches what Razorpay will charge.
export default function handler(req, res) {
  res.status(200).json({ fullInr: FULL_PRICE_PAISE / 100, codeInr: PRICE_PAISE / 100 });
}
