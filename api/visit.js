import { allowRequest, tooMany } from "./_lib.js";
import { findInfluencer, countVisit } from "./_referrals.js";

// Called when a visitor arrives with ?ref=CODE or types a creator code.
// Checks the code and, on that browser's first visit for this code, adds 1 to the influencer's visits.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Thousands of phones can share one IP (Jio/Airtel), so checking a code is allowed often.
  // Only counting visits is limited harder, so one person can't inflate an influencer's numbers.
  if (!allowRequest(req, "visit-check", 600, 10 * 60 * 1000)) return tooMany(res);
  let inf;
  try {
    inf = await findInfluencer(req.body?.ref);
  } catch (err) {
    console.error("visit: lookup failed", err.message);
    return res.status(503).json({ ok: false, error: "Couldn't check the code right now. Please try again." });
  }
  if (!inf) return res.status(404).json({ ok: false, error: "Creator code not found" });
  if (req.body?.first === true && allowRequest(req, "visit-count", 120, 10 * 60 * 1000)) {
    // Visits are just a stat: if Redis is down, still accept the code.
    await countVisit(inf.code).catch((err) => console.error("visit count failed", err.message));
  }
  res.status(200).json({ ok: true, code: inf.code });
}
