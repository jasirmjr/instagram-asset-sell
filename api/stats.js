import { allowRequest, tooMany } from "./_lib.js";
import {
  listInfluencers, findInfluencer, addInfluencer, updateInfluencer,
  influencerStats, recordPayout, safeEqual,
} from "./_referrals.js";

// POST { code, key }  → one influencer's own stats
// POST { admin }      → every influencer (for you), with optional action:
//   { action: "add", name, code, percent }
//   { action: "update", code, name?, percent?, active?, newKey? }
//   { action: "payout", code, amountInr, note }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Limits key guessing.
  if (!allowRequest(req, "stats", 60, 10 * 60 * 1000)) return tooMany(res);
  const body = req.body || {};
  const adminKey = process.env.ADMIN_KEY || "";

  try {
    if (body.admin !== undefined) {
      if (adminKey.length < 12 || !safeEqual(body.admin, adminKey)) {
        return res.status(403).json({ error: "Wrong admin key" });
      }

      let result = { ok: true };
      if (body.action === "add") {
        result = await addInfluencer(body);
      } else if (body.action === "update") {
        result = await updateInfluencer(body.code, {
          name: body.name, percent: body.percent, active: body.active, newKey: body.newKey,
        });
      } else if (body.action === "payout") {
        const inf = await findInfluencer(body.code, { includePaused: true });
        const paise = Math.round(Number(body.amountInr) * 100);
        if (!inf) result = { error: "Unknown creator code" };
        else if (!(paise > 0 && paise <= 10_000_000)) result = { error: "Enter an amount in rupees" };
        else await recordPayout(inf.code, paise, body.note);
      }
      if (result.error) return res.status(400).json({ error: result.error });

      // You (the admin) also get each key, so you can copy and send someone their stats link.
      const list = await Promise.all(
        (await listInfluencers()).map(async (inf) => ({ ...(await influencerStats(inf, { recent: 10 })), key: inf.key }))
      );
      return res.status(200).json({ admin: true, influencers: list });
    }

    const inf = await findInfluencer(body.code, { includePaused: true });
    if (!inf || inf.key.length < 8 || !safeEqual(body.key, inf.key)) {
      return res.status(403).json({ error: "This stats link is not valid" });
    }
    return res.status(200).json({ admin: false, influencer: await influencerStats(inf) });
  } catch (err) {
    console.error("stats failed", err.message);
    return res.status(503).json({ error: "Couldn't load stats right now. Please try again in a minute." });
  }
}
