import { verifyToken } from "./_lib.js";

// The real file link (ASSET_URL) lives only on the server.
// Only a valid paid token gets redirected to it.
export default function handler(req, res) {
  const data = verifyToken(req.query?.token);
  if (!data) {
    res.status(403).setHeader("Content-Type", "text/plain");
    return res.send("Access denied. Please purchase first.");
  }
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, process.env.ASSET_URL);
}
