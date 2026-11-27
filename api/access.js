import { verifyToken } from "./_lib.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const data = verifyToken(req.body?.token);
  res.status(200).json(data ? { ok: true, paymentId: data.pid } : { ok: false });
}
