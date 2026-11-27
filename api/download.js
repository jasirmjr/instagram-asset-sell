import { verifyToken } from "./_lib.js";

// ASSET_URL pasted into the Vercel dashboard can carry stray spaces, line breaks,
// wrapping quotes or a "ASSET_URL=" prefix. Any of those crash the redirect, so clean it up.
function assetUrl() {
  let raw = String(process.env.ASSET_URL || "").trim();
  raw = raw.replace(/^ASSET_URL\s*=\s*/i, "").replace(/^["']|["']$/g, "").trim();
  const match = raw.match(/https?:\/\/\S+/);
  if (!match) return null;
  try {
    return new URL(match[0]).href; // percent-encodes anything not allowed in a header
  } catch {
    return null;
  }
}

// The real file link (ASSET_URL) lives only on the server.
// Only a valid paid token gets redirected to it.
export default function handler(req, res) {
  const data = verifyToken(req.query?.token);
  if (!data) {
    res.status(403).setHeader("Content-Type", "text/plain");
    return res.send("Access denied. Please purchase first.");
  }
  const url = assetUrl();
  if (!url) {
    console.error("ASSET_URL is missing or not a valid link");
    res.status(500).setHeader("Content-Type", "text/plain");
    return res.send("Download link is not set up yet. Please contact the seller with your Payment ID.");
  }
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, url);
}
