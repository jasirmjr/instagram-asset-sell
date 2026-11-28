// Influencer referral tracking: who sent the visitor, which sales they made, and what we owe them.
// Data lives in Upstash Redis (added from Vercel → Storage). Talked to over its REST API, so no extra package.
import crypto from "crypto";

export function normalizeCode(raw) {
  const code = String(raw || "").trim().toLowerCase();
  return /^[a-z0-9_-]{2,30}$/.test(code) ? code : null;
}

export function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// ---------- Redis (Upstash REST) ----------
// The Vercel integration sets KV_REST_API_URL / KV_REST_API_TOKEN, often with a prefix the dashboard
// picks (e.g. STORAGE_KV_REST_API_URL). A direct Upstash setup uses UPSTASH_REDIS_REST_*.
function redisConf() {
  const env = process.env;
  let url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  let token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    for (const name of Object.keys(env)) {
      const m = name.match(/^(.*)KV_REST_API_URL$/);
      if (m && env[name] && env[`${m[1]}KV_REST_API_TOKEN`]) {
        url = env[name];
        token = env[`${m[1]}KV_REST_API_TOKEN`];
        break;
      }
    }
  }
  if (!url || !token) throw new Error("Upstash Redis is not connected (no …KV_REST_API_URL / …KV_REST_API_TOKEN found)");
  return { url: url.replace(/\/+$/, ""), token };
}

// Runs several commands in one round trip. Returns each command's result.
// atomic: all commands succeed or none do (Redis MULTI/EXEC).
// Gives up after 5 s so a slow database never leaves a buyer waiting on "Buy now".
const REDIS_TIMEOUT_MS = 5000;
export async function redis(commands, { atomic = false } = {}) {
  const { url, token } = redisConf();
  const r = await fetch(`${url}/${atomic ? "multi-exec" : "pipeline"}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(data)) throw new Error(`Redis request failed (${r.status})`);
  return data.map((d) => {
    if (d?.error) throw new Error(`Redis: ${d.error}`);
    return d.result;
  });
}

const K = {
  influencers: "ref:influencers", // hash: code → { name, percent, key, active, createdAt }
  visits: (code) => `ref:visits:${code}`,
  sales: (code) => `ref:sales:${code}`, // hash: paymentId → sale JSON
  paid: (code) => `ref:paid:${code}`, // total paid out, in paise
  payouts: (code) => `ref:payouts:${code}`, // list of payout records
};

// ---------- Influencer list (managed from /stats?admin=…) ----------
// Stored in Redis, so adding or changing someone works instantly, without a redeploy.

function parseInfluencer(code, raw) {
  try {
    const d = JSON.parse(raw);
    return { code, name: String(d.name || code), percent: Number(d.percent) || 0, key: String(d.key || ""), active: d.active !== false, createdAt: d.createdAt || 0 };
  } catch {
    return null;
  }
}

// Everyone, paused included, oldest first.
export async function listInfluencers() {
  const [flat] = await redis([["HGETALL", K.influencers]]);
  const list = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) {
    const inf = parseInfluencer(flat[i], flat[i + 1]);
    if (inf) list.push(inf);
  }
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

// A paused influencer's code stops working for new visitors and orders, but their past sales,
// refunds and payouts still count (includePaused).
export async function findInfluencer(raw, { includePaused = false } = {}) {
  const code = normalizeCode(raw);
  if (!code) return null;
  const [stored] = await redis([["HGET", K.influencers, code]]);
  const inf = stored ? parseInfluencer(code, stored) : null;
  return inf && (inf.active || includePaused) ? inf : null;
}

const newKey = () => crypto.randomBytes(16).toString("hex");

function checkFields({ name, percent }) {
  const cleanName = String(name ?? "").trim().slice(0, 60);
  const pct = Number(percent);
  if (!cleanName) return { error: "Enter a name" };
  if (!(pct >= 0 && pct <= 100)) return { error: "Percent must be between 0 and 100" };
  return { name: cleanName, percent: Math.round(pct * 100) / 100 };
}

function store(inf) {
  return JSON.stringify({ name: inf.name, percent: inf.percent, key: inf.key, active: inf.active, createdAt: inf.createdAt });
}

export async function addInfluencer({ name, code: rawCode, percent }) {
  const code = normalizeCode(rawCode);
  if (!code) return { error: "Code must be 2–30 letters, numbers, - or _ (no spaces)" };
  const fields = checkFields({ name, percent });
  if (fields.error) return fields;
  const inf = { code, ...fields, key: newKey(), active: true, createdAt: Date.now() };
  const [added] = await redis([["HSETNX", K.influencers, code, store(inf)]]);
  return added === 1 ? { ok: true } : { error: `The code "${code.toUpperCase()}" is already used` };
}

// patch: { name, percent } and/or { active: true|false } and/or { newKey: true }
export async function updateInfluencer(rawCode, patch) {
  const inf = await findInfluencer(rawCode, { includePaused: true });
  if (!inf) return { error: "Unknown creator code" };
  if (patch.name !== undefined || patch.percent !== undefined) {
    const fields = checkFields({ name: patch.name ?? inf.name, percent: patch.percent ?? inf.percent });
    if (fields.error) return fields;
    Object.assign(inf, fields);
  }
  if (typeof patch.active === "boolean") inf.active = patch.active;
  if (patch.newKey === true) inf.key = newKey();
  await redis([["HSET", K.influencers, inf.code, store(inf)]]);
  return { ok: true };
}

// Removes the influencer and everything recorded for them (visits, sales, payouts), all at once.
// Their code stops working straight away and can be given to someone new later.
export async function deleteInfluencer(rawCode) {
  const inf = await findInfluencer(rawCode, { includePaused: true });
  if (!inf) return { error: "Unknown creator code" };
  const c = inf.code;
  await redis(
    [
      ["HDEL", K.influencers, c],
      ["DEL", K.visits(c), K.sales(c), K.paid(c), K.payouts(c)],
    ],
    { atomic: true }
  );
  return { ok: true };
}

// ---------- Writes ----------

export async function countVisit(code) {
  await redis([["INCR", K.visits(code)]]);
}

// Records a sale for the influencer named in the order notes. Safe to call more than once for the
// same payment (verify-payment and the webhook both call it): HSETNX keeps only the first.
// The commission % is frozen at sale time, so changing someone's % later doesn't rewrite history.
export async function recordSale(order, paymentId) {
  if (!paymentId) return false;
  const inf = await findInfluencer(order?.notes?.ref, { includePaused: true });
  if (!inf) return false;
  const amount = Number(order.amount_paid || order.amount) || 0;
  const sale = {
    at: Date.now(),
    amount,
    percent: inf.percent,
    commission: Math.floor((amount * inf.percent) / 100),
    product: order.notes?.product || "",
    refunded: false,
  };
  const [added] = await redis([["HSETNX", K.sales(inf.code), paymentId, JSON.stringify(sale)]]);
  return added === 1;
}

export async function markRefunded(code, paymentId) {
  const inf = await findInfluencer(code, { includePaused: true });
  if (!inf) return false;
  const [raw] = await redis([["HGET", K.sales(inf.code), paymentId]]);
  if (!raw) return false;
  const sale = JSON.parse(raw);
  if (sale.refunded) return false;
  sale.refunded = true;
  sale.refundedAt = Date.now();
  await redis([["HSET", K.sales(inf.code), paymentId, JSON.stringify(sale)]]);
  return true;
}

export async function recordPayout(code, amountPaise, note) {
  const entry = JSON.stringify({ at: Date.now(), amount: amountPaise, note: String(note || "").slice(0, 100) });
  await redis(
    [
      ["INCRBY", K.paid(code), String(amountPaise)],
      ["LPUSH", K.payouts(code), entry],
    ],
    { atomic: true }
  );
}

// ---------- Reads ----------

export const HOLD_DAYS = 7; // wait this long after a sale before paying for it (refunds / chargebacks)
const DAY = 24 * 60 * 60 * 1000;
const IST_OFFSET = 330 * 60 * 1000;

function istMonthStart(now) {
  const ist = new Date(now + IST_OFFSET);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET;
}

// Summary for one influencer. Payment IDs are never returned: they can restore access to the pack.
export async function influencerStats(inf, { recent = 20 } = {}) {
  const [visits, flatSales, paid, payouts] = await redis([
    ["GET", K.visits(inf.code)],
    ["HGETALL", K.sales(inf.code)],
    ["GET", K.paid(inf.code)],
    ["LRANGE", K.payouts(inf.code), "0", "19"],
  ]);

  const sales = [];
  for (let i = 1; i < (flatSales || []).length; i += 2) {
    try { sales.push(JSON.parse(flatSales[i])); } catch {}
  }
  sales.sort((a, b) => b.at - a.at);

  const now = Date.now();
  const monthStart = istMonthStart(now);
  let count = 0, refunded = 0, earned = 0, thisMonth = 0, ready = 0, salesThisMonth = 0;
  for (const s of sales) {
    if (s.refunded) { refunded++; continue; }
    count++;
    earned += s.commission;
    if (s.at >= monthStart) { thisMonth += s.commission; salesThisMonth++; }
    if (now - s.at >= HOLD_DAYS * DAY) ready += s.commission;
  }
  const visitCount = Number(visits) || 0;
  const paidTotal = Number(paid) || 0;

  return {
    code: inf.code,
    name: inf.name,
    percent: inf.percent,
    active: inf.active,
    holdDays: HOLD_DAYS,
    visits: visitCount,
    sales: count,
    salesThisMonth,
    refunded,
    conversion: visitCount ? Math.round((count / visitCount) * 1000) / 10 : 0,
    earnedTotal: earned,
    earnedThisMonth: thisMonth,
    readyToPay: ready,
    paid: paidTotal,
    owed: Math.max(0, ready - paidTotal),
    recentSales: sales.slice(0, recent).map((s) => ({
      at: s.at, amount: s.amount, commission: s.commission, refunded: s.refunded,
    })),
    payouts: (payouts || []).map((p) => { try { return JSON.parse(p); } catch { return null; } }).filter(Boolean),
  };
}
